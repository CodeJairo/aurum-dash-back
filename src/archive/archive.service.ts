import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService, DEFAULT_REQUIRED_DOCUMENTS } from '../settings/settings.service';
import type { Response } from 'express';

function getArchiver(): any {
  try {
    return require('archiver');
  } catch {
    try {
      return require('exceljs/node_modules/archiver');
    } catch {
      return require('../../node_modules/.pnpm/node_modules/archiver');
    }
  }
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

@Injectable()
export class ArchiveService {
  private readonly logger = new Logger(ArchiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Obtiene la estructura jerárquica de carpetas:
   * Año > Mes > Día > Barequero (con sus archivos y checklist de cumplimiento)
   */
  async getArchiveTree(companyId: string) {
    const settings = await this.settingsService.getSettings(companyId);
    const requiredDocs: string[] = (settings.requiredDocuments as string[]) || DEFAULT_REQUIRED_DOCUMENTS;

    // Obtener todas las compras de tipo FORMAL (o que tengan proveedor)
    const purchases = await this.prisma.purchase.findMany({
      where: {
        companyId,
        type: 'FORMAL',
        supplier: { not: null },
      },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { purchaseDate: 'desc' },
    });

    // Mapear formalizadores por documento para enlazar formalizerId si falta
    const vendorDocs = Array.from(new Set(purchases.map((p) => p.vendorDoc?.trim()).filter(Boolean))) as string[];
    const formalizers = await this.prisma.formalizer.findMany({
      where: {
        companyId,
        document: { in: vendorDocs },
      },
      select: {
        id: true,
        document: true,
        name: true,
      },
    });

    const formalizerMap = new Map<string, string>();
    formalizers.forEach((f) => formalizerMap.set(f.document.trim(), f.id));

    // Estructurar árbol en memoria
    const yearsMap = new Map<number, Map<string, Map<string, any[]>>>();

    for (const p of purchases) {
      const date = new Date(p.purchaseDate);
      const year = date.getFullYear();
      const monthIndex = date.getMonth();
      const monthNum = String(monthIndex + 1).padStart(2, '0');
      const monthKey = `${year}-${monthNum}`;
      const monthLabel = `${MONTH_NAMES[monthIndex]} ${year}`;

      const dayNum = String(date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${monthNum}-${dayNum}`;
      const dateFormatted = `${dayNum}/${monthNum}/${year}`;

      if (!yearsMap.has(year)) {
        yearsMap.set(year, new Map());
      }
      const monthsMap = yearsMap.get(year)!;

      if (!monthsMap.has(monthKey)) {
        monthsMap.set(monthKey, new Map());
      }
      const daysMap = monthsMap.get(monthKey)!;

      if (!daysMap.has(dateKey)) {
        daysMap.set(dateKey, []);
      }

      const formalizerId = p.vendorDoc ? formalizerMap.get(p.vendorDoc.trim()) : null;
      const checkedList: string[] = (p.documentChecklist as string[]) || [];
      const checkedCount = requiredDocs.filter((req) => checkedList.includes(req)).length;
      const progressPercent = requiredDocs.length > 0 ? Math.round((checkedCount / requiredDocs.length) * 100) : 100;

      daysMap.get(dateKey)!.push({
        purchaseId: p.id,
        consecutive: p.consecutive || 'S/C',
        formalizerId: formalizerId || null,
        supplier: p.supplier || 'Barequero',
        vendorDoc: p.vendorDoc || '',
        material: p.material,
        grossGrams: Number(p.grossGrams),
        fineGrams: Number(p.fineGrams),
        purity: p.purity ? Number(p.purity) : null,
        totalCost: Number(p.totalCost),
        purchaseDate: p.purchaseDate,
        documentChecklist: checkedList,
        documents: p.documents || [],
        requiredDocuments: requiredDocs,
        checkedCount,
        totalRequired: requiredDocs.length,
        progressPercent,
        isComplete: progressPercent === 100,
      });
    }

    // Convertir Maps a Arrays ordenados
    const resultYears = Array.from(yearsMap.entries())
      .sort(([yA], [yB]) => yB - yA)
      .map(([year, monthsMap]) => {
        const months = Array.from(monthsMap.entries())
          .sort(([mA], [mB]) => mB.localeCompare(mA))
          .map(([monthKey, daysMap]) => {
            const days = Array.from(daysMap.entries())
              .sort(([dA], [dB]) => dB.localeCompare(dA))
              .map(([dateKey, barequeros]) => {
                const dateParts = dateKey.split('-');
                const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                const totalGrams = barequeros.reduce((acc, b) => acc + b.grossGrams, 0);
                return {
                  dateKey,
                  dateFormatted,
                  barequerosCount: barequeros.length,
                  totalGrams: Number(totalGrams.toFixed(2)),
                  barequeros,
                };
              });

            const monthIndex = parseInt(monthKey.split('-')[1], 10) - 1;
            const monthName = `${MONTH_NAMES[monthIndex]} ${year}`;
            return {
              monthKey,
              monthName,
              days,
            };
          });

        return {
          year,
          months,
        };
      });

    return {
      requiredDocuments: requiredDocs,
      years: resultYears,
    };
  }

  /**
   * Sube múltiples documentos asociados a una recepción/compra de un barequero
   */
  async uploadDocuments(
    companyId: string,
    purchaseId: string,
    formalizerId: string | null,
    files: Express.Multer.File[],
    period?: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No se adjuntaron archivos para subir.');
    }

    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, companyId },
    });

    if (!purchase) {
      throw new NotFoundException('Recepción o compra no encontrada.');
    }

    // Si formalizerId no viene, buscarlo por vendorDoc
    let targetFormalizerId = formalizerId;
    if (!targetFormalizerId && purchase.vendorDoc) {
      const formalizer = await this.prisma.formalizer.findFirst({
        where: { companyId, document: purchase.vendorDoc.trim() },
      });
      if (formalizer) {
        targetFormalizerId = formalizer.id;
      }
    }

    // Si aún no existe Formalizer, crearlo automáticamente para mantener consistencia
    if (!targetFormalizerId) {
      const created = await this.prisma.formalizer.create({
        data: {
          companyId,
          name: purchase.supplier || 'Barequero',
          document: purchase.vendorDoc?.trim() || `GEN-${Date.now()}`,
          address: purchase.vendorAddress || 'Chocó, Colombia',
        },
      });
      targetFormalizerId = created.id;
    }

    const uploadedRecords = [];

    for (const file of files) {
      const uploadResult = await this.storageService.uploadFile(
        file,
        `archive/${companyId}/${purchase.id}`,
        '/api/archive/documents/file',
      );

      const doc = await this.prisma.barequeroDocument.create({
        data: {
          companyId,
          formalizerId: targetFormalizerId,
          purchaseId: purchase.id,
          name: file.originalname,
          category: 'SOPORTE_RECEPCION',
          period: period || `${new Date(purchase.purchaseDate).getFullYear()}-${String(new Date(purchase.purchaseDate).getMonth() + 1).padStart(2, '0')}`,
          fileKey: uploadResult.fileKey,
          fileUrl: uploadResult.fileUrl,
          mimeType: uploadResult.mimeType,
          sizeBytes: uploadResult.sizeBytes,
        },
      });

      uploadedRecords.push(doc);
    }

    return uploadedRecords;
  }

  /**
   * Elimina un documento del archivo
   */
  async deleteDocument(companyId: string, documentId: string) {
    const doc = await this.prisma.barequeroDocument.findFirst({
      where: { id: documentId, companyId },
    });

    if (!doc) {
      throw new NotFoundException('Documento no encontrado.');
    }

    await this.storageService.deleteFile(doc.fileKey);
    await this.prisma.barequeroDocument.delete({
      where: { id: documentId },
    });

    return { message: 'Documento eliminado exitosamente.' };
  }

  /**
   * Actualiza el checklist de documentos marcados para una recepción
   */
  async updateChecklist(companyId: string, purchaseId: string, checklist: string[]) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, companyId },
    });

    if (!purchase) {
      throw new NotFoundException('Recepción no encontrada.');
    }

    const updated = await this.prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        documentChecklist: checklist,
      },
    });

    return {
      purchaseId: updated.id,
      documentChecklist: updated.documentChecklist,
    };
  }

  /**
   * Alterna marcar o desmarcar todos los documentos obligatorios
   */
  async toggleAllChecklist(companyId: string, purchaseId: string, checkAll: boolean) {
    const settings = await this.settingsService.getSettings(companyId);
    const requiredDocs: string[] = (settings.requiredDocuments as string[]) || DEFAULT_REQUIRED_DOCUMENTS;

    const newList = checkAll ? requiredDocs : [];

    return this.updateChecklist(companyId, purchaseId, newList);
  }

  /**
   * Empaqueta en formato ZIP y transmite en tiempo real cualquier nivel de carpetas
   * (Año, Mes, Día, Recepción individual o Archivo Completo) sin guardar archivos en disco.
   */
  async streamArchiveZip(
    companyId: string,
    filter: { year?: string; month?: string; date?: string; purchaseId?: string },
    res: Response,
  ) {
    const settings = await this.settingsService.getSettings(companyId);
    const requiredDocs: string[] = (settings.requiredDocuments as string[]) || DEFAULT_REQUIRED_DOCUMENTS;

    const where: any = {
      companyId,
      type: 'FORMAL',
      supplier: { not: null },
    };

    let zipFileName = 'Archivo_General_Completo.zip';

    if (filter.purchaseId) {
      where.id = filter.purchaseId;
      zipFileName = `Expediente_Recepcion_${filter.purchaseId.slice(-6)}.zip`;
    } else if (filter.date) {
      const startOfDay = new Date(`${filter.date}T00:00:00.000Z`);
      const endOfDay = new Date(`${filter.date}T23:59:59.999Z`);
      where.purchaseDate = { gte: startOfDay, lte: endOfDay };
      zipFileName = `Archivo_${filter.date}.zip`;
    } else if (filter.month) {
      const [y, m] = filter.month.split('-').map(Number);
      const startOfMonth = new Date(Date.UTC(y, m - 1, 1));
      const endOfMonth = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
      where.purchaseDate = { gte: startOfMonth, lte: endOfMonth };
      const monthLabel = MONTH_NAMES[m - 1] || `${m}`;
      zipFileName = `Archivo_${monthLabel}_${y}.zip`;
    } else if (filter.year) {
      const y = Number(filter.year);
      const startOfYear = new Date(Date.UTC(y, 0, 1));
      const endOfYear = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
      where.purchaseDate = { gte: startOfYear, lte: endOfYear };
      zipFileName = `Archivo_${y}.zip`;
    }

    const purchases = await this.prisma.purchase.findMany({
      where,
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { purchaseDate: 'desc' },
    });

    if (filter.purchaseId && purchases.length > 0) {
      const p = purchases[0];
      const safeSupplier = this.sanitizeFolderName(p.supplier || 'Barequero');
      const safeDoc = p.vendorDoc ? `_${p.vendorDoc.replace(/[^a-zA-Z0-9]/g, '')}` : '';
      zipFileName = `Expediente_${safeSupplier}${safeDoc}_${p.consecutive || 'SC'}.zip`;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    const archiverModule = getArchiver();
    const archive = archiverModule('zip', { zlib: { level: 5 } });

    archive.on('error', (err: any) => {
      this.logger.error(`Error en stream de archiver: ${err.message}`, err.stack);
      if (!res.headersSent) {
        res.status(500).send({ message: 'Error al generar archivo comprimido.' });
      }
    });

    archive.pipe(res);

    for (const p of purchases) {
      const d = new Date(p.purchaseDate);
      const y = d.getFullYear();
      const mIdx = d.getMonth();
      const mNum = String(mIdx + 1).padStart(2, '0');
      const mName = MONTH_NAMES[mIdx] || `${mNum}`;
      const dayNum = String(d.getDate()).padStart(2, '0');
      const dateStr = `${dayNum}-${mNum}-${y}`;
      const safeSupplier = this.sanitizeFolderName(p.supplier || 'Barequero');
      const safeDoc = p.vendorDoc ? p.vendorDoc.replace(/[^a-zA-Z0-9]/g, '') : '';
      const barequeroFolder = `${safeSupplier}_${safeDoc}`;

      let basePath = '';
      if (filter.purchaseId) {
        basePath = `${barequeroFolder}`;
      } else if (filter.date) {
        basePath = `${dateStr}/${barequeroFolder}`;
      } else if (filter.month) {
        basePath = `${mName}/${dateStr}/${barequeroFolder}`;
      } else {
        basePath = `${y}/${mNum}_${mName}/${dateStr}/${barequeroFolder}`;
      }

      const checkedList: string[] = (p.documentChecklist as string[]) || [];
      const manifestText = this.generateManifestText(p, requiredDocs, checkedList);
      archive.append(manifestText, { name: `${basePath}/resumen_cumplimiento.txt` });

      for (const doc of p.documents) {
        try {
          const fileStream = await this.storageService.getFileStream(doc.fileKey);
          if (fileStream && fileStream.stream) {
            const fileName = this.sanitizeFileName(doc.name || 'documento.pdf');
            archive.append(fileStream.stream, { name: `${basePath}/${fileName}` });
          }
        } catch (streamErr: any) {
          this.logger.warn(`No se pudo leer archivo ${doc.fileKey} para el zip: ${streamErr.message}`);
        }
      }
    }

    await archive.finalize();
  }

  private sanitizeFolderName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '_');
  }

  private sanitizeFileName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_\-\.\(\)\s]/g, '')
      .trim()
      .replace(/\s+/g, '_');
  }

  private generateManifestText(purchase: any, requiredDocs: string[], checkedList: string[]): string {
    const lines = [
      '=================================================================',
      '       EXPEDIENTE DOCUMENTAL Y DE CUMPLIMIENTO DE BAREQUERO      ',
      '=================================================================',
      `Partícipe Barequero: ${purchase.supplier || 'Sin nombre'}`,
      `Documento / Cédula:  ${purchase.vendorDoc || 'Sin documento'}`,
      `Consecutivo Compra:  ${purchase.consecutive || 'S/C'}`,
      `Fecha de Recepción:  ${new Date(purchase.purchaseDate).toLocaleString('es-CO')}`,
      `Gramos Brutos:       ${Number(purchase.grossGrams)} g`,
      `Gramos Finos:        ${Number(purchase.fineGrams)} g`,
      `Ley:                 ${purchase.purity ? Number(purchase.purity) : 'N/A'}`,
      `Valor Liquidado:     $ ${Number(purchase.totalCost).toLocaleString('es-CO')}`,
      '-----------------------------------------------------------------',
      'ESTADO DEL CHECKLIST NORMATIVO:',
    ];

    for (const req of requiredDocs) {
      const isChecked = checkedList.includes(req);
      lines.push(`  [${isChecked ? 'X' : ' '}] ${req} -> ${isChecked ? 'VERIFICADO / COMPLETO' : 'PENDIENTE'}`);
    }

    lines.push('-----------------------------------------------------------------');
    lines.push(`Documentos físicos adjuntos en carpeta: ${purchase.documents?.length || 0}`);
    if (purchase.documents && purchase.documents.length > 0) {
      for (const d of purchase.documents) {
        lines.push(`  - ${d.name} (${(d.sizeBytes / 1024).toFixed(1)} KB) - Subido: ${new Date(d.createdAt).toLocaleDateString('es-CO')}`);
      }
    }
    lines.push('=================================================================');
    return lines.join('\n');
  }

  /**
   * Modifica la fecha de una compra para reubicarla correctamente en la línea de tiempo del archivo documental.
   */
  async updatePurchaseDate(companyId: string, purchaseId: string, purchaseDate: string) {
    if (!purchaseDate) {
      throw new BadRequestException('La fecha no puede estar vacía.');
    }
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, companyId },
    });
    if (!purchase) {
      throw new NotFoundException('Compra no encontrada.');
    }

    const cleanDate = purchaseDate.slice(0, 10);
    const newDate = new Date(`${cleanDate}T12:00:00`);

    return this.prisma.purchase.update({
      where: { id: purchaseId },
      data: { purchaseDate: newDate },
    });
  }
}
