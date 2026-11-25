import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { StorageService } from '../storage/storage.service';
import { loadCompanyLogo } from '../common/helpers/company-logo.helper';

interface PurchaseItem {
  id: string;
  consecutive?: string | null;
  material?: string;
  siigoReceiptNumber?: string | null;
  purchaseDate: Date;
  deliveryDate?: Date | null;
  supplier?: string | null;
  vendorDoc?: string | null;
  grossGrams: any;
  purity?: any;
  purityRaw?: any;
  fineGrams: any;
  totalCost?: any;
}

@Injectable()
export class BatchSettlementExcelService {
  private readonly logger = new Logger(BatchSettlementExcelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Genera el libro Excel de Liquidación de Consecutivos (Actas a Barequeros)
   * con sumas acumuladas casilla a casilla, formato institucional y pestañas detalladas.
   */
  async generateSettlementWorkbook(
    companyId: string,
    batchId: string,
    selectedPurchaseIds?: string[],
  ): Promise<{ buffer: Buffer; filename: string }> {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId },
      include: {
        formalizedPurchases: {
          orderBy: { consecutive: 'asc' },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Lote con ID "${batchId}" no encontrado.`);
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, nit: true, slug: true },
    });
    const companyName = company?.name || 'Compraventa';

    let selectedPurchases: PurchaseItem[] = [];
    let unselectedPurchases: PurchaseItem[] = [];
    let allPurchases: PurchaseItem[] = [];

    const isLiveSelection = selectedPurchaseIds && selectedPurchaseIds.length > 0;

    if (isLiveSelection) {
      // 1. Caso en vivo (modal antes de vender el lote):
      selectedPurchases = (await this.prisma.purchase.findMany({
        where: { id: { in: selectedPurchaseIds }, companyId },
        orderBy: { consecutive: 'asc' },
      })) as unknown as PurchaseItem[];

      // Obtener todas las compras barequeros disponibles para este lote / material
      const candidatePurchases = (await this.prisma.purchase.findMany({
        where: {
          companyId,
          type: 'FORMAL',
          material: batch.material,
          OR: [
            { formalizedBatchId: null },
            { formalizedBatchId: batch.id },
            { id: { in: selectedPurchaseIds } },
          ],
          grossGrams: { gt: 0 },
        },
        orderBy: { consecutive: 'asc' },
      })) as unknown as PurchaseItem[];

      const selectedIdSet = new Set(selectedPurchaseIds);
      unselectedPurchases = candidatePurchases.filter((p) => !selectedIdSet.has(p.id));
      allPurchases = candidatePurchases;
    } else {
      // 2. Caso histórico (lote cerrado con formalizaciones ya registradas):
      if (batch.formalizedPurchases && batch.formalizedPurchases.length > 0) {
        selectedPurchases = batch.formalizedPurchases as unknown as PurchaseItem[];
        allPurchases = selectedPurchases;
      } else {
        // Si no tiene compras formalizadas (lote cerrado con compras directas o sin formalización),
        // consultar compras directas asociadas al lote
        const associated = await this.prisma.purchase.findMany({
          where: { batchId: batch.id, companyId },
          orderBy: { consecutive: 'asc' },
        });
        selectedPurchases = associated as unknown as PurchaseItem[];
        allPurchases = selectedPurchases;
      }
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = companyName;
    workbook.created = new Date();

    // Logo de la empresa (si tiene uno configurado); si no, el Excel se genera sin logo
    let logoImageId: number | null = null;
    try {
      const logo = await loadCompanyLogo(this.prisma, this.storageService, companyId);
      if (logo) {
        logoImageId = workbook.addImage({
          base64: logo.buffer.toString('base64'),
          extension: logo.extension,
        });
      }
    } catch (err) {
      this.logger.warn(`No se pudo cargar el logo para el Excel: ${String(err)}`);
    }

    // Hoja 1: Seleccionados
    this.buildWorksheet({
      workbook,
      sheetName: `Seleccionados (${selectedPurchases.length})`,
      titleType: `LIQUIDACIÓN DE CONSECUTIVOS SELECCIONADOS (${selectedPurchases.length} REGISTROS)`,
      totalLabel: `TOTAL CONSECUTIVOS SELECCIONADOS (${selectedPurchases.length} ACTAS)`,
      purchases: selectedPurchases,
      companyName,
      logoImageId,
      batchCode: batch.code,
    });

    // Hoja 2: No Seleccionados (si aplica en selección en vivo)
    if (unselectedPurchases.length > 0) {
      this.buildWorksheet({
        workbook,
        sheetName: `No Seleccionados (${unselectedPurchases.length})`,
        titleType: `CONSECUTIVOS NO SELECCIONADOS (${unselectedPurchases.length} REGISTROS)`,
        totalLabel: `TOTAL NO SELECCIONADOS (${unselectedPurchases.length} ACTAS)`,
        purchases: unselectedPurchases,
        companyName,
        logoImageId,
        batchCode: batch.code,
      });

      // Hoja 3: Base Completa
      this.buildWorksheet({
        workbook,
        sheetName: `Base Completa (${allPurchases.length})`,
        titleType: `BASE COMPLETA DE REGISTROS (${allPurchases.length} REGISTROS)`,
        totalLabel: `TOTAL BASE COMPLETA (${allPurchases.length} ACTAS)`,
        purchases: allPurchases,
        companyName,
        logoImageId,
        batchCode: batch.code,
      });
    }

    const uint8Array = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(uint8Array);
    const safeCode = (batch.code || batchId).replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = BatchSettlementExcelService.buildFilename(company?.slug, safeCode);

    return { buffer, filename };
  }

  /** Nombre del archivo: Liquidacion_Consecutivos_<empresa>_<lote>.xlsx */
  static buildFilename(companySlug: string | null | undefined, safeBatchCode: string): string {
    const safeSlug = (companySlug || '').replace(/[^a-zA-Z0-9-_]/g, '_');
    return safeSlug
      ? `Liquidacion_Consecutivos_${safeSlug}_${safeBatchCode}.xlsx`
      : `Liquidacion_Consecutivos_${safeBatchCode}.xlsx`;
  }

  private buildWorksheet(params: {
    workbook: ExcelJS.Workbook;
    sheetName: string;
    titleType: string;
    totalLabel: string;
    purchases: PurchaseItem[];
    companyName: string;
    logoImageId: number | null;
    batchCode: string;
  }) {
    const { workbook, sheetName, titleType, totalLabel, purchases, companyName, logoImageId, batchCode } = params;

    const ws = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
    });

    // 1. Definición de Columnas y Anchos
    ws.columns = [
      { key: 'index', width: 6 },
      { key: 'consecutive', width: 15 },
      { key: 'material', width: 10 },
      { key: 'rp', width: 15 },
      { key: 'date', width: 13 },
      { key: 'supplier', width: 36 },
      { key: 'doc', width: 16 },
      { key: 'grossGrams', width: 18 },
      { key: 'purity', width: 13 },
      { key: 'fineGrams', width: 18 },
      { key: 'cumGross', width: 22 },
      { key: 'cumFine', width: 22 },
    ];

    // 2. Banner Superior Corporativo (Filas 1 a 4)
    ws.getRow(1).height = 24;
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 16;
    ws.getRow(4).height = 18;
    ws.getRow(5).height = 8; // Espaciador

    const bannerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' }, // Navy oscuro corporativo
    };

    // Pintar fondo del banner de A1 a L4
    for (let r = 1; r <= 4; r++) {
      for (let c = 1; c <= 12; c++) {
        const cell = ws.getCell(r, c);
        cell.fill = bannerFill;
      }
    }

    // Incrustar Logo si está disponible (A1:B4)
    if (logoImageId !== null) {
      try {
        ws.addImage(logoImageId, {
          tl: { col: 0.2, row: 0.15 },
          ext: { width: 125, height: 70 },
          editAs: 'oneCell',
        });
      } catch (err) {
        this.logger.warn(`No se pudo agregar el logo en la hoja ${sheetName}: ${err}`);
      }
    }

    // Calcular rango de corte de fechas
    let dateRangeStr = 'N/A';
    if (purchases.length > 0) {
      const dates = purchases
        .map((p) => (p.deliveryDate ? new Date(p.deliveryDate) : p.purchaseDate ? new Date(p.purchaseDate) : null))
        .filter((d): d is Date => d !== null && !isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());

      if (dates.length > 0) {
        const minD = this.formatDate(dates[0]);
        const maxD = this.formatDate(dates[dates.length - 1]);
        dateRangeStr = minD === maxD ? minD : `${minD} – ${maxD}`;
      }
    }

    // Textos del Banner en C1:L1 hasta C4:L4
    ws.mergeCells('C1:L1');
    const titleCell = ws.getCell('C1');
    titleCell.value = `${companyName.toUpperCase()} — COMERCIALIZADORA DE ORO Y METALES`;
    titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFF59E0B' } }; // Ámbar / Dorado
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

    ws.mergeCells('C2:L2');
    const subCell = ws.getCell('C2');
    subCell.value = `${titleType} • LOTE: ${batchCode}`;
    subCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'left' };

    ws.mergeCells('C3:L3');
    const descCell = ws.getCell('C3');
    descCell.value = 'Detalle individual con suma acumulada casilla a casilla de Gramos Brutos y Gramos Finos';
    descCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFCBD5E1' } };
    descCell.alignment = { vertical: 'middle', horizontal: 'left' };

    ws.mergeCells('C4:L4');
    const cutCell = ws.getCell('C4');
    cutCell.value = `Corte de registros: ${dateRangeStr}  |  Unidad de peso: Gramos (g)`;
    cutCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF94A3B8' } };
    cutCell.alignment = { vertical: 'middle', horizontal: 'left' };

    // 3. Encabezados de Tabla (Fila 6)
    ws.getRow(6).height = 26;
    const headers = [
      '#',
      'Consecutivo',
      'Metal',
      'Registro RP',
      'Fecha',
      'Partícipe Barequero',
      'CC / NIT',
      'Gramos Brutos (g)',
      'Ley (‰)',
      'Gramos Finos (g)',
      'Suma Acum. Brutos (g)',
      'Suma Acum. Finos (g)',
    ];

    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }, // Slate azul oscuro
    };

    const headerBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
    };

    headers.forEach((h, idx) => {
      const cell = ws.getCell(6, idx + 1);
      cell.value = h;
      cell.fill = headerFill;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = headerBorder;
    });

    // 4. Filas de Datos (Fila 7 en adelante)
    const dataBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };

    const startRow = 7;
    const count = purchases.length;

    purchases.forEach((p, idx) => {
      const rowIdx = startRow + idx;
      const row = ws.getRow(rowIdx);
      row.height = 20;

      const gross = Number(Number(p.grossGrams || 0).toFixed(2));
      const fine = Number(Number(p.fineGrams || 0).toFixed(2));

      // Calcular Ley en milésimas (‰)
      let leyNum = 0;
      if (p.purityRaw !== null && p.purityRaw !== undefined && Number(p.purityRaw) > 0) {
        leyNum = Number(Number(p.purityRaw).toFixed(2));
      } else if (p.purity !== null && p.purity !== undefined && Number(p.purity) > 0) {
        leyNum = Number((Number(p.purity) * 1000).toFixed(2));
      } else if (gross > 0 && fine > 0) {
        leyNum = Number(((fine / gross) * 1000).toFixed(2));
      }

      const pDate = p.deliveryDate ? new Date(p.deliveryDate) : p.purchaseDate ? new Date(p.purchaseDate) : null;
      const dateStr = pDate ? this.formatDate(pDate) : '-';

      const isZebra = idx % 2 === 1;
      const rowFill: ExcelJS.Fill | undefined = isZebra
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
        : undefined;

      // Col A: #
      const cA = row.getCell(1);
      cA.value = idx + 1;
      cA.alignment = { vertical: 'middle', horizontal: 'center' };

      // Col B: Consecutivo
      const cB = row.getCell(2);
      cB.value = p.consecutive || `S/N-${idx + 1}`;
      cB.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cB.alignment = { vertical: 'middle', horizontal: 'center' };

      // Col C: Metal
      const cC = row.getCell(3);
      cC.value = p.material === 'PLATINUM' ? 'Platino' : 'Oro';
      cC.alignment = { vertical: 'middle', horizontal: 'center' };

      // Col D: Registro RP
      const cD = row.getCell(4);
      cD.value = p.siigoReceiptNumber?.trim() || '-';
      cD.alignment = { vertical: 'middle', horizontal: 'center' };

      // Col E: Fecha
      const cE = row.getCell(5);
      cE.value = dateStr;
      cE.alignment = { vertical: 'middle', horizontal: 'center' };

      // Col F: Partícipe Barequero
      const cF = row.getCell(6);
      cF.value = (p.supplier || 'Barequero').trim().toUpperCase();
      cF.alignment = { vertical: 'middle', horizontal: 'left' };

      // Col G: CC / NIT
      const cG = row.getCell(7);
      cG.value = (p.vendorDoc || '-').trim();
      cG.alignment = { vertical: 'middle', horizontal: 'center' };

      // Col H: Gramos Brutos (g)
      const cH = row.getCell(8);
      cH.value = gross;
      cH.numFmt = '#,##0.00';
      cH.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col I: Ley (‰)
      const cI = row.getCell(9);
      cI.value = leyNum;
      cI.numFmt = '#,##0.00';
      cI.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col J: Gramos Finos (g)
      const cJ = row.getCell(10);
      cJ.value = fine;
      cJ.numFmt = '#,##0.00';
      cJ.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col K: Suma Acumulada Brutos
      const cK = row.getCell(11);
      if (idx === 0) {
        cK.value = { formula: `H${rowIdx}`, result: gross };
      } else {
        cK.value = { formula: `K${rowIdx - 1}+H${rowIdx}`, result: gross };
      }
      cK.font = { name: 'Calibri', size: 10, bold: true };
      cK.numFmt = '#,##0.00';
      cK.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col L: Suma Acumulada Finos
      const cL = row.getCell(12);
      if (idx === 0) {
        cL.value = { formula: `J${rowIdx}`, result: fine };
      } else {
        cL.value = { formula: `L${rowIdx - 1}+J${rowIdx}`, result: fine };
      }
      cL.font = { name: 'Calibri', size: 10, bold: true };
      cL.numFmt = '#,##0.00';
      cL.alignment = { vertical: 'middle', horizontal: 'right' };

      // Bordes y fondo para toda la fila
      for (let col = 1; col <= 12; col++) {
        const c = row.getCell(col);
        c.border = dataBorder;
        if (rowFill) c.fill = rowFill;
      }
    });

    // 5. Fila de Totales (Fila startRow + count)
    if (count > 0) {
      const totalRowIdx = startRow + count;
      const lastDataRow = totalRowIdx - 1;
      const totalRow = ws.getRow(totalRowIdx);
      totalRow.height = 24;

      ws.mergeCells(`A${totalRowIdx}:G${totalRowIdx}`);
      const cLabel = ws.getCell(`A${totalRowIdx}`);
      cLabel.value = totalLabel;
      cLabel.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cLabel.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col H: Total Brutos
      const cH = totalRow.getCell(8);
      cH.value = { formula: `SUM(H${startRow}:H${lastDataRow})` };
      cH.font = { name: 'Calibri', size: 10, bold: true };
      cH.numFmt = '#,##0.00';
      cH.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col I: Ley Promedio Ponderada = (Total Finos / Total Brutos) * 1000
      const cI = totalRow.getCell(9);
      cI.value = { formula: `IF(H${totalRowIdx}>0,(J${totalRowIdx}/H${totalRowIdx})*1000,0)` };
      cI.font = { name: 'Calibri', size: 10, bold: true };
      cI.numFmt = '#,##0.00';
      cI.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col J: Total Finos
      const cJ = totalRow.getCell(10);
      cJ.value = { formula: `SUM(J${startRow}:J${lastDataRow})` };
      cJ.font = { name: 'Calibri', size: 10, bold: true };
      cJ.numFmt = '#,##0.00';
      cJ.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col K: Total Acumulado Brutos (Igual al total de brutos)
      const cK = totalRow.getCell(11);
      cK.value = { formula: `H${totalRowIdx}` };
      cK.font = { name: 'Calibri', size: 10, bold: true };
      cK.numFmt = '#,##0.00';
      cK.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col L: Total Acumulado Finos (Igual al total de finos)
      const cL = totalRow.getCell(12);
      cL.value = { formula: `J${totalRowIdx}` };
      cL.font = { name: 'Calibri', size: 10, bold: true };
      cL.numFmt = '#,##0.00';
      cL.alignment = { vertical: 'middle', horizontal: 'right' };

      const totalFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' }, // Gris suave profesional
      };

      const totalBorder: Partial<ExcelJS.Borders> = {
        top: { style: 'thin', color: { argb: 'FF475569' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } }, // Doble raya contable
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      for (let col = 1; col <= 12; col++) {
        const c = totalRow.getCell(col);
        c.fill = totalFill;
        c.border = totalBorder;
      }
    }
  }

  private formatDate(date: Date): string {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  }
}
