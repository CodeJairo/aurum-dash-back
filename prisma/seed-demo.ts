import { PrismaClient, Role, BatchStatus, PricingMode, PurchaseType, FormalizerStatus, CapitalMovementType, ExpenseCategory } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- INICIANDO SEED DEMO: SIMULACIÓN COMERCIAL ATLAS CAPITAL ---');

  // 1. Asegurar Usuarios
  console.log('1. Verificando usuarios Daniel y Andrés...');
  const danielPass = process.env.DANIEL_PASSWORD || 'password123';
  const andresPass = process.env.ANDRES_PASSWORD || 'password123';

  const danielHashedPassword = bcrypt.hashSync(danielPass, 10);
  const andresHashedPassword = bcrypt.hashSync(andresPass, 10);

  const daniel = await prisma.user.upsert({
    where: { email: 'daniel@aurumdash.com' },
    update: {
      username: 'daniel',
      name: 'Daniel',
      password: danielHashedPassword,
      role: Role.ADMIN,
      profitSharePercent: 50.0,
      isActive: true,
    },
    create: {
      username: 'daniel',
      email: 'daniel@aurumdash.com',
      name: 'Daniel',
      password: danielHashedPassword,
      role: Role.ADMIN,
      profitSharePercent: 50.0,
      isActive: true,
    },
  });

  const andres = await prisma.user.upsert({
    where: { email: 'andres@aurumdash.com' },
    update: {
      username: 'andres',
      name: 'Andres',
      password: andresHashedPassword,
      role: Role.VIEWER,
      profitSharePercent: 50.0,
      isActive: true,
    },
    create: {
      username: 'andres',
      email: 'andres@aurumdash.com',
      name: 'Andres',
      password: andresHashedPassword,
      role: Role.VIEWER,
      profitSharePercent: 50.0,
      isActive: true,
    },
  });

  // 2. Clean Reset de Tablas Comerciales
  console.log('2. Limpiando datos comerciales previos (Clean Reset)...');
  await prisma.settlement.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.barequeroDocument.deleteMany();
  await prisma.capitalMovement.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.formalizer.deleteMany();
  await prisma.batch.deleteMany();

  // 3. Tesorería y Capital Inicial
  console.log('3. Inicializando Tesorería y Capital Base ($100.000.000 COP)...');
  const initialCapital = 100000000;

  await prisma.systemSetting.upsert({
    where: { id: 'company_profile' },
    update: {
      legalName: 'DANIEL CAMILO HERRERA RENTERIA',
      document: '1.078.000.069',
      address: 'CR 8 CL 30 8 07',
      city: 'Quibdó',
      country: 'Colombia',
      consecutivePrefix: 'DH-',
      lastConsecutiveNum: 5,
      lastPurchaseNum: 1006,
      currentCapital: initialCapital,
    },
    create: {
      id: 'company_profile',
      legalName: 'DANIEL CAMILO HERRERA RENTERIA',
      document: '1.078.000.069',
      address: 'CR 8 CL 30 8 07',
      city: 'Quibdó',
      country: 'Colombia',
      consecutivePrefix: 'DH-',
      lastConsecutiveNum: 5,
      lastPurchaseNum: 1006,
      currentCapital: initialCapital,
    },
  });

  let runningBalance = initialCapital;
  const initialDate = new Date();
  initialDate.setDate(initialDate.getDate() - 15);

  await prisma.capitalMovement.create({
    data: {
      type: CapitalMovementType.CAPITAL_INJECTION,
      amount: initialCapital,
      balanceBefore: 0,
      balanceAfter: initialCapital,
      description: 'Aporte de Capital Inicial de Socios (Daniel 50% / Andrés 50%)',
      createdAt: initialDate,
    },
  });

  // 4. Directorio de Barequeros & Expedientes Documentales
  console.log('4. Creando Directorio de Barequeros con Expedientes Documentales...');
  
  // Barequero 1: Completo
  const barequero1 = await prisma.formalizer.create({
    data: {
      name: 'Jairo Esteban Herrera Rentería',
      document: '1077996729',
      address: 'CL 9 SUR 79C 115',
      city: 'Quibdó-Chocó',
      phone: '3128492019',
      status: FormalizerStatus.AVAILABLE,
      documents: {
        create: [
          { name: 'Cedula_Frontal_Jairo_Herrera.pdf', category: 'CEDULA_FRONT', fileKey: 'demo/cedula_f1.pdf', fileUrl: '/demo/cedula.pdf', mimeType: 'application/pdf', sizeBytes: 245000 },
          { name: 'Cedula_Posterior_Jairo_Herrera.pdf', category: 'CEDULA_BACK', fileKey: 'demo/cedula_b1.pdf', fileUrl: '/demo/cedula.pdf', mimeType: 'application/pdf', sizeBytes: 240000 },
          { name: 'RUT_Jairo_Herrera_2026.pdf', category: 'RUT', fileKey: 'demo/rut_1.pdf', fileUrl: '/demo/rut.pdf', mimeType: 'application/pdf', sizeBytes: 520000 },
          { name: 'Certificacion_Bancolombia_Jairo.pdf', category: 'CERTIFICADO_BANCARIO', fileKey: 'demo/cert_1.pdf', fileUrl: '/demo/cert.pdf', mimeType: 'application/pdf', sizeBytes: 180000 },
        ],
      },
    },
  });

  // Barequero 2: Completo
  const barequero2 = await prisma.formalizer.create({
    data: {
      name: 'Luz Marina Mosquera Palacios',
      document: '35894120',
      address: 'Barrio Kennedy Calle 4',
      city: 'Istmina-Chocó',
      phone: '3147829103',
      status: FormalizerStatus.AVAILABLE,
      documents: {
        create: [
          { name: 'Cedula_Frontal_Luz_Marina.jpg', category: 'CEDULA_FRONT', fileKey: 'demo/cedula_f2.jpg', fileUrl: '/demo/cedula.jpg', mimeType: 'image/jpeg', sizeBytes: 310000 },
          { name: 'Cedula_Posterior_Luz_Marina.jpg', category: 'CEDULA_BACK', fileKey: 'demo/cedula_b2.jpg', fileUrl: '/demo/cedula.jpg', mimeType: 'image/jpeg', sizeBytes: 305000 },
          { name: 'RUT_Luz_Marina_2026.pdf', category: 'RUT', fileKey: 'demo/rut_2.pdf', fileUrl: '/demo/rut.pdf', mimeType: 'application/pdf', sizeBytes: 490000 },
          { name: 'Certificado_Bancario_Luz_Marina.pdf', category: 'CERTIFICADO_BANCARIO', fileKey: 'demo/cert_2.pdf', fileUrl: '/demo/cert.pdf', mimeType: 'application/pdf', sizeBytes: 195000 },
        ],
      },
    },
  });

  // Barequero 3: Incompleto (Falta RUT y Certificado Bancario)
  const barequero3 = await prisma.formalizer.create({
    data: {
      name: 'Yeferson Perea Murillo',
      document: '1077482910',
      address: 'Sector San José',
      city: 'Condoto-Chocó',
      phone: '3206748192',
      status: FormalizerStatus.AVAILABLE,
      documents: {
        create: [
          { name: 'Cedula_Front_Yeferson.pdf', category: 'CEDULA_FRONT', fileKey: 'demo/cedula_f3.pdf', fileUrl: '/demo/cedula.pdf', mimeType: 'application/pdf', sizeBytes: 210000 },
          { name: 'Cedula_Back_Yeferson.pdf', category: 'CEDULA_BACK', fileKey: 'demo/cedula_b3.pdf', fileUrl: '/demo/cedula.pdf', mimeType: 'application/pdf', sizeBytes: 205000 },
        ],
      },
    },
  });

  // Barequero 4: Completo (Utilizado en Lote 1)
  const barequero4 = await prisma.formalizer.create({
    data: {
      name: 'Darlenis Córdoba Rivas',
      document: '1184729102',
      address: 'Carrera 5ta con Calle 12',
      city: 'Tadó-Chocó',
      phone: '3119048261',
      status: FormalizerStatus.USED,
      usedAt: new Date(Date.now() - 7 * 86400000),
      documents: {
        create: [
          { name: 'Cedula_Front_Darlenis.pdf', category: 'CEDULA_FRONT', fileKey: 'demo/cedula_f4.pdf', fileUrl: '/demo/cedula.pdf', mimeType: 'application/pdf', sizeBytes: 220000 },
          { name: 'Cedula_Back_Darlenis.pdf', category: 'CEDULA_BACK', fileKey: 'demo/cedula_b4.pdf', fileUrl: '/demo/cedula.pdf', mimeType: 'application/pdf', sizeBytes: 215000 },
          { name: 'RUT_Darlenis_2026.pdf', category: 'RUT', fileKey: 'demo/rut_4.pdf', fileUrl: '/demo/rut.pdf', mimeType: 'application/pdf', sizeBytes: 510000 },
          { name: 'Cert_Bancario_Darlenis.pdf', category: 'CERTIFICADO_BANCARIO', fileKey: 'demo/cert_4.pdf', fileUrl: '/demo/cert.pdf', mimeType: 'application/pdf', sizeBytes: 190000 },
        ],
      },
    },
  });

  // Barequero 5: Completo (Utilizado en Lote 1)
  const barequero5 = await prisma.formalizer.create({
    data: {
      name: 'Ana Milena Caicedo Barco',
      document: '26391029',
      address: 'Barrio Cubis',
      city: 'Istmina-Chocó',
      phone: '3104829184',
      status: FormalizerStatus.USED,
      usedAt: new Date(Date.now() - 7 * 86400000),
      documents: {
        create: [
          { name: 'Cedula_Front_Ana_Milena.pdf', category: 'CEDULA_FRONT', fileKey: 'demo/cedula_f5.pdf', fileUrl: '/demo/cedula.pdf', mimeType: 'application/pdf', sizeBytes: 230000 },
          { name: 'Cedula_Back_Ana_Milena.pdf', category: 'CEDULA_BACK', fileKey: 'demo/cedula_b5.pdf', fileUrl: '/demo/cedula.pdf', mimeType: 'application/pdf', sizeBytes: 225000 },
          { name: 'RUT_Ana_Milena_2026.pdf', category: 'RUT', fileKey: 'demo/rut_5.pdf', fileUrl: '/demo/rut.pdf', mimeType: 'application/pdf', sizeBytes: 505000 },
          { name: 'Cert_Bancario_Ana_Milena.pdf', category: 'CERTIFICADO_BANCARIO', fileKey: 'demo/cert_5.pdf', fileUrl: '/demo/cert.pdf', mimeType: 'application/pdf', sizeBytes: 185000 },
        ],
      },
    },
  });

  // Barequero 6: Incompleto (Falta Certificado Bancario)
  const barequero6 = await prisma.formalizer.create({
    data: {
      name: 'Carlos Andrés Hinestroza Mena',
      document: '1077593812',
      address: 'Barrio Roma Cra 2',
      city: 'Quibdó-Chocó',
      phone: '3137819204',
      status: FormalizerStatus.AVAILABLE,
      documents: {
        create: [
          { name: 'Cedula_Front_Carlos.pdf', category: 'CEDULA_FRONT', fileKey: 'demo/cedula_f6.pdf', fileUrl: '/demo/cedula.pdf', mimeType: 'application/pdf', sizeBytes: 240000 },
          { name: 'Cedula_Back_Carlos.pdf', category: 'CEDULA_BACK', fileKey: 'demo/cedula_b6.pdf', fileUrl: '/demo/cedula.pdf', mimeType: 'application/pdf', sizeBytes: 235000 },
          { name: 'RUT_Carlos_2026.pdf', category: 'RUT', fileKey: 'demo/rut_6.pdf', fileUrl: '/demo/rut.pdf', mimeType: 'application/pdf', sizeBytes: 515000 },
        ],
      },
    },
  });

  // 5. Crear Lote 1 (Cerrado y Liquidado)
  console.log('5. Creando Lote 1 (Cerrado y Liquidado con Utilidad)...');
  const batch1Date = new Date(Date.now() - 10 * 86400000);
  const batch1CloseDate = new Date(Date.now() - 7 * 86400000);

  const batch1 = await prisma.batch.create({
    data: {
      code: 'LOTE-2026-001',
      name: 'Lote Inversión Quincena 1 Octubre',
      description: 'Lote formalizado y liquidado exitosamente con venta mayorista',
      status: BatchStatus.CLOSED,
      totalGrossGrams: 120.0000,
      totalFineGrams: 90.0000,
      totalInvestment: 31050000,
      averageCostPerFineGram: 345000,
      totalSales: 39000000,
      totalExpenses: 496000, // 340.000 formalización (2 barequeros) + 156.000 4x1000
      netProfit: 7454000, // 39.000.000 - 31.050.000 - 496.000
      closedAt: batch1CloseDate,
      formalizerCount: 2,
      formalizationCostPerPerson: 170000,
      formalizationTotalCost: 340000,
      fourPerThousandAmount: 156000,
      grossSaleAmount: 39000000,
      netSaleAmount: 38504000,
      salePricePerGram: 433333.33,
      soldAt: batch1CloseDate,
      createdById: daniel.id,
      createdAt: batch1Date,
    },
  });

  // Asignar los barequeros 4 y 5 al Lote 1
  await prisma.formalizer.update({ where: { id: barequero4.id }, data: { usedInBatchId: batch1.id } });
  await prisma.formalizer.update({ where: { id: barequero5.id }, data: { usedInBatchId: batch1.id } });

  // Compras Formales DH-4 y DH-5 asociadas al Lote 1
  await prisma.purchase.create({
    data: {
      type: PurchaseType.FORMAL,
      consecutive: 'DH-4',
      supplier: barequero4.name,
      vendorDoc: barequero4.document,
      vendorAddress: barequero4.address,
      vendorPhone: barequero4.phone,
      vendorCity: barequero4.city,
      grossGrams: 55.0000,
      purity: 0.7500,
      purityRaw: 750,
      fineGrams: 41.2500,
      pricePerGram: 345000,
      pricingMode: PricingMode.PER_FINE_GRAM,
      totalCost: 14231250,
      formalizedBatchId: batch1.id,
      isSigned: true,
      signedReceiptName: 'acta_DH-4_firmada.pdf',
      signedReceiptUrl: '/demo/acta_DH4.pdf',
      signedAt: batch1CloseDate,
      createdById: daniel.id,
      purchaseDate: batch1Date,
    },
  });

  await prisma.purchase.create({
    data: {
      type: PurchaseType.FORMAL,
      consecutive: 'DH-5',
      supplier: barequero5.name,
      vendorDoc: barequero5.document,
      vendorAddress: barequero5.address,
      vendorPhone: barequero5.phone,
      vendorCity: barequero5.city,
      grossGrams: 65.0000,
      purity: 0.7500,
      purityRaw: 750,
      fineGrams: 48.7500,
      pricePerGram: 345000,
      pricingMode: PricingMode.PER_FINE_GRAM,
      totalCost: 16818750,
      formalizedBatchId: batch1.id,
      isSigned: true,
      signedReceiptName: 'acta_DH-5_firmada.pdf',
      signedReceiptUrl: '/demo/acta_DH5.pdf',
      signedAt: batch1CloseDate,
      createdById: daniel.id,
      purchaseDate: batch1Date,
    },
  });

  // Compra contable del Lote 1
  await prisma.purchase.create({
    data: {
      type: PurchaseType.ACCOUNTING,
      consecutive: 'Nº 1001',
      supplier: 'Minería Sostenible del Chocó',
      grossGrams: 120.0000,
      purity: 0.7500,
      purityRaw: 750,
      fineGrams: 90.0000,
      pricePerGram: 345000,
      pricingMode: PricingMode.PER_FINE_GRAM,
      totalCost: 31050000,
      batchId: batch1.id,
      createdById: daniel.id,
      purchaseDate: batch1Date,
    },
  });

  // Movimiento de capital por la compra contable del Lote 1
  const prevBal1 = runningBalance;
  runningBalance -= 31050000;
  await prisma.capitalMovement.create({
    data: {
      type: CapitalMovementType.PURCHASE_PAYMENT,
      amount: 31050000,
      balanceBefore: prevBal1,
      balanceAfter: runningBalance,
      description: 'Pago de compra contable Nº 1001 (120g oro) - LOTE-2026-001',
      referenceId: batch1.id,
      createdAt: batch1Date,
    },
  });

  // Venta del Lote 1
  await prisma.sale.create({
    data: {
      customer: 'Fundición & Metales Mayorista S.A.S.',
      description: 'Liquidación y venta de oro fino del LOTE-2026-001',
      grossGrams: 120.0000,
      fineGrams: 90.0000,
      pricePerGram: 433333.33,
      totalAmount: 39000000,
      batchId: batch1.id,
      createdById: daniel.id,
      saleDate: batch1CloseDate,
    },
  });

  // Ingreso de capital por la venta neta del Lote 1
  const prevBal2 = runningBalance;
  runningBalance += 38504000; // 39.000.000 - 340.000 formalización - 156.000 4x1000
  await prisma.capitalMovement.create({
    data: {
      type: CapitalMovementType.BATCH_SALE_INCOME,
      amount: 38504000,
      balanceBefore: prevBal2,
      balanceAfter: runningBalance,
      description: 'Ingreso neto por venta de LOTE-2026-001 ($39M venta - costos deducidos)',
      referenceId: batch1.id,
      createdAt: batch1CloseDate,
    },
  });

  // Gastos del Lote 1
  await prisma.expense.create({
    data: {
      description: '4x1000 GMF Retención Bancaria Venta LOTE-2026-001',
      category: ExpenseCategory.FOUR_PER_THOUSAND,
      amount: 156000,
      batchId: batch1.id,
      expenseDate: batch1CloseDate,
    },
  });

  await prisma.expense.create({
    data: {
      description: 'Análisis de laboratorio y ensayo de fuego por crisol',
      category: ExpenseCategory.MELTING_LAB,
      amount: 250000,
      batchId: batch1.id,
      expenseDate: batch1Date,
    },
  });

  // Liquidación formal del Lote 1
  await prisma.settlement.create({
    data: {
      batchId: batch1.id,
      totalSales: 39000000,
      totalCost: 31050000,
      totalExpenses: 496000,
      netProfit: 7454000,
      clientPercent: 50.00,
      clientProfit: 3727000,
      partnerPercent: 50.00,
      partnerProfit: 3727000,
      notes: 'Cierre contable formal y exitoso de cuenta LOTE-2026-001. Liquidación transferida equitativamente a los socios administradores.',
      settlementDate: batch1CloseDate,
    },
  });

  // 6. Crear Lote 2 (ABIERTO - Listo para Venta y Formalización en Vivo)
  console.log('6. Creando Lote 2 (Abierto - 140g para probar Venta y Formalización)...');
  const batch2Date = new Date(Date.now() - 3 * 86400000);

  const batch2 = await prisma.batch.create({
    data: {
      code: 'LOTE-2026-002',
      name: 'Lote Inversión Quincena 2 Octubre',
      description: 'Lote abierto consolidado listo para liquidación y venta en mercado',
      status: BatchStatus.OPEN,
      totalGrossGrams: 140.0000,
      totalFineGrams: 105.0000,
      totalInvestment: 35700000,
      averageCostPerFineGram: 340000,
      createdById: daniel.id,
      createdAt: batch2Date,
    },
  });

  // Compras contables agrupadas en el Lote 2
  const pBatch2A = await prisma.purchase.create({
    data: {
      type: PurchaseType.ACCOUNTING,
      consecutive: 'Nº 1003',
      supplier: 'Comercializadora Minera del Atrato',
      grossGrams: 80.0000,
      purity: 0.7500,
      purityRaw: 750,
      fineGrams: 60.0000,
      pricePerGram: 340000,
      pricingMode: PricingMode.PER_FINE_GRAM,
      totalCost: 20400000,
      batchId: batch2.id,
      createdById: daniel.id,
      purchaseDate: batch2Date,
    },
  });

  const pBatch2B = await prisma.purchase.create({
    data: {
      type: PurchaseType.ACCOUNTING,
      consecutive: 'Nº 1004',
      supplier: 'Inversiones Río San Juan',
      grossGrams: 60.0000,
      purity: 0.7500,
      purityRaw: 750,
      fineGrams: 45.0000,
      pricePerGram: 340000,
      pricingMode: PricingMode.PER_FINE_GRAM,
      totalCost: 15300000,
      batchId: batch2.id,
      createdById: daniel.id,
      purchaseDate: batch2Date,
    },
  });

  // Movimientos de capital por compras del Lote 2
  const prevBal3 = runningBalance;
  runningBalance -= 20400000;
  await prisma.capitalMovement.create({
    data: {
      type: CapitalMovementType.PURCHASE_PAYMENT,
      amount: 20400000,
      balanceBefore: prevBal3,
      balanceAfter: runningBalance,
      description: 'Pago de compra contable Nº 1003 (80g oro) - LOTE-2026-002',
      referenceId: pBatch2A.id,
      createdAt: batch2Date,
    },
  });

  const prevBal4 = runningBalance;
  runningBalance -= 15300000;
  await prisma.capitalMovement.create({
    data: {
      type: CapitalMovementType.PURCHASE_PAYMENT,
      amount: 15300000,
      balanceBefore: prevBal4,
      balanceAfter: runningBalance,
      description: 'Pago de compra contable Nº 1004 (60g oro) - LOTE-2026-002',
      referenceId: pBatch2B.id,
      createdAt: batch2Date,
    },
  });

  // 7. Compras a Barequeros Disponibles (DH-1, DH-2, DH-3)
  console.log('7. Creando Compras a Barequeros (DH-1 y DH-2 suman 140g exactos para el Lote 2)...');
  
  // DH-1 (70g brutos, firmada)
  await prisma.purchase.create({
    data: {
      type: PurchaseType.FORMAL,
      consecutive: 'DH-1',
      supplier: barequero1.name,
      vendorDoc: barequero1.document,
      vendorAddress: barequero1.address,
      vendorPhone: barequero1.phone,
      vendorCity: barequero1.city,
      grossGrams: 70.0000,
      purity: 0.7500,
      purityRaw: 750,
      fineGrams: 52.5000,
      pricePerGram: 340000,
      pricingMode: PricingMode.PER_FINE_GRAM,
      totalCost: 17850000,
      isSigned: true,
      signedReceiptName: 'acta_DH-1_firmada.pdf',
      signedReceiptUrl: '/demo/acta_DH1.pdf',
      signedAt: new Date(Date.now() - 2 * 86400000),
      createdById: daniel.id,
      purchaseDate: new Date(Date.now() - 2 * 86400000),
    },
  });

  // DH-2 (70g brutos, sin firmar aún)
  await prisma.purchase.create({
    data: {
      type: PurchaseType.FORMAL,
      consecutive: 'DH-2',
      supplier: barequero2.name,
      vendorDoc: barequero2.document,
      vendorAddress: barequero2.address,
      vendorPhone: barequero2.phone,
      vendorCity: barequero2.city,
      grossGrams: 70.0000,
      purity: 0.7500,
      purityRaw: 750,
      fineGrams: 52.5000,
      pricePerGram: 340000,
      pricingMode: PricingMode.PER_FINE_GRAM,
      totalCost: 17850000,
      isSigned: false, // Para probar la insignia "Pendiente de Firma"
      createdById: daniel.id,
      purchaseDate: new Date(Date.now() - 2 * 86400000),
    },
  });

  // DH-3 (45g brutos, firmada)
  await prisma.purchase.create({
    data: {
      type: PurchaseType.FORMAL,
      consecutive: 'DH-3',
      supplier: barequero3.name,
      vendorDoc: barequero3.document,
      vendorAddress: barequero3.address,
      vendorPhone: barequero3.phone,
      vendorCity: barequero3.city,
      grossGrams: 45.0000,
      purity: 0.8000,
      purityRaw: 800,
      fineGrams: 36.0000,
      pricePerGram: 350000,
      pricingMode: PricingMode.PER_FINE_GRAM,
      totalCost: 12600000,
      isSigned: true,
      signedReceiptName: 'acta_DH-3_firmada.pdf',
      signedReceiptUrl: '/demo/acta_DH3.pdf',
      signedAt: new Date(Date.now() - 1 * 86400000),
      createdById: daniel.id,
      purchaseDate: new Date(Date.now() - 1 * 86400000),
    },
  });

  // 8. Compras Contables Sueltas en Bóveda (Listas para Crear Lote)
  console.log('8. Creando Compras Contables Sueltas en Bóveda (Listas para agrupar)...');
  const looseDate1 = new Date(Date.now() - 1 * 86400000);
  const loosePurchase1 = await prisma.purchase.create({
    data: {
      type: PurchaseType.ACCOUNTING,
      consecutive: 'Nº 1005',
      supplier: 'Minería Tradicional Andagoya',
      grossGrams: 32.5000,
      purity: 0.8500,
      purityRaw: 850,
      fineGrams: 27.6250,
      pricePerGram: 360000,
      pricingMode: PricingMode.PER_FINE_GRAM,
      totalCost: 9945000,
      createdById: daniel.id,
      purchaseDate: looseDate1,
    },
  });

  const prevBal5 = runningBalance;
  runningBalance -= 9945000;
  await prisma.capitalMovement.create({
    data: {
      type: CapitalMovementType.PURCHASE_PAYMENT,
      amount: 9945000,
      balanceBefore: prevBal5,
      balanceAfter: runningBalance,
      description: 'Pago de compra contable Nº 1005 (32.5g oro)',
      referenceId: loosePurchase1.id,
      createdAt: looseDate1,
    },
  });

  const looseDate2 = new Date();
  const loosePurchase2 = await prisma.purchase.create({
    data: {
      type: PurchaseType.ACCOUNTING,
      consecutive: 'Nº 1006',
      supplier: 'Cooperativa Aurífera Novita',
      grossGrams: 18.2000,
      purity: 0.9000,
      purityRaw: 900,
      fineGrams: 16.3800,
      pricePerGram: 375000,
      pricingMode: PricingMode.PER_FINE_GRAM,
      totalCost: 6142500,
      createdById: daniel.id,
      purchaseDate: looseDate2,
    },
  });

  const prevBal6 = runningBalance;
  runningBalance -= 6142500;
  await prisma.capitalMovement.create({
    data: {
      type: CapitalMovementType.PURCHASE_PAYMENT,
      amount: 6142500,
      balanceBefore: prevBal6,
      balanceAfter: runningBalance,
      description: 'Pago de compra contable Nº 1006 (18.2g oro)',
      referenceId: loosePurchase2.id,
      createdAt: looseDate2,
    },
  });

  // 9. Gasto Operativo de Transporte Adicional
  console.log('9. Registrando Gasto Operativo de Transporte...');
  await prisma.expense.create({
    data: {
      description: 'Transporte terrestre blindado de remesa Quibdó - Medellín',
      category: ExpenseCategory.TRANSPORT,
      amount: 180000,
      expenseDate: new Date(),
    },
  });

  // 10. Actualizar Saldo Final de Cartera
  console.log(`10. Actualizando saldo final de capital: $ ${runningBalance.toLocaleString('es-CO')} COP`);
  await prisma.systemSetting.update({
    where: { id: 'company_profile' },
    data: {
      currentCapital: runningBalance,
    },
  });

  console.log('\n======================================================');
  console.log('✓ SEED DEMO COMPLETADO EXITOSAMENTE');
  console.log('======================================================');
  console.log(`• Cuentas de Acceso:`);
  console.log(`  - Daniel (Admin): daniel / ${danielPass}`);
  console.log(`  - Andrés (Viewer/Partner): andres / ${andresPass}`);
  console.log(`• Capital en Caja: $ ${runningBalance.toLocaleString('es-CO')} COP`);
  console.log(`• Lote Abierto: LOTE-2026-002 (140.00g brutos / 105.00g finos) listo para vender`);
  console.log(`• Sugerencia de formalización exacta: DH-1 (70g) + DH-2 (70g) = 140g`);
  console.log(`• Lote Liquidado: LOTE-2026-001 (Utilidad Neta $7.454.000 repartida 50/50)`);
  console.log(`• Compras sueltas en bóveda listas para unificar: 2 compras (50.70g brutos)`);
  console.log(`• Directorio de barequeros: 6 partícipes registrados (4 completos, 2 con faltantes)`);
  console.log('======================================================\n');
}

main()
  .catch((e) => {
    console.error('Error durante la ejecución del seed demo:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
