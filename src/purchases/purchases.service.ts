import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {} from 'multer';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { FormalizersService } from '../formalizers/formalizers.service';
import { CapitalService } from '../capital/capital.service';
import { StorageService } from '../storage/storage.service';
import { CreatePurchaseDto, PricingModeDto, PurchaseTypeDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { UpdateHistoricalPurchaseDto } from './dto/update-historical-purchase.dto';
import { UpdateReceptionDto } from './dto/update-reception.dto';
import { CapitalMovementType, MaterialType, PaymentAccount, PaymentStatus, Prisma, Role } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly formalizersService: FormalizersService,
    private readonly capitalService: CapitalService,
    private readonly storageService: StorageService,
  ) {}

  private async getCompanyBarequeroMaxGrams(companyId: string): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { companyId },
      select: { barequeroMaxGrams: true },
    });
    return setting?.barequeroMaxGrams ? Number(setting.barequeroMaxGrams) : 70.9;
  }

  async getNextConsecutive(companyId: string) {
    return this.settingsService.getNextConsecutivePreview(companyId);
  }

  async create(dto: CreatePurchaseDto, currentUser?: any) {
    const companyId = currentUser?.companyId;
    if (!companyId) {
      throw new ForbiddenException('Contexto de empresa (tenant) requerido.');
    }

    const grossGrams = Number(dto.grossGrams);
    const pricePerGram = Number(dto.pricePerGram);
    const purchaseType = dto.type ?? PurchaseTypeDto.ACCOUNTING;

    // Validación de permisos por rol
    if (currentUser?.role === Role.BAREQUERO_OPERATOR && purchaseType !== PurchaseTypeDto.FORMAL) {
      throw new ForbiddenException(
        'El usuario operador únicamente está autorizado para registrar compras a barequeros.',
      );
    }

    // Validación tope máximo legal de compra a barequeros configurado por empresa
    if (purchaseType === PurchaseTypeDto.FORMAL) {
      const barequeroLimit = await this.getCompanyBarequeroMaxGrams(companyId);
      if (grossGrams > barequeroLimit) {
        throw new BadRequestException(
          `El gramaje bruto máximo permitido para una compra a barequero es de ${barequeroLimit} gramos. (Ingresado: ${grossGrams.toFixed(2)} g)`,
        );
      }
    }

    // Normalización de Ley sin redondeo prematuro (ej. 993.96 -> 0.99396)
    let purity: number | null = null;
    let purityRaw: number | null = null;
    if (dto.purity !== undefined && dto.purity !== null) {
      const rawVal = Number(dto.purity);
      if (rawVal > 1) {
        purityRaw = Number(rawVal.toFixed(3));
        purity = rawVal / 1000;
      } else {
        purity = rawVal;
        purityRaw = Number((rawVal * 1000).toFixed(3));
      }
    }

    let fineGrams: number;
    if (dto.fineGrams !== undefined && dto.fineGrams !== null) {
      fineGrams = Number(dto.fineGrams);
    } else if (purity !== null) {
      fineGrams = grossGrams * purity;
    } else {
      fineGrams = grossGrams;
    }

    const pricingMode = dto.pricingMode ?? PricingModeDto.PER_FINE_GRAM;
    // Si viene totalCost explícito (override manual), se respeta; de lo contrario se calcula usando finos redondeados a 2 decimales
    let totalCost: number;
    if (dto.totalCost !== undefined && dto.totalCost !== null) {
      totalCost = Number(dto.totalCost);
    } else {
      const baseGrams = pricingMode === PricingModeDto.PER_FINE_GRAM
        ? Number(fineGrams.toFixed(2))
        : Number(grossGrams.toFixed(2));
      totalCost = Math.round(baseGrams * pricePerGram);
    }

    if (dto.batchId) {
      const batch = await this.prisma.batch.findFirst({
        where: { id: dto.batchId, companyId },
      });
      if (!batch) {
        throw new NotFoundException(`El lote con ID "${dto.batchId}" no existe.`);
      }
      if (batch.status === 'CLOSED') {
        throw new BadRequestException('No se pueden agregar compras a un lote cerrado.');
      }
    }

    // Si es formal, reservar consecutivo atómicamente y tomar snapshot del receptor
    if (purchaseType === PurchaseTypeDto.FORMAL) {
      return this.prisma.$transaction(async (tx) => {
        let consecutive = dto.consecutive?.trim();
        if (consecutive) {
          const exists = await tx.purchase.findFirst({
            where: { companyId, consecutive, type: 'FORMAL' },
          });
          if (exists) {
            throw new ConflictException(`El consecutivo formal "${consecutive}" ya se encuentra registrado.`);
          }
        } else {
          consecutive = await this.settingsService.reserveNextConsecutive(companyId, tx);
        }

        const settings = await tx.systemSetting.findUnique({
          where: { companyId },
        });

        const recipientName = dto.recipientName || settings?.legalName || 'DANIEL CAMILO HERRERA RENTERIA';
        const recipientDoc = dto.recipientDoc || settings?.document || '1.078.000.069';
        const recipientAddress = dto.recipientAddress || settings?.address || 'CR 8 CL 30 8 07';

        if (!dto.vendorPhotoUrl || !dto.vendorPhotoUrl.trim()) {
          throw new BadRequestException('La fotografía del barequero es obligatoria para la recepción de material.');
        }

        const purchase = await tx.purchase.create({
          data: {
            companyId,
            type: 'FORMAL',
            material: dto.material || MaterialType.GOLD,
            consecutive,
            supplier: dto.supplier,
            vendorDoc: dto.vendorDoc,
            vendorAddress: dto.vendorAddress,
            vendorPhone: dto.vendorPhone,
            vendorCity: dto.vendorCity,
            vendorCountry: dto.vendorCountry || 'Colombia',
            recipientName,
            recipientDoc,
            recipientAddress,
            description: dto.description,
            grossGrams: new Prisma.Decimal(grossGrams.toFixed(4)),
            purity: purity !== null ? new Prisma.Decimal(purity.toFixed(6)) : null,
            purityRaw: purityRaw !== null ? new Prisma.Decimal(purityRaw.toFixed(3)) : null,
            fineGrams: new Prisma.Decimal(fineGrams.toFixed(4)),
            pricePerGram: new Prisma.Decimal(pricePerGram.toFixed(2)),
            pricingMode: pricingMode as any,
            totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
            batchId: null,
            purchaseDate: dto.purchaseDate ? new Date(`${dto.purchaseDate.slice(0, 10)}T12:00:00`) : new Date(),
            deliveryDate: dto.deliveryDate ? new Date(`${dto.deliveryDate.slice(0, 10)}T12:00:00`) : new Date(),
            vendorPhotoUrl: dto.vendorPhotoUrl || null,
            vendorPhotoKey: dto.vendorPhotoKey || null,
          },
          include: {
            batch: {
              select: { id: true, code: true, name: true, status: true },
            },
            formalizedBatch: {
              select: { id: true, code: true, name: true, status: true },
            },
          },
        });

        // 1. Auto-crear / registrar persona para formalizar si vienen los datos del Barequero
        if (dto.vendorDoc && dto.supplier) {
          const formalizer = await this.formalizersService.upsertFromBarequero(
            companyId,
            {
              name: dto.supplier,
              document: dto.vendorDoc,
              address: dto.vendorAddress || '',
              phone: dto.vendorPhone || '',
              city: dto.vendorCity || 'Quibdó-Chocó',
              country: dto.vendorCountry || 'Colombia',
            },
            tx,
            dto.updateFormalizerDetails ?? true,
          );

          // Si viene foto del barequero, archivarla también automáticamente en sus documentos del mes
          if (dto.vendorPhotoUrl && formalizer) {
            const months = [
              'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
              'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
            ];
            const pDate = dto.deliveryDate ? new Date(dto.deliveryDate) : new Date();
            const currentPeriod = dto.monthPeriod?.trim() || `${months[pDate.getMonth()]} ${pDate.getFullYear()}`;

            await tx.barequeroDocument.create({
              data: {
                companyId,
                formalizerId: formalizer.id,
                name: `foto_barequero_${formalizer.document}`,
                category: 'FOTO_BAREQUERO',
                period: currentPeriod,
                fileKey: dto.vendorPhotoKey || `companies/${companyId}/barequeros/photos/foto_${formalizer.document}.jpg`,
                fileUrl: dto.vendorPhotoUrl,
                mimeType: 'image/jpeg',
              },
            });
          }
        }

        // Las compras a barequeros NO descuentan el capital de cartera

        return purchase;
      });
    }

    // Modalidad Compra estándar (antes contabilidad)
    return this.prisma.$transaction(async (tx) => {
      let consecutive = dto.consecutive?.trim();
      if (consecutive) {
        const exists = await tx.purchase.findFirst({
          where: { companyId, consecutive, type: 'ACCOUNTING' },
        });
        if (exists) {
          throw new ConflictException(`El consecutivo de compra "${consecutive}" ya se encuentra registrado.`);
        }
      } else {
        const nextNum = await this.settingsService.reserveNextPurchaseNum(companyId, tx);
        consecutive = String(nextNum);
      }

      const paymentMethod = dto.paymentMethod || PaymentAccount.CASH;
      let cashAmountVal: number | null = null;
      let bankAmountVal: number | null = null;

      if (paymentMethod === PaymentAccount.MIXED) {
        cashAmountVal = Number(dto.cashAmount) || 0;
        bankAmountVal = Number(dto.bankAmount) || 0;
        if (cashAmountVal + bankAmountVal !== totalCost && cashAmountVal > 0 && bankAmountVal === 0) {
          bankAmountVal = Math.max(0, Number((totalCost - cashAmountVal).toFixed(2)));
        } else if (cashAmountVal + bankAmountVal !== totalCost && bankAmountVal > 0 && cashAmountVal === 0) {
          cashAmountVal = Math.max(0, Number((totalCost - bankAmountVal).toFixed(2)));
        }
      } else if (paymentMethod === PaymentAccount.BANK) {
        bankAmountVal = totalCost;
      } else {
        cashAmountVal = totalCost;
      }

      const isPaid = (dto.paymentStatus ?? PaymentStatus.PAID) === PaymentStatus.PAID;
      const paymentStatus = isPaid ? PaymentStatus.PAID : PaymentStatus.PENDING;
      const paidAmount = isPaid ? totalCost : 0;
      const pendingAmount = isPaid ? 0 : totalCost;

      const purchase = await tx.purchase.create({
        data: {
          companyId,
          type: 'ACCOUNTING',
          material: dto.material || MaterialType.GOLD,
          consecutive,
          supplier: dto.supplier,
          description: dto.description,
          grossGrams: new Prisma.Decimal(grossGrams.toFixed(4)),
          purity: purity !== null ? new Prisma.Decimal(purity.toFixed(6)) : null,
          purityRaw: purityRaw !== null ? new Prisma.Decimal(purityRaw.toFixed(3)) : null,
          fineGrams: new Prisma.Decimal(fineGrams.toFixed(4)),
          pricePerGram: new Prisma.Decimal(pricePerGram.toFixed(2)),
          pricingMode: pricingMode as any,
          totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
          paymentMethod,
          cashAmount: cashAmountVal !== null ? new Prisma.Decimal(cashAmountVal.toFixed(2)) : null,
          bankAmount: bankAmountVal !== null ? new Prisma.Decimal(bankAmountVal.toFixed(2)) : null,
          paymentStatus,
          paidAmount: new Prisma.Decimal(paidAmount.toFixed(2)),
          pendingAmount: new Prisma.Decimal(pendingAmount.toFixed(2)),
          batchId: dto.batchId ?? null,
          purchaseDate: dto.purchaseDate ? new Date(`${dto.purchaseDate.slice(0, 10)}T12:00:00`) : new Date(),
          deliveryDate: dto.deliveryDate ? new Date(`${dto.deliveryDate.slice(0, 10)}T12:00:00`) : new Date(),
        },
        include: {
          batch: {
            select: { id: true, code: true, name: true, status: true },
          },
        },
      });

      // Registrar descuento del capital de cartera solo si la compra es pagada de contado
      // Si entra como PENDING, queda en Cartera como Cuenta por Pagar (CxP)
      if (isPaid) {
        if (paymentMethod === PaymentAccount.MIXED) {
          if (cashAmountVal && cashAmountVal > 0) {
            await this.capitalService.recordSystemMovement(
              companyId,
              CapitalMovementType.PURCHASE_PAYMENT,
              -cashAmountVal,
              `Pago (Efectivo) compra Nº ${consecutive} - ${dto.supplier || 'Cliente'}`,
              PaymentAccount.CASH,
              purchase.id,
              tx,
            );
          }
          if (bankAmountVal && bankAmountVal > 0) {
            await this.capitalService.recordSystemMovement(
              companyId,
              CapitalMovementType.PURCHASE_PAYMENT,
              -bankAmountVal,
              `Pago (Banco) compra Nº ${consecutive} - ${dto.supplier || 'Cliente'}`,
              PaymentAccount.BANK,
              purchase.id,
              tx,
            );
          }
        } else {
          await this.capitalService.recordSystemMovement(
            companyId,
            CapitalMovementType.PURCHASE_PAYMENT,
            -totalCost,
            `Pago compra Nº ${consecutive} - ${dto.supplier || 'Cliente'}`,
            paymentMethod,
            purchase.id,
            tx,
          );
        }
      }

      if (dto.batchId) {
        await this.recalculateBatch(dto.batchId, tx);
      }

      return purchase;
    });
  }

  async findAll(companyId: string, status?: 'unassigned' | 'assigned', type?: 'ACCOUNTING' | 'FORMAL') {
    const where: Prisma.PurchaseWhereInput = { companyId };
    if (type) {
      where.type = type;
    }

    if (status === 'unassigned') {
      if (type === 'FORMAL') {
        where.formalizedBatchId = null;
        where.isFormalizedHistorically = false;
        where.batchId = null;
        where.grossGrams = { gt: 0 };
      } else if (type === 'ACCOUNTING') {
        where.batchId = null;
      } else {
        where.batchId = null;
        where.formalizedBatchId = null;
        where.isFormalizedHistorically = false;
      }
    } else if (status === 'assigned') {
      if (type === 'FORMAL') {
        where.OR = [
          { formalizedBatchId: { not: null } },
          { isFormalizedHistorically: true },
          { batchId: { not: null } },
        ];
      } else if (type === 'ACCOUNTING') {
        where.batchId = { not: null };
      } else {
        where.OR = [
          { batchId: { not: null } },
          { formalizedBatchId: { not: null } },
          { isFormalizedHistorically: true },
        ];
      }
    }

    const purchases = await this.prisma.purchase.findMany({
      where,
      orderBy: [
        { deliveryDate: 'desc' },
        { purchaseDate: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
        formalizedBatch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });

    // Fallback: Si alguna compra formal no tiene vendorPhotoUrl, resolverla desde los documentos del barequero
    const missingPhotoDocs = [
      ...new Set(
        purchases
          .filter((p) => p.type === 'FORMAL' && !p.vendorPhotoUrl && p.vendorDoc)
          .map((p) => p.vendorDoc!.trim()),
      ),
    ];

    if (missingPhotoDocs.length > 0) {
      const barequeroPhotos = await this.prisma.barequeroDocument.findMany({
        where: {
          companyId,
          category: 'FOTO_BAREQUERO',
          formalizer: {
            document: { in: missingPhotoDocs },
          },
        },
        include: {
          formalizer: {
            select: { document: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const photoMap = new Map<string, { url: string; key: string }>();
      for (const doc of barequeroPhotos) {
        if (doc.formalizer?.document && !photoMap.has(doc.formalizer.document)) {
          photoMap.set(doc.formalizer.document, { url: doc.fileUrl, key: doc.fileKey });
        }
      }

      return purchases.map((p) => {
        if (p.type === 'FORMAL' && !p.vendorPhotoUrl && p.vendorDoc && photoMap.has(p.vendorDoc.trim())) {
          const match = photoMap.get(p.vendorDoc.trim())!;
          return {
            ...p,
            vendorPhotoUrl: match.url,
            vendorPhotoKey: match.key,
          };
        }
        return p;
      });
    }

    return purchases;
  }

  async findOne(companyId: string, id: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, companyId },
      include: {
        batch: true,
        formalizedBatch: true,
      },
    });

    if (!purchase) {
      throw new NotFoundException(`Compra con ID "${id}" no encontrada.`);
    }

    if (purchase.type === 'FORMAL' && !purchase.vendorPhotoUrl && purchase.vendorDoc) {
      const barequeroPhoto = await this.prisma.barequeroDocument.findFirst({
        where: {
          companyId,
          category: 'FOTO_BAREQUERO',
          formalizer: {
            document: purchase.vendorDoc.trim(),
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (barequeroPhoto) {
        return {
          ...purchase,
          vendorPhotoUrl: barequeroPhoto.fileUrl,
          vendorPhotoKey: barequeroPhoto.fileKey,
        };
      }
    }

    return purchase;
  }

  async update(companyId: string, id: string, dto: UpdatePurchaseDto) {
    const existing = await this.findOne(companyId, id);

    if (existing.batch && existing.batch.status === 'CLOSED') {
      throw new BadRequestException('No se puede modificar una compra de un lote cerrado.');
    }

    const grossGrams = dto.grossGrams !== undefined ? Number(dto.grossGrams) : Number(existing.grossGrams);

    if (existing.type === 'FORMAL') {
      const barequeroLimit = await this.getCompanyBarequeroMaxGrams(companyId);
      if (grossGrams > barequeroLimit) {
        throw new BadRequestException(
          `El gramaje bruto máximo permitido para una compra a barequero es de ${barequeroLimit} gramos. (Ingresado: ${grossGrams.toFixed(2)} g)`,
        );
      }
    }
    
    let purity = existing.purity ? Number(existing.purity) : null;
    let purityRaw = existing.purityRaw ? Number(existing.purityRaw) : null;
    if (dto.purity !== undefined) {
      if (dto.purity !== null) {
        const rawVal = Number(dto.purity);
        if (rawVal > 1) {
          purityRaw = Number(rawVal.toFixed(3));
          purity = rawVal / 1000;
        } else {
          purity = rawVal;
          purityRaw = Number((rawVal * 1000).toFixed(3));
        }
      } else {
        purity = null;
        purityRaw = null;
      }
    }

    let fineGrams: number;
    if (dto.fineGrams !== undefined && dto.fineGrams !== null) {
      fineGrams = Number(dto.fineGrams);
    } else if (dto.purity !== undefined && purity !== null) {
      fineGrams = grossGrams * purity;
    } else if (dto.grossGrams !== undefined && purity !== null) {
      fineGrams = grossGrams * purity;
    } else {
      fineGrams = Number(existing.fineGrams);
    }

    // Inmutabilidad absoluta del valor monetario original pactado
    const pricingMode = existing.pricingMode;
    const pricePerGram = Number(existing.pricePerGram);
    const totalCost = Number(existing.totalCost);

    const previousBatchId = existing.batchId;
    const newBatchId = dto.batchId !== undefined ? dto.batchId : previousBatchId;

    const updated = await this.prisma.purchase.update({
      where: { id },
      data: {
        material: dto.material !== undefined ? dto.material : existing.material,
        supplier: dto.supplier !== undefined ? dto.supplier : existing.supplier,
        vendorDoc: dto.vendorDoc !== undefined ? dto.vendorDoc : existing.vendorDoc,
        vendorAddress: dto.vendorAddress !== undefined ? dto.vendorAddress : existing.vendorAddress,
        vendorPhone: dto.vendorPhone !== undefined ? dto.vendorPhone : existing.vendorPhone,
        vendorCity: dto.vendorCity !== undefined ? dto.vendorCity : existing.vendorCity,
        vendorCountry: dto.vendorCountry !== undefined ? dto.vendorCountry : existing.vendorCountry,
        description: dto.description !== undefined ? dto.description : existing.description,
        grossGrams: new Prisma.Decimal(grossGrams.toFixed(4)),
        purity: purity !== null ? new Prisma.Decimal(purity.toFixed(6)) : null,
        purityRaw: purityRaw !== null ? new Prisma.Decimal(purityRaw.toFixed(3)) : null,
        fineGrams: new Prisma.Decimal(fineGrams.toFixed(4)),
        pricePerGram: new Prisma.Decimal(pricePerGram.toFixed(2)),
        pricingMode: pricingMode as any,
        totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
        batchId: newBatchId,
        purchaseDate: dto.purchaseDate ? new Date(`${dto.purchaseDate.slice(0, 10)}T12:00:00`) : existing.purchaseDate,
        deliveryDate: dto.deliveryDate ? new Date(`${dto.deliveryDate.slice(0, 10)}T12:00:00`) : existing.deliveryDate,
      },
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });

    if (previousBatchId) {
      await this.recalculateBatch(previousBatchId);
    }
    if (newBatchId && newBatchId !== previousBatchId) {
      await this.recalculateBatch(newBatchId);
    }

    return updated;
  }

  async updateHistorical(companyId: string, id: string, dto: UpdateHistoricalPurchaseDto) {
    const existing = await this.findOne(companyId, id);

    if (existing.formalizedBatchId) {
      throw new BadRequestException(
        `Esta recepción ya fue utilizada formalmente en el lote ${existing.formalizedBatch?.code || existing.formalizedBatchId} dentro de la plataforma y no se puede alterar su estado histórico.`,
      );
    }

    const dataToUpdate: Prisma.PurchaseUpdateInput = {};

    if (dto.grossGrams !== undefined) {
      dataToUpdate.grossGrams = new Prisma.Decimal(Number(dto.grossGrams).toFixed(4));
    }
    if (dto.purity !== undefined) {
      dataToUpdate.purity = dto.purity !== null ? new Prisma.Decimal(Number(dto.purity).toFixed(6)) : null;
    }
    if (dto.purityRaw !== undefined) {
      dataToUpdate.purityRaw = dto.purityRaw !== null && dto.purityRaw !== undefined ? new Prisma.Decimal(Number(dto.purityRaw).toFixed(3)) : null;
    }
    if (dto.fineGrams !== undefined) {
      dataToUpdate.fineGrams = new Prisma.Decimal(Number(dto.fineGrams).toFixed(4));
    }
    if (dto.pricePerGram !== undefined) {
      dataToUpdate.pricePerGram = new Prisma.Decimal(Number(dto.pricePerGram).toFixed(2));
    }
    if (dto.totalCost !== undefined) {
      dataToUpdate.totalCost = new Prisma.Decimal(Number(dto.totalCost).toFixed(2));
    }
    if (dto.isFormalizedHistorically !== undefined) {
      dataToUpdate.isFormalizedHistorically = dto.isFormalizedHistorically;
    }
    if (dto.purchaseDate) {
      dataToUpdate.purchaseDate = new Date(`${dto.purchaseDate.slice(0, 10)}T12:00:00`);
    }
    if (dto.description !== undefined) {
      dataToUpdate.description = dto.description;
    }

    return this.prisma.purchase.update({
      where: { id },
      data: dataToUpdate,
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
        formalizedBatch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });
  }

  async updateReception(companyId: string, id: string, dto: UpdateReceptionDto) {
    const existing = await this.findOne(companyId, id);

    if (existing.type !== 'FORMAL') {
      throw new BadRequestException('Esta acción solo aplica para recepciones de material (barequeros).');
    }

    const isFormalized = !!existing.formalizedBatchId;

    if (isFormalized) {
      // Si la recepción ya fue formalizada en un lote, solo permitimos corregir el consecutivo, fecha y notas
      const triedToChangeGrams =
        (dto.grossGrams !== undefined && Math.abs(Number(dto.grossGrams) - Number(existing.grossGrams)) > 0.001) ||
        (dto.fineGrams !== undefined && Math.abs(Number(dto.fineGrams) - Number(existing.fineGrams)) > 0.001) ||
        (dto.pricePerGram !== undefined && Math.abs(Number(dto.pricePerGram) - Number(existing.pricePerGram)) > 0.01) ||
        (dto.totalCost !== undefined && Math.abs(Number(dto.totalCost) - Number(existing.totalCost)) > 0.01) ||
        (dto.material !== undefined && dto.material !== existing.material);

      if (triedToChangeGrams) {
        throw new BadRequestException(
          `Esta recepción ya fue utilizada para formalizar el lote ${existing.formalizedBatch?.code || existing.formalizedBatchId}. No se pueden modificar los gramos, precios ni material, únicamente el consecutivo o notas informativas.`,
        );
      }
    }

    // 1. Validar consecutivo único si se envió
    let finalConsecutive = existing.consecutive;
    if (dto.consecutive !== undefined) {
      const cleanConsecutive = dto.consecutive.trim();
      if (!cleanConsecutive) {
        throw new BadRequestException('El consecutivo no puede estar vacío.');
      }
      if (cleanConsecutive.toUpperCase() !== (existing.consecutive || '').toUpperCase()) {
        const duplicate = await this.prisma.purchase.findFirst({
          where: {
            companyId,
            consecutive: { equals: cleanConsecutive, mode: 'insensitive' },
            id: { not: id },
          },
        });
        if (duplicate) {
          throw new ConflictException(`El consecutivo "${cleanConsecutive}" ya está siendo utilizado por otra compra.`);
        }
      }
      finalConsecutive = cleanConsecutive;
    }

    // 2. Gramos brutos
    const grossGrams = dto.grossGrams !== undefined ? Number(dto.grossGrams) : Number(existing.grossGrams);
    const barequeroLimit = await this.getCompanyBarequeroMaxGrams(companyId);
    if (grossGrams > barequeroLimit) {
      throw new BadRequestException(
        `El gramaje bruto máximo permitido para barequeros es ${barequeroLimit} g. (Ingresado: ${grossGrams.toFixed(2)} g)`,
      );
    }

    // 3. Pesaje y Ley sin redondeo prematuro
    let purity = existing.purity ? Number(existing.purity) : null;
    let purityRaw = existing.purityRaw ? Number(existing.purityRaw) : null;
    if (dto.purity !== undefined) {
      if (dto.purity !== null) {
        const rawVal = Number(dto.purity);
        if (rawVal > 1) {
          purityRaw = Number(rawVal.toFixed(3));
          purity = rawVal / 1000;
        } else {
          purity = rawVal;
          purityRaw = Number((rawVal * 1000).toFixed(3));
        }
      } else {
        purity = null;
        purityRaw = null;
      }
    }

    // 4. Gramos finos
    let fineGrams: number;
    if (dto.fineGrams !== undefined && dto.fineGrams !== null) {
      fineGrams = Number(dto.fineGrams);
    } else if (purity !== null) {
      fineGrams = grossGrams * purity;
    } else {
      fineGrams = Number(existing.fineGrams);
    }

    // 5. Modalidad y Precio
    const pricingMode = dto.pricingMode ?? (existing.pricingMode as PricingModeDto);
    const pricePerGram = dto.pricePerGram !== undefined ? Number(dto.pricePerGram) : Number(existing.pricePerGram);

    // 6. Total (Manual Override o Cálculo con finos a 2 decimales)
    let totalCost: number;
    if (dto.totalCost !== undefined && dto.totalCost !== null) {
      totalCost = Number(dto.totalCost);
    } else {
      const baseGrams = pricingMode === PricingModeDto.PER_FINE_GRAM
        ? Number(fineGrams.toFixed(2))
        : Number(grossGrams.toFixed(2));
      totalCost = Math.round(baseGrams * pricePerGram);
    }

    return this.prisma.purchase.update({
      where: { id },
      data: {
        material: dto.material !== undefined ? dto.material : existing.material,
        consecutive: finalConsecutive,
        purchaseDate: dto.purchaseDate
          ? new Date(`${dto.purchaseDate.slice(0, 10)}T12:00:00`)
          : existing.purchaseDate,
        grossGrams: new Prisma.Decimal(grossGrams.toFixed(4)),
        purity: purity !== null ? new Prisma.Decimal(purity.toFixed(6)) : null,
        purityRaw: purityRaw !== null ? new Prisma.Decimal(purityRaw.toFixed(3)) : null,
        fineGrams: new Prisma.Decimal(fineGrams.toFixed(4)),
        pricingMode: pricingMode as any,
        pricePerGram: new Prisma.Decimal(pricePerGram.toFixed(2)),
        totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
        description: dto.description !== undefined ? dto.description : existing.description,
      },
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
        formalizedBatch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });
  }

  async updateMaterial(companyId: string, id: string, material: MaterialType) {
    const purchase = await this.findOne(companyId, id);

    if (purchase.batchId) {
      throw new BadRequestException(
        `No se puede cambiar el material porque la compra ya está asignada al lote ${purchase.batch?.code || purchase.batchId}.`,
      );
    }

    if (purchase.formalizedBatchId) {
      throw new BadRequestException(
        `No se puede cambiar el material porque esta recepción ya fue utilizada para formalizar el lote ${purchase.formalizedBatch?.code || purchase.formalizedBatchId}.`,
      );
    }

    return this.prisma.purchase.update({
      where: { id },
      data: { material },
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
        formalizedBatch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });
  }

  async generateReceiptExcel(companyId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const purchase = await this.findOne(companyId, id);

    const isAccounting = purchase.type === 'ACCOUNTING';
    const templateName = isAccounting ? 'compra.xlsx' : 'recepcion_material.xlsx';

    const templatePath = fs.existsSync(path.join(process.cwd(), 'templates', templateName))
      ? path.join(process.cwd(), 'templates', templateName)
      : path.join(__dirname, '..', '..', 'templates', templateName);

    if (!fs.existsSync(templatePath)) {
      throw new NotFoundException(`No se encontró la plantilla de Excel en: ${templatePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    // Fecha en formato dd/mm/aaaa
    const dateObj = purchase.deliveryDate || purchase.purchaseDate || new Date();
    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const y = dateObj.getFullYear();
    const formattedDate = `${d}/${m}/${y}`;

    // Datos del Metal calculados usando finos redondeados a 2 decimales para total exacto de liquidación
    const grossNum = Number(Number(purchase.grossGrams).toFixed(2));
    const leyNum = purchase.purityRaw !== null && purchase.purityRaw !== undefined
      ? Number(purchase.purityRaw)
      : purchase.purity !== null && purchase.purity !== undefined
        ? Number((Number(purchase.purity) * 1000).toFixed(3))
        : 750;
    const fineNum = Number(Number(purchase.fineGrams).toFixed(2));
    const priceNum = Number(purchase.pricePerGram);
    const totalVal = purchase.totalCost !== null && purchase.totalCost !== undefined
      ? Math.round(Number(purchase.totalCost))
      : Math.round(fineNum * priceNum);

    if (isAccounting) {
      // Plantilla Compra Estándar (compra.xlsx - hoja compra)
      const worksheet = workbook.getWorksheet('compra') || workbook.worksheets[0];
      if (!worksheet) {
        throw new NotFoundException('No se encontró una hoja válida en la plantilla de compra.');
      }

      // Fecha de entrega: G6
      worksheet.getCell('G6').value = formattedDate;

      // CONSECUTIVO Nº: G7 (número entero sin letras)
      const consecNum = Number(purchase.consecutive);
      worksheet.getCell('G7').value = !isNaN(consecNum) && consecNum > 0 ? consecNum : 1;

      // BRUTOS: G9
      worksheet.getCell('G9').value = grossNum;
      worksheet.getCell('G9').numFmt = '0.00##';

      // LEY: G10
      worksheet.getCell('G10').value = leyNum;

      // NOMBRE DEL CLIENTE: C9
      worksheet.getCell('C9').value = purchase.supplier || '';

      // GR FINOS: E15
      worksheet.getCell('E15').value = fineNum;
      worksheet.getCell('E15').numFmt = '0.00##';

      // VALOR GRAMO FINO: F15
      worksheet.getCell('F15').value = priceNum;

      // VALOR TOTAL: G15, G18, G21
      worksheet.getCell('G15').value = totalVal;
      worksheet.getCell('G18').value = totalVal;
      worksheet.getCell('G21').value = totalVal;

      // Configuración de impresión: centrado, tamaño carta y auto-escalado al ancho completo
      worksheet.pageSetup = {
        paperSize: 9, // Carta (Letter)
        orientation: 'portrait',
        printArea: 'B2:G21',
        horizontalCentered: true,
        verticalCentered: true,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      };

      const rawBuffer = await workbook.xlsx.writeBuffer();
      const buffer = Buffer.from(rawBuffer);
      const safeConsecutive = (purchase.consecutive || '1').replace(/[\/\s\\:]+/g, '-');
      const filename = `Liquidacion_Compra_${safeConsecutive}_${y}-${m}-${d}.xlsx`;

      return { buffer, filename };
    }

    // Plantilla Barequero (recepcion_material.xlsx - hoja recepcion)
    const worksheet =
      workbook.getWorksheet('recepcion') ||
      workbook.getWorksheet('FORMATO') ||
      workbook.worksheets[0];

    if (!worksheet) {
      throw new NotFoundException('No se encontró una hoja válida en la plantilla de Excel.');
    }

    // Consecutivo: G7
    worksheet.getCell('G7').value = purchase.consecutive || 'DH-1';

    // Fecha de entrega: G6 en formato dd/mm/aaaa
    worksheet.getCell('G6').value = formattedDate;

    // Partícipe Receptor: C8, C9, C10
    worksheet.getCell('C8').value = purchase.recipientName || 'DANIEL CAMILO HERRERA RENTERIA';
    worksheet.getCell('C9').value = purchase.recipientDoc || '1.078.000.069';
    worksheet.getCell('C10').value = purchase.recipientAddress || 'CR 8 CL 30 8 07';

    // Partícipe Barequero:
    worksheet.getCell('C14').value = purchase.supplier || '';
    worksheet.getCell('C15').value = purchase.vendorDoc || '';
    worksheet.getCell('C16').value = purchase.vendorAddress || '';
    worksheet.getCell('C17').value = purchase.vendorPhone || '';
    worksheet.getCell('C18').value = purchase.vendorCity || 'Quibdó-Chocó';
    worksheet.getCell('C19').value = purchase.vendorCountry || 'Colombia';

    // Datos del Metal:
    worksheet.getCell('G17').value = grossNum;
    worksheet.getCell('G17').numFmt = '0.00##';
    worksheet.getCell('G18').value = leyNum;
    worksheet.getCell('E23').value = fineNum;
    worksheet.getCell('E23').numFmt = '0.00##';
    worksheet.getCell('F23').value = priceNum;
    worksheet.getCell('G23').value = totalVal;
    worksheet.getCell('G26').value = totalVal;
    worksheet.getCell('G29').value = totalVal;

    // Configuración de impresión para acta de barequero
    worksheet.pageSetup = {
      paperSize: 9, // Carta (Letter)
      orientation: 'portrait',
      printArea: 'B2:G29',
      horizontalCentered: true,
      verticalCentered: true,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };

    const rawBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(rawBuffer);
    const safeConsecutive = (purchase.consecutive || 'DH-1').replace(/[\/\s\\:]+/g, '-');
    const filename = `Liquidacion_Compra_${safeConsecutive}_${y}-${m}-${d}.xlsx`;

    return { buffer, filename };
  }

  async remove(companyId: string, id: string) {
    const existing = await this.findOne(companyId, id);
    if (existing.type === 'ACCOUNTING' && existing.batchId) {
      throw new BadRequestException(
        'No se puede eliminar una compra contable asignada a un lote.',
      );
    }
    if (existing.type === 'FORMAL' && existing.formalizedBatchId) {
      throw new BadRequestException(
        'No se puede eliminar una compra a barequero que ya fue utilizada para formalizar un lote.',
      );
    }

    const batchId = existing.batchId;
    const totalCost = Number(existing.totalCost);

    // Si tiene soporte firmado, eliminarlo del almacenamiento S3 / local
    if (existing.signedReceiptKey) {
      await this.storageService.deleteFile(existing.signedReceiptKey);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Eliminar la compra
      await tx.purchase.delete({
        where: { id },
      });

      // 2. Revertir / Reintegrar el capital solo si era compra contable y tenía monto efectivamente pagado
      const paidToRefund = Number(existing.paidAmount ?? existing.totalCost);
      if (existing.type === 'ACCOUNTING' && paidToRefund > 0 && existing.paymentStatus !== 'PENDING') {
        const method = existing.paymentMethod || PaymentAccount.CASH;
        if (method === PaymentAccount.MIXED) {
          const cashPortion = Math.min(paidToRefund, Number(existing.cashAmount || 0));
          const bankPortion = Math.max(0, paidToRefund - cashPortion);
          if (cashPortion > 0) {
            await this.capitalService.recordSystemMovement(
              companyId,
              CapitalMovementType.MANUAL_ADJUSTMENT,
              cashPortion,
              `Reintegro (Efectivo) por eliminación de compra ${existing.consecutive || ''} - ${existing.supplier || 'Proveedor'}`,
              PaymentAccount.CASH,
              existing.id,
              tx,
            );
          }
          if (bankPortion > 0) {
            await this.capitalService.recordSystemMovement(
              companyId,
              CapitalMovementType.MANUAL_ADJUSTMENT,
              bankPortion,
              `Reintegro (Banco) por eliminación de compra ${existing.consecutive || ''} - ${existing.supplier || 'Proveedor'}`,
              PaymentAccount.BANK,
              existing.id,
              tx,
            );
          }
        } else {
          await this.capitalService.recordSystemMovement(
            companyId,
            CapitalMovementType.MANUAL_ADJUSTMENT,
            paidToRefund,
            `Reintegro por eliminación de compra ${existing.consecutive || ''} - ${existing.supplier || 'Proveedor'}`,
            method,
            existing.id,
            tx,
          );
        }
      }

      // 3. Recalcular el lote si estaba asignado a uno
      if (batchId) {
        await this.recalculateBatch(batchId, tx);
      }

      // 4. Actualizar contadores en SystemSetting para reflejar el nuevo máximo activo
      const settings = await this.settingsService.getSettings(companyId);
      const nextFormal = await this.settingsService.calculateNextConsecutiveNum(companyId, settings.consecutivePrefix, tx);
      const nextAcc = await this.settingsService.calculateNextPurchaseNum(companyId, tx);
      await tx.systemSetting.update({
        where: { companyId },
        data: {
          lastConsecutiveNum: Math.max(0, nextFormal - 1),
          lastPurchaseNum: Math.max(0, nextAcc - 1),
        },
      });

      return {
        message: 'Compra eliminada exitosamente y saldo de cartera reintegrado',
        id,
      };
    });
  }

  private async recalculateBatch(batchId: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    const purchases = await client.purchase.findMany({
      where: { batchId },
    });

    let totalGross = new Prisma.Decimal(0);
    let totalFine = new Prisma.Decimal(0);
    let totalInvestment = new Prisma.Decimal(0);

    for (const p of purchases) {
      totalGross = totalGross.plus(p.grossGrams);
      totalFine = totalFine.plus(p.fineGrams);
      totalInvestment = totalInvestment.plus(p.totalCost);
    }

    const avgCostPerFineGram = totalFine.greaterThan(0)
      ? totalInvestment.dividedBy(totalFine)
      : new Prisma.Decimal(0);

    await client.batch.update({
      where: { id: batchId },
      data: {
        totalGrossGrams: totalGross,
        totalFineGrams: totalFine,
        totalInvestment: totalInvestment,
        averageCostPerFineGram: avgCostPerFineGram,
      },
    });
  }

  async uploadSignedReceipt(companyId: string, id: string, file: Express.Multer.File) {
    const purchase = await this.findOne(companyId, id);

    // Si ya tenía un soporte firmado previo, eliminar el archivo anterior
    if (purchase.signedReceiptKey) {
      await this.storageService.deleteFile(purchase.signedReceiptKey);
    }

    const safeConsecutive = purchase.consecutive ? purchase.consecutive.replace(/\s+/g, '_') : purchase.id;
    const prefix = `companies/${companyId}/purchases/${safeConsecutive}`;
    const uploadRes = await this.storageService.uploadFile(
      file,
      prefix,
      `/api/purchases/${purchase.id}/signed-receipt/file`,
    );

    return this.prisma.purchase.update({
      where: { id },
      data: {
        isSigned: true,
        signedReceiptKey: uploadRes.fileKey,
        signedReceiptUrl: uploadRes.fileUrl,
        signedReceiptName: file.originalname || 'recepcion_firmada.pdf',
        signedAt: new Date(),
      },
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
        formalizedBatch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });
  }

  async uploadVendorPhoto(companyId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo de imagen.');
    }
    const prefix = companyId ? `companies/${companyId}/barequeros/photos` : 'barequeros/photos';
    const uploadRes = await this.storageService.uploadFile(
      file,
      prefix,
      '/api/formalizers/documents/file',
    );
    return {
      fileUrl: uploadRes.fileUrl,
      fileKey: uploadRes.fileKey,
    };
  }

  async getSignedReceiptStream(id: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
    });
    if (!purchase || !purchase.signedReceiptKey) {
      throw new NotFoundException('Esta compra no tiene un soporte firmado adjunto.');
    }

    const fileStream = await this.storageService.getFileStream(purchase.signedReceiptKey);
    return {
      ...fileStream,
      filename: purchase.signedReceiptName || 'recepcion_firmada.pdf',
    };
  }

  async removeSignedReceipt(companyId: string, id: string) {
    const purchase = await this.findOne(companyId, id);
    if (purchase.signedReceiptKey) {
      await this.storageService.deleteFile(purchase.signedReceiptKey);
    }

    return this.prisma.purchase.update({
      where: { id },
      data: {
        isSigned: false,
        signedReceiptKey: null,
        signedReceiptUrl: null,
        signedReceiptName: null,
        signedAt: null,
      },
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
        formalizedBatch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });
  }
}
