import { Test, TestingModule } from '@nestjs/testing';
import { BatchSettlementExcelService } from './batch-settlement-excel.service';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

describe('BatchSettlementExcelService', () => {
  let service: BatchSettlementExcelService;
  let prisma: {
    batch: { findFirst: jest.Mock };
    company: { findUnique: jest.Mock };
    purchase: { findMany: jest.Mock };
  };

  const mockBatch = {
    id: 'batch-1',
    code: 'LOTE-2026-100',
    material: 'GOLD',
    status: 'OPEN',
    totalGrossGrams: 200,
    totalFineGrams: 180,
    formalizedPurchases: [],
  };

  const mockCompany = {
    id: 'comp-1',
    name: 'Atlas Capital',
    nit: '901234567-1',
  };

  const mockPurchases = [
    {
      id: 'p-1',
      consecutive: 'DH-205',
      material: 'GOLD',
      siigoReceiptNumber: 'RP-2-208',
      purchaseDate: new Date('2026-11-18'),
      deliveryDate: null,
      supplier: 'YULIETH DAINA PALACIOS MORENO',
      vendorDoc: '1003970683',
      grossGrams: 108.9,
      purity: 0.902,
      purityRaw: 902.0,
      fineGrams: 98.23,
    },
    {
      id: 'p-2',
      consecutive: 'DH-207',
      material: 'GOLD',
      siigoReceiptNumber: 'RP-2-210',
      purchaseDate: new Date('2026-11-18'),
      deliveryDate: null,
      supplier: 'ALVARO TEQUIA WASIRUMA',
      vendorDoc: '1078177818',
      grossGrams: 109.45,
      purity: 0.885,
      purityRaw: 885.0,
      fineGrams: 96.86,
    },
    {
      id: 'p-3',
      consecutive: 'DH-210',
      material: 'GOLD',
      siigoReceiptNumber: 'RP-2-213',
      purchaseDate: new Date('2026-11-19'),
      deliveryDate: null,
      supplier: 'DUVANY NACAVERA JIUPA',
      vendorDoc: '1087547985',
      grossGrams: 69.87,
      purity: 0.91758,
      purityRaw: 917.58,
      fineGrams: 64.11,
    },
  ];

  beforeEach(async () => {
    prisma = {
      batch: { findFirst: jest.fn() },
      company: { findUnique: jest.fn() },
      purchase: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchSettlementExcelService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BatchSettlementExcelService>(BatchSettlementExcelService);
  });

  it('debe generar el libro Excel con las 3 pestañas y fórmulas al proveer selectedPurchaseIds', async () => {
    prisma.batch.findFirst.mockResolvedValue(mockBatch);
    prisma.company.findUnique.mockResolvedValue(mockCompany);

    // Primera llamada: seleccionadas (p-1 y p-2)
    // Segunda llamada: candidatas totales (p-1, p-2, p-3)
    prisma.purchase.findMany
      .mockResolvedValueOnce([mockPurchases[0], mockPurchases[1]])
      .mockResolvedValueOnce(mockPurchases);

    const result = await service.generateSettlementWorkbook('comp-1', 'batch-1', ['p-1', 'p-2']);

    expect(result).toBeDefined();
    expect(result.filename).toBe('Atlas_Capital_Liquidacion_Consecutivos_LOTE-2026-100.xlsx');
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);

    // Leer el buffer generado con ExcelJS para verificar estructura
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer as any);

    expect(wb.worksheets.length).toBe(3);
    expect(wb.worksheets[0].name).toBe('Seleccionados (2)');
    expect(wb.worksheets[1].name).toBe('No Seleccionados (1)');
    expect(wb.worksheets[2].name).toBe('Base Completa (3)');

    // Verificar hoja de Seleccionados
    const ws = wb.worksheets[0];
    expect(ws.getCell('B7').value).toBe('DH-205');
    expect(ws.getCell('H7').value).toBe(108.9);
    expect(ws.getCell('I7').value).toBe(902);
    expect(ws.getCell('J7').value).toBe(98.23);

    // Suma acumulada en primera fila
    expect(ws.getCell('K7').value).toEqual({ formula: 'H7', result: 108.9 });
    expect(ws.getCell('L7').value).toEqual({ formula: 'J7', result: 98.23 });

    // Fila 2
    expect(ws.getCell('B8').value).toBe('DH-207');
    expect(ws.getCell('K8').value).toEqual({ formula: 'K7+H8', result: 109.45 });
    expect(ws.getCell('L8').value).toEqual({ formula: 'L7+J8', result: 96.86 });

    // Fila de totales (fila 9 para 2 registros)
    expect(ws.getCell('A9').value).toBe('TOTAL CONSECUTIVOS SELECCIONADOS (2 ACTAS)');
    expect(ws.getCell('H9').value).toEqual({ formula: 'SUM(H7:H8)' });
    expect(ws.getCell('I9').value).toEqual({ formula: 'IF(H9>0,(J9/H9)*1000,0)' });
    expect(ws.getCell('J9').value).toEqual({ formula: 'SUM(J7:J8)' });
  });

  it('debe generar el Excel para un lote cerrado con compras formalizadas históricas', async () => {
    const closedBatch = {
      ...mockBatch,
      status: 'CLOSED',
      formalizedPurchases: [mockPurchases[0]],
    };
    prisma.batch.findFirst.mockResolvedValue(closedBatch);
    prisma.company.findUnique.mockResolvedValue(mockCompany);

    const result = await service.generateSettlementWorkbook('comp-1', 'batch-1');

    expect(result.filename).toBe('Atlas_Capital_Liquidacion_Consecutivos_LOTE-2026-100.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer as any);

    expect(wb.worksheets.length).toBe(1);
    expect(wb.worksheets[0].name).toBe('Seleccionados (1)');
    expect(wb.worksheets[0].getCell('B7').value).toBe('DH-205');
  });
});
