import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {} from 'multer';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { VinculacionExcelService } from './vinculacion-excel.service';
import { CreateFormalizerDto } from './dto/create-formalizer.dto';
import { CompleteVinculacionDto } from './dto/complete-vinculacion.dto';
import { FormalizerStatus, Prisma } from '@prisma/client';
import { DEFAULT_REQUIRED_DOCUMENTS } from '../settings/settings.service';
import {
  REQUIRED_BAREQUERO_DOCUMENT_CATEGORIES,
  evaluateBarequeroDocuments,
} from './constants/barequero-documents.config';

@Injectable()
export class FormalizersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly vinculacionExcelService: VinculacionExcelService,
  ) {}

  async findAll(companyId: string, status?: 'AVAILABLE' | 'USED') {
    const formalizers = await this.prisma.formalizer.findMany({
      where: {
        companyId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        usedInBatch: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    // Obtener documentos requeridos vigentes definidos en Ajustes
    const setting = await this.prisma.systemSetting.findUnique({
      where: { companyId },
      select: { requiredDocuments: true },
    });
    const requiredDocs: string[] =
      (setting?.requiredDocuments as string[])?.filter((d) => d !== 'Soporte de Pago / Recepción') ||
      DEFAULT_REQUIRED_DOCUMENTS;

    // Mapear historial de fechas de compra para ubicación en el Archivo y checklist
    const docList = formalizers.map((f) => f.document.trim()).filter(Boolean);
    const purchases = await this.prisma.purchase.findMany({
      where: {
        companyId,
        type: 'FORMAL',
        vendorDoc: { in: docList },
      },
      select: {
        id: true,
        vendorDoc: true,
        consecutive: true,
        purchaseDate: true,
        grossGrams: true,
        fineGrams: true,
        documentChecklist: true,
      },
      orderBy: { purchaseDate: 'desc' },
    });

    const purchasesByDoc = new Map<string, any[]>();
    for (const p of purchases) {
      if (!p.vendorDoc) continue;
      const key = p.vendorDoc.trim();
      if (!purchasesByDoc.has(key)) {
        purchasesByDoc.set(key, []);
      }
      const d = new Date(p.purchaseDate);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      purchasesByDoc.get(key)!.push({
        id: p.id,
        consecutive: p.consecutive || 'S/C',
        purchaseDate: p.purchaseDate,
        dateKey: `${year}-${month}-${day}`,
        dateFormatted: `${day}/${month}/${year}`,
        grossGrams: Number(p.grossGrams),
        fineGrams: Number(p.fineGrams),
        documentChecklist: (p.documentChecklist as string[]) || [],
      });
    }

    return formalizers.map((f) => {
      const barequeroPurchases = purchasesByDoc.get(f.document.trim()) || [];
      const allChecked = new Set<string>();
      for (const p of barequeroPurchases) {
        if (Array.isArray(p.documentChecklist)) {
          p.documentChecklist.forEach((item: string) => allChecked.add(item));
        }
      }

      const checkedCount = requiredDocs.filter((req) => allChecked.has(req)).length;
      const totalRequired = requiredDocs.length;
      const isComplete = totalRequired > 0 && checkedCount === totalRequired;
      const percent = totalRequired > 0 ? Math.round((checkedCount / totalRequired) * 100) : 100;

      return {
        ...f,
        purchases: barequeroPurchases,
        checklistStats: {
          checkedCount,
          totalRequired,
          isComplete,
          percent,
          hasPurchases: barequeroPurchases.length > 0,
        },
      };
    });
  }

  async findAvailable(companyId: string) {
    return this.prisma.formalizer.findMany({
      where: {
        companyId,
        status: FormalizerStatus.AVAILABLE,
      },
      orderBy: { name: 'asc' },
    });
  }

  getRequiredDocumentsConfig() {
    return REQUIRED_BAREQUERO_DOCUMENT_CATEGORIES;
  }

  async findByDocument(companyId: string, document: string) {
    const docClean = (document || '').replace(/[^\d]/g, '').trim();
    if (!docClean) return null;

    return this.prisma.formalizer.findFirst({
      where: { companyId, document: docClean },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async completeVinculacion(companyId: string, idOrDoc: string, dto: CompleteVinculacionDto) {
    const docClean = dto.document.replace(/[^\d]/g, '').trim();

    let formalizer = await this.prisma.formalizer.findFirst({
      where: {
        companyId,
        OR: [{ id: idOrDoc }, { document: docClean }],
      },
    });

    const fullName = `${dto.firstName} ${dto.firstLastName} ${dto.secondLastName || ''}`.trim().toUpperCase();

    if (!formalizer) {
      formalizer = await this.prisma.formalizer.create({
        data: {
          companyId,
          name: fullName,
          document: docClean,
          address: dto.address.trim(),
          phone: dto.phone?.trim() || null,
          city: dto.city?.trim() || 'Quibdó-Chocó',
          country: 'Colombia',
          status: FormalizerStatus.AVAILABLE,
        },
      });
    }

    const setting = await this.prisma.systemSetting.findUnique({
      where: { companyId },
    });
    const defaultCity = setting?.city || 'Quibdó';

    const excelBuffer = await this.vinculacionExcelService.generateVinculacionWorkbook(dto, defaultCity);

    const fileName = `Formulario_Vinculacion_${docClean}.xlsx`;
    const uploadRes = await this.storageService.uploadBuffer(
      excelBuffer,
      fileName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      `companies/${companyId}/barequeros/${docClean}`,
      '/api/formalizers/documents/file',
    );

    const existingVinculacionDoc = await this.prisma.barequeroDocument.findFirst({
      where: {
        companyId,
        formalizerId: formalizer.id,
        category: 'FORMULARIO_VINCULACION',
      },
    });

    if (existingVinculacionDoc) {
      await this.prisma.barequeroDocument.update({
        where: { id: existingVinculacionDoc.id },
        data: {
          fileKey: uploadRes.fileKey,
          fileUrl: uploadRes.fileUrl,
          sizeBytes: uploadRes.sizeBytes,
          mimeType: uploadRes.mimeType,
        },
      });
    } else {
      await this.prisma.barequeroDocument.create({
        data: {
          companyId,
          formalizerId: formalizer.id,
          name: `Formulario Único de Vinculación - ${docClean}.xlsx`,
          category: 'FORMULARIO_VINCULACION',
          period: null,
          fileKey: uploadRes.fileKey,
          fileUrl: uploadRes.fileUrl,
          mimeType: uploadRes.mimeType,
          sizeBytes: uploadRes.sizeBytes,
        },
      });
    }

    return this.prisma.formalizer.update({
      where: { id: formalizer.id },
      data: {
        name: fullName,
        firstName: dto.firstName.trim().toUpperCase(),
        firstLastName: dto.firstLastName.trim().toUpperCase(),
        secondLastName: dto.secondLastName ? dto.secondLastName.trim().toUpperCase() : null,
        idType: dto.idType || 'CC',
        nationality: dto.nationality || 'Colombiana',
        docIssueDate: dto.docIssueDate ? new Date(dto.docIssueDate) : null,
        docIssuePlace: dto.docIssuePlace || null,
        address: dto.address.trim(),
        phone: dto.phone || null,
        city: dto.city || formalizer.city,
        miningMunicipality: dto.miningMunicipality || null,
        miningDepartment: dto.miningDepartment || 'Chocó',
        email: dto.email || null,
        ciiuCode: dto.ciiuCode || '0729',
        declaresRent: dto.declaresRent ?? false,
        monthlyIncome: dto.monthlyIncome !== undefined && dto.monthlyIncome !== null ? new Prisma.Decimal(Number(dto.monthlyIncome).toFixed(2)) : null,
        incomeConcept: dto.incomeConcept || null,
        monthlyExpenses: dto.monthlyExpenses !== undefined && dto.monthlyExpenses !== null ? new Prisma.Decimal(Number(dto.monthlyExpenses).toFixed(2)) : null,
        expenseConcept: dto.expenseConcept || null,
        isPep: dto.isPep ?? false,
        hasVinculacionForm: true,
        vinculacionFormUrl: uploadRes.fileUrl,
        vinculacionFormKey: uploadRes.fileKey,
        vinculatedAt: new Date(),
        vinculacionData: dto as any,
      },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async create(companyId: string, dto: CreateFormalizerDto) {
    const docClean = dto.document.trim();
    const existing = await this.prisma.formalizer.findFirst({
      where: { companyId, document: docClean },
    });

    if (existing) {
      throw new ConflictException(`Ya existe una persona registrada con el documento "${docClean}".`);
    }

    return this.prisma.formalizer.create({
      data: {
        companyId,
        name: dto.name.trim(),
        document: docClean,
        address: dto.address.trim(),
        phone: dto.phone?.trim() || '',
        city: dto.city?.trim() || 'Quibdó-Chocó',
        country: dto.country?.trim() || 'Colombia',
        status: FormalizerStatus.AVAILABLE,
      },
    });
  }

  async upsertFromBarequero(
    companyId: string,
    data: {
      name: string;
      document: string;
      address: string;
      phone?: string;
      city?: string;
      country?: string;
    },
    txClient?: Prisma.TransactionClient,
    allowUpdate: boolean = true,
  ) {
    const client = txClient || this.prisma;
    const docClean = data.document.trim();

    const existing = await client.formalizer.findFirst({
      where: { companyId, document: docClean },
    });

    if (!existing) {
      return client.formalizer.create({
        data: {
          companyId,
          name: data.name.trim(),
          document: docClean,
          address: data.address.trim(),
          phone: data.phone?.trim() || '',
          city: data.city?.trim() || 'Quibdó-Chocó',
          country: data.country?.trim() || 'Colombia',
          status: FormalizerStatus.AVAILABLE,
        },
      });
    }

    if (!allowUpdate) {
      return existing;
    }

    return client.formalizer.update({
      where: { id: existing.id },
      data: {
        name: data.name.trim() || existing.name,
        address: data.address.trim() || existing.address,
        phone: data.phone !== undefined ? data.phone.trim() : existing.phone,
        city: data.city?.trim() || existing.city,
      },
    });
  }

  async markAsUsed(
    companyId: string,
    personIds: string[],
    batchId: string,
    txClient: Prisma.TransactionClient,
  ) {
    const persons = await txClient.formalizer.findMany({
      where: {
        companyId,
        id: { in: personIds },
      },
    });

    if (persons.length !== personIds.length) {
      throw new ConflictException(
        'Una o más de las personas seleccionadas no fueron encontradas en el sistema.',
      );
    }

    const now = new Date();
    await txClient.formalizer.updateMany({
      where: { companyId, id: { in: personIds } },
      data: {
        usedInBatchId: batchId,
        usedAt: now,
      },
    });
  }

  async findOne(companyId: string, id: string) {
    const formalizer = await this.prisma.formalizer.findFirst({
      where: { id, companyId },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        usedInBatch: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    if (!formalizer) {
      throw new NotFoundException(`Barequero con ID "${id}" no encontrado.`);
    }

    return formalizer;
  }

  async update(
    companyId: string,
    id: string,
    data: {
      name?: string;
      phone?: string;
      address?: string;
      city?: string;
      country?: string;
    },
  ) {
    await this.findOne(companyId, id);
    return this.prisma.formalizer.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name.trim() : undefined,
        phone: data.phone !== undefined ? data.phone.trim() : undefined,
        address: data.address !== undefined ? data.address.trim() : undefined,
        city: data.city !== undefined ? data.city.trim() : undefined,
        country: data.country !== undefined ? data.country.trim() : undefined,
      },
      include: {
        documents: true,
        usedInBatch: true,
      },
    });
  }

  async toggleBlock(companyId: string, id: string, reason?: string) {
    const formalizer = await this.findOne(companyId, id);
    const willBlock = !formalizer.isBlocked;

    return this.prisma.formalizer.update({
      where: { id },
      data: {
        isBlocked: willBlock,
        blockedReason: willBlock ? (reason?.trim() || null) : null,
        blockedAt: willBlock ? new Date() : null,
      },
      include: {
        documents: true,
        usedInBatch: true,
      },
    });
  }

  private generateDocumentName(category: string, documentNumber: string, originalName?: string): string {
    const categoryMap: Record<string, string> = {
      CEDULA_FRONT: 'cedula_frontal',
      CEDULA_BACK: 'cedula_posterior',
      RUT: 'rut',
      CERTIFICADO_BANCARIO: 'certificado_bancario',
      OTRO: 'documento',
    };
    const prefix = categoryMap[category] || 'documento';
    const cleanDoc = (documentNumber || '').replace(/[^a-zA-Z0-9]/g, '');
    const ext = originalName && originalName.includes('.')
      ? path.extname(originalName).toLowerCase()
      : '.pdf';
    return `${prefix}_${cleanDoc}${ext}`;
  }

  async addDocument(
    companyId: string,
    formalizerId: string,
    file: Express.Multer.File,
    category: string = 'OTRO',
    customName?: string,
    period?: string,
  ) {
    const formalizer = await this.findOne(companyId, formalizerId);

    const uploadRes = await this.storageService.uploadFile(
      file,
      `companies/${companyId}/barequeros/${formalizer.document}`,
    );

    const docName =
      customName?.trim() ||
      this.generateDocumentName(category, formalizer.document, file.originalname);

    const createdDoc = await this.prisma.barequeroDocument.create({
      data: {
        companyId,
        formalizerId: formalizer.id,
        name: docName,
        category: category || 'OTRO',
        period: period?.trim() || null,
        fileKey: uploadRes.fileKey,
        fileUrl: uploadRes.fileUrl,
        mimeType: uploadRes.mimeType,
        sizeBytes: uploadRes.sizeBytes,
      },
    });

    if (category === 'FOTO_BAREQUERO') {
      try {
        await this.prisma.purchase.updateMany({
          where: {
            companyId,
            vendorDoc: formalizer.document,
            vendorPhotoUrl: null,
          },
          data: {
            vendorPhotoUrl: uploadRes.fileUrl,
            vendorPhotoKey: uploadRes.fileKey,
          },
        });
      } catch {
        // No bloquear la subida si falla la actualización en compras
      }
    }

    return createdDoc;
  }

  async getDocumentById(docId: string) {
    return this.prisma.barequeroDocument.findUnique({
      where: { id: docId },
    });
  }

  async deleteDocument(companyId: string, formalizerId: string, documentId: string) {
    const doc = await this.prisma.barequeroDocument.findFirst({
      where: { id: documentId, formalizerId, companyId },
    });

    if (!doc) {
      throw new NotFoundException('Documento no encontrado.');
    }

    await this.storageService.deleteFile(doc.fileKey);

    await this.prisma.barequeroDocument.delete({
      where: { id: documentId },
    });

    return { message: 'Documento eliminado exitosamente', id: documentId };
  }

  async getDocumentFileStream(fileKey: string) {
    return this.storageService.getFileStream(fileKey);
  }

  async cleanupUnused(companyId: string) {
    // 1. Barequeros con usedInBatchId no nulo
    const preservedByBatch = await this.prisma.formalizer.findMany({
      where: {
        companyId,
        usedInBatchId: { not: null },
      },
      select: { document: true },
    });

    // 2. Barequeros que tienen compras asociadas a un lote (batchId o formalizedBatchId no nulo)
    const purchasesWithBatch = await this.prisma.purchase.findMany({
      where: {
        companyId,
        OR: [
          { batchId: { not: null } },
          { formalizedBatchId: { not: null } },
        ],
        vendorDoc: { not: null },
      },
      select: { vendorDoc: true },
    });

    const protectedDocs = new Set<string>();
    for (const f of preservedByBatch) {
      if (f.document) protectedDocs.add(f.document.trim());
    }
    for (const p of purchasesWithBatch) {
      if (p.vendorDoc) protectedDocs.add(p.vendorDoc.trim());
    }

    // Barequeros a eliminar: sin usedInBatchId y cuyo documento no pertenezca a ningún lote
    const toDelete = await this.prisma.formalizer.findMany({
      where: {
        companyId,
        usedInBatchId: null,
        document: { notIn: Array.from(protectedDocs) },
      },
      select: { id: true },
    });

    const idsToDelete = toDelete.map((f) => f.id);

    if (idsToDelete.length === 0) {
      return {
        success: true,
        count: 0,
        message: 'No se encontraron barequeros sin lote asociado para depurar.',
      };
    }

    // Eliminar documentos asociados para mantener integridad referencial
    await this.prisma.barequeroDocument.deleteMany({
      where: { formalizerId: { in: idsToDelete } },
    });

    // Eliminar formalizadores no utilizados
    const deletedResult = await this.prisma.formalizer.deleteMany({
      where: { id: { in: idsToDelete }, companyId },
    });

    return {
      success: true,
      count: deletedResult.count,
      message: `Se eliminaron exitosamente ${deletedResult.count} barequeros sin lote asociado.`,
    };
  }
}
