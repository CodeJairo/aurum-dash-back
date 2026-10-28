import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { FormalizersService } from '../formalizers/formalizers.service';
import { CapitalService } from '../capital/capital.service';
import { CreatePurchaseDto, PricingModeDto, PurchaseTypeDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { CapitalMovementType, Prisma } from '@prisma/client';
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
  ) {}

  async getNextConsecutive() {
    return this.settingsService.getNextConsecutivePreview();
  }

  async create(dto: CreatePurchaseDto) {
    const grossGrams = Number(dto.grossGrams);
    const pricePerGram = Number(dto.pricePerGram);
    const purchaseType = dto.type ?? PurchaseTypeDto.ACCOUNTING;

    // Normalización de Ley (si escribe 750 -> 0.750)
    let purity: number | null = null;
    let purityRaw: number | null = null;
    if (dto.purity !== undefined && dto.purity !== null) {
      const rawVal = Number(dto.purity);
      if (rawVal > 1) {
        purityRaw = Math.round(rawVal);
        purity = Number((rawVal / 1000).toFixed(4));
      } else {
        purity = Number(rawVal.toFixed(4));
        purityRaw = Math.round(rawVal * 1000);
      }
    }

    let fineGrams: number;
    if (dto.fineGrams !== undefined && dto.fineGrams !== null) {
      fineGrams = Number(Number(dto.fineGrams).toFixed(4));
    } else if (purity !== null) {
      fineGrams = Number((grossGrams * purity).toFixed(4));
    } else {
      fineGrams = grossGrams;
    }

    const pricingMode = dto.pricingMode ?? PricingModeDto.PER_FINE_GRAM;
    const baseGrams = pricingMode === PricingModeDto.PER_FINE_GRAM ? fineGrams : grossGrams;
    const totalCost = baseGrams * pricePerGram;

    if (dto.batchId) {
      const batch = await this.prisma.batch.findUnique({
        where: { id: dto.batchId },
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
        if (!consecutive) {
          consecutive = await this.settingsService.reserveNextConsecutive(tx);
        }

        const settings = await tx.systemSetting.findUnique({
          where: { id: 'company_profile' },
        });

        const recipientName = dto.recipientName || settings?.legalName || 'DANIEL CAMILO HERRERA RENTERIA';
        const recipientDoc = dto.recipientDoc || settings?.document || '1.078.000.069';
        const recipientAddress = dto.recipientAddress || settings?.address || 'CR 8 CL 30 8 07';

        const purchase = await tx.purchase.create({
          data: {
            type: 'FORMAL',
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
            purity: purity !== null ? new Prisma.Decimal(purity.toFixed(4)) : null,
            purityRaw,
            fineGrams: new Prisma.Decimal(fineGrams.toFixed(4)),
            pricePerGram: new Prisma.Decimal(pricePerGram.toFixed(2)),
            pricingMode: pricingMode as any,
            totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
            batchId: dto.batchId ?? null,
            purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
            deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : new Date(),
          },
          include: {
            batch: {
              select: { id: true, code: true, name: true, status: true },
            },
          },
        });

        // 1. Auto-crear / registrar persona para formalizar si vienen los datos del Barequero
        if (dto.vendorDoc && dto.supplier) {
          await this.formalizersService.upsertFromBarequero(
            {
              name: dto.supplier,
              document: dto.vendorDoc,
              address: dto.vendorAddress || '',
              phone: dto.vendorPhone || '',
              city: dto.vendorCity || 'Quibdó-Chocó',
              country: dto.vendorCountry || 'Colombia',
            },
            tx,
          );
        }

        // 2. Registrar descuento del capital de cartera
        await this.capitalService.recordSystemMovement(
          CapitalMovementType.PURCHASE_PAYMENT,
          -totalCost,
          `Pago compra formal ${consecutive} - ${dto.supplier || 'Barequero'}`,
          purchase.id,
          tx,
        );

        if (dto.batchId) {
          await this.recalculateBatch(dto.batchId, tx);
        }

        return purchase;
      });
    }

    // Modalidad Compra estándar (antes contabilidad)
    return this.prisma.$transaction(async (tx) => {
      const nextNum = await this.settingsService.reserveNextPurchaseNum(tx);
      const consecutive = String(nextNum);

      const purchase = await tx.purchase.create({
        data: {
          type: 'ACCOUNTING',
          consecutive,
          supplier: dto.supplier,
          description: dto.description,
          grossGrams: new Prisma.Decimal(grossGrams.toFixed(4)),
          purity: purity !== null ? new Prisma.Decimal(purity.toFixed(4)) : null,
          purityRaw,
          fineGrams: new Prisma.Decimal(fineGrams.toFixed(4)),
          pricePerGram: new Prisma.Decimal(pricePerGram.toFixed(2)),
          pricingMode: pricingMode as any,
          totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
          batchId: dto.batchId ?? null,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
          deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : new Date(),
        },
        include: {
          batch: {
            select: { id: true, code: true, name: true, status: true },
          },
        },
      });

      // Registrar descuento del capital de cartera
      await this.capitalService.recordSystemMovement(
        CapitalMovementType.PURCHASE_PAYMENT,
        -totalCost,
        `Pago compra Nº ${consecutive} - ${dto.supplier || 'Cliente'}`,
        purchase.id,
        tx,
      );

      if (dto.batchId) {
        await this.recalculateBatch(dto.batchId, tx);
      }

      return purchase;
    });
  }

  async findAll(status?: 'unassigned' | 'assigned') {
    const where: Prisma.PurchaseWhereInput = {};
    if (status === 'unassigned') {
      where.batchId = null;
    } else if (status === 'assigned') {
      where.batchId = { not: null };
    }

    return this.prisma.purchase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        batch: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        batch: true,
      },
    });

    if (!purchase) {
      throw new NotFoundException(`Compra con ID "${id}" no encontrada.`);
    }

    return purchase;
  }

  async update(id: string, dto: UpdatePurchaseDto) {
    const existing = await this.findOne(id);

    if (existing.batch && existing.batch.status === 'CLOSED') {
      throw new BadRequestException('No se puede modificar una compra de un lote cerrado.');
    }

    const grossGrams = dto.grossGrams !== undefined ? Number(dto.grossGrams) : Number(existing.grossGrams);
    const pricePerGram = dto.pricePerGram !== undefined ? Number(dto.pricePerGram) : Number(existing.pricePerGram);
    
    let purity = existing.purity ? Number(existing.purity) : null;
    let purityRaw = existing.purityRaw;
    if (dto.purity !== undefined) {
      if (dto.purity !== null) {
        const rawVal = Number(dto.purity);
        if (rawVal > 1) {
          purityRaw = Math.round(rawVal);
          purity = Number((rawVal / 1000).toFixed(4));
        } else {
          purity = Number(rawVal.toFixed(4));
          purityRaw = Math.round(rawVal * 1000);
        }
      } else {
        purity = null;
        purityRaw = null;
      }
    }

    let fineGrams: number;
    if (dto.fineGrams !== undefined && dto.fineGrams !== null) {
      fineGrams = Number(Number(dto.fineGrams).toFixed(4));
    } else if (dto.purity !== undefined && purity !== null) {
      fineGrams = Number((grossGrams * purity).toFixed(4));
    } else if (dto.grossGrams !== undefined && purity !== null) {
      fineGrams = Number((grossGrams * purity).toFixed(4));
    } else {
      fineGrams = Number(existing.fineGrams);
    }

    const pricingMode = dto.pricingMode ?? (existing.pricingMode as PricingModeDto);
    const baseGrams = pricingMode === PricingModeDto.PER_FINE_GRAM ? fineGrams : grossGrams;
    const totalCost = baseGrams * pricePerGram;

    const previousBatchId = existing.batchId;
    const newBatchId = dto.batchId !== undefined ? dto.batchId : previousBatchId;

    const updated = await this.prisma.purchase.update({
      where: { id },
      data: {
        supplier: dto.supplier !== undefined ? dto.supplier : existing.supplier,
        vendorDoc: dto.vendorDoc !== undefined ? dto.vendorDoc : existing.vendorDoc,
        vendorAddress: dto.vendorAddress !== undefined ? dto.vendorAddress : existing.vendorAddress,
        vendorPhone: dto.vendorPhone !== undefined ? dto.vendorPhone : existing.vendorPhone,
        vendorCity: dto.vendorCity !== undefined ? dto.vendorCity : existing.vendorCity,
        vendorCountry: dto.vendorCountry !== undefined ? dto.vendorCountry : existing.vendorCountry,
        description: dto.description !== undefined ? dto.description : existing.description,
        grossGrams: new Prisma.Decimal(grossGrams.toFixed(4)),
        purity: purity !== null ? new Prisma.Decimal(purity.toFixed(4)) : null,
        purityRaw,
        fineGrams: new Prisma.Decimal(fineGrams.toFixed(4)),
        pricePerGram: new Prisma.Decimal(pricePerGram.toFixed(2)),
        pricingMode: pricingMode as any,
        totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
        batchId: newBatchId,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : existing.purchaseDate,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : existing.deliveryDate,
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

  async generateReceiptExcel(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const purchase = await this.findOne(id);

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

    // Datos del Metal calculados a 2 decimales
    const grossNum = Number(Number(purchase.grossGrams).toFixed(2));
    const leyNum = purchase.purityRaw
      ? Number(purchase.purityRaw)
      : purchase.purity
        ? Math.round(Number(purchase.purity) * 1000)
        : 750;
    const fineNum = Number(Number(purchase.fineGrams).toFixed(2));
    const priceNum = Number(purchase.pricePerGram);
    const totalVal = Math.round(fineNum * priceNum);

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
      worksheet.getCell('G9').numFmt = '0.00';

      // LEY: G10
      worksheet.getCell('G10').value = leyNum;

      // NOMBRE DEL CLIENTE: C9
      worksheet.getCell('C9').value = purchase.supplier || '';

      // GR FINOS: E15
      worksheet.getCell('E15').value = fineNum;
      worksheet.getCell('E15').numFmt = '0.00';

      // VALOR GRAMO FINO: F15
      worksheet.getCell('F15').value = priceNum;

      // VALOR TOTAL: G15, G18, G21
      worksheet.getCell('G15').value = totalVal;
      worksheet.getCell('G18').value = totalVal;
      worksheet.getCell('G21').value = totalVal;

      const rawBuffer = await workbook.xlsx.writeBuffer();
      const buffer = Buffer.from(rawBuffer);
      const filename = `Compra_${purchase.consecutive || '1'}.xlsx`;

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
    worksheet.getCell('G17').numFmt = '0.00';
    worksheet.getCell('G18').value = leyNum;
    worksheet.getCell('E23').value = fineNum;
    worksheet.getCell('E23').numFmt = '0.00';
    worksheet.getCell('F23').value = priceNum;
    worksheet.getCell('G23').value = totalVal;
    worksheet.getCell('G26').value = totalVal;
    worksheet.getCell('G29').value = totalVal;

    const rawBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(rawBuffer);
    const filename = `${purchase.consecutive || 'Acta_Barequero'}.xlsx`;

    return { buffer, filename };
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    if (existing.batch && existing.batch.status === 'CLOSED') {
      throw new BadRequestException('No se puede eliminar una compra de un lote cerrado.');
    }

    const batchId = existing.batchId;
    await this.prisma.purchase.delete({
      where: { id },
    });

    if (batchId) {
      await this.recalculateBatch(batchId);
    }

    return { message: 'Compra eliminada exitosamente', id };
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
}
