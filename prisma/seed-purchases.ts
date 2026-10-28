import {
  PrismaClient,
  PurchaseType,
  PricingMode,
  CapitalMovementType,
  FormalizerStatus,
  Prisma,
} from '@prisma/client';

const prisma = new PrismaClient();

const BAREQUERO_PURCHASES = [
  {
    supplier: 'Moisés Córdoba Moreno',
    vendorDoc: '1077432198',
    vendorAddress: 'Barrio Kennedy Cl 24 # 5-12',
    vendorPhone: '3113456789',
    grossGrams: 14.50,
    purityRaw: 850,
    pricePerGram: 318000,
    daysAgo: 10,
  },
  {
    supplier: 'Yorladis Palacios Mena',
    vendorDoc: '1077889123',
    vendorAddress: 'Barrio Niño Jesús Cra 4 # 18-30',
    vendorPhone: '3124567890',
    grossGrams: 22.80,
    purityRaw: 875,
    pricePerGram: 320000,
    daysAgo: 9,
  },
  {
    supplier: 'Jhon Jairo Mosquera Rentería',
    vendorDoc: '1078001452',
    vendorAddress: 'Barrio Medrano Sector Playita',
    vendorPhone: '3145678901',
    grossGrams: 9.35,
    purityRaw: 900,
    pricePerGram: 322000,
    daysAgo: 8,
  },
  {
    supplier: 'Cenaida Perea Asprilla',
    vendorDoc: '1077654321',
    vendorAddress: 'Barrio Huapango Cl 28 # 1-15',
    vendorPhone: '3109876543',
    grossGrams: 31.20,
    purityRaw: 800,
    pricePerGram: 315000,
    daysAgo: 7,
  },
  {
    supplier: 'Faustino Murillo Rivas',
    vendorDoc: '71987654',
    vendorAddress: 'Barrio Las Margaritas Cra 7 # 12-40',
    vendorPhone: '3136789012',
    grossGrams: 18.75,
    purityRaw: 850,
    pricePerGram: 319000,
    daysAgo: 6,
  },
  {
    supplier: 'Luz Mary Rivas Pino',
    vendorDoc: '1077112233',
    vendorAddress: 'Barrio Yesquita Cl 22 # 3-08',
    vendorPhone: '3147890123',
    grossGrams: 27.40,
    purityRaw: 880,
    pricePerGram: 321000,
    daysAgo: 5,
  },
  {
    supplier: 'Duván Alexis Cuesta Hinestroza',
    vendorDoc: '1078334455',
    vendorAddress: 'Barrio Tomás Pérez Cra 1 # 30-10',
    vendorPhone: '3201234567',
    grossGrams: 12.60,
    purityRaw: 850,
    pricePerGram: 318500,
    daysAgo: 4,
  },
  {
    supplier: 'Yamileth Bejarano Gamboa',
    vendorDoc: '1077556677',
    vendorAddress: 'Barrio San Vicente Cl 26 # 6-22',
    vendorPhone: '3118901234',
    grossGrams: 38.15,
    purityRaw: 910,
    pricePerGram: 323000,
    daysAgo: 3,
  },
  {
    supplier: 'Edison Maturana Cossio',
    vendorDoc: '1078998877',
    vendorAddress: 'Barrio El Silencio Cra 5 # 15-04',
    vendorPhone: '3132345678',
    grossGrams: 16.90,
    purityRaw: 825,
    pricePerGram: 316000,
    daysAgo: 2,
  },
  {
    supplier: 'Kelly Johana Chalá Lemus',
    vendorDoc: '1077223344',
    vendorAddress: 'Barrio Roma Cl 20 # 4-50',
    vendorPhone: '3143456789',
    grossGrams: 24.30,
    purityRaw: 875,
    pricePerGram: 320500,
    daysAgo: 1,
  },
];

const NORMAL_PURCHASES = [
  {
    supplier: 'Comercializadora Aurífera del Pacífico S.A.S.',
    grossGrams: 65.40,
    purityRaw: 850,
    pricePerGram: 319000,
    daysAgo: 8,
  },
  {
    supplier: 'Metales y Minerales del San Juan E.U.',
    grossGrams: 92.15,
    purityRaw: 890,
    pricePerGram: 321500,
    daysAgo: 6,
  },
  {
    supplier: 'Inversiones Chocó Gold S.A.S.',
    grossGrams: 115.80,
    purityRaw: 910,
    pricePerGram: 323000,
    daysAgo: 4,
  },
  {
    supplier: 'Comercializadora Internacional Minera del Atrato',
    grossGrams: 78.50,
    purityRaw: 875,
    pricePerGram: 320000,
    daysAgo: 2,
  },
];

async function main() {
  console.log('--- Iniciando Seed de Compras (10 Barequeros + 4 Estándar) ---');

  // 1. Obtener o inicializar configuración del sistema
  let settings = await prisma.systemSetting.findUnique({
    where: { id: 'company_profile' },
  });

  if (!settings) {
    settings = await prisma.systemSetting.create({
      data: {
        id: 'company_profile',
        legalName: 'DANIEL CAMILO HERRERA RENTERIA',
        document: '1.078.000.069',
        address: 'CR 8 CL 30 8 07',
        phone: '3123456789',
        city: 'Quibdó',
        country: 'Colombia',
        consecutivePrefix: 'DH-',
        lastConsecutiveNum: 0,
        lastPurchaseNum: 0,
        currentCapital: new Prisma.Decimal('0.00'),
      },
    });
  }

  let currentCapital = Number(settings.currentCapital);

  // Inyección de capital inicial si el saldo es menor a 250M para mantener cartera positiva
  if (currentCapital < 250_000_000) {
    const injectionAmount = 300_000_000;
    const balanceBefore = currentCapital;
    const balanceAfter = currentCapital + injectionAmount;

    await prisma.systemSetting.update({
      where: { id: 'company_profile' },
      data: { currentCapital: new Prisma.Decimal(balanceAfter.toFixed(2)) },
    });

    await prisma.capitalMovement.create({
      data: {
        type: CapitalMovementType.CAPITAL_INJECTION,
        amount: new Prisma.Decimal(injectionAmount.toFixed(2)),
        balanceBefore: new Prisma.Decimal(balanceBefore.toFixed(2)),
        balanceAfter: new Prisma.Decimal(balanceAfter.toFixed(2)),
        description: 'Aporte de Capital Inicial para Operaciones de Compra',
      },
    });

    currentCapital = balanceAfter;
    console.log(`✓ Capital inicial inyectado: $${injectionAmount.toLocaleString('es-CO')} (Nuevo saldo: $${currentCapital.toLocaleString('es-CO')})`);
  }

  let nextConsecutiveNum = settings.lastConsecutiveNum;
  let nextPurchaseNum = settings.lastPurchaseNum;

  // 2. Inyectar 10 Compras de Barequeros (FORMAL)
  console.log('\n--- Inyectando 10 Compras de Barequeros ---');
  for (const item of BAREQUERO_PURCHASES) {
    nextConsecutiveNum += 1;
    const consecutive = `${settings.consecutivePrefix}${nextConsecutiveNum}`;

    const purityDec = +(item.purityRaw / 1000).toFixed(4);
    const fineGrams = +(item.grossGrams * purityDec).toFixed(4);
    const totalCost = +(fineGrams * item.pricePerGram).toFixed(2);
    const txDate = new Date(Date.now() - item.daysAgo * 24 * 60 * 60 * 1000);

    const purchase = await prisma.purchase.create({
      data: {
        type: PurchaseType.FORMAL,
        consecutive,
        supplier: item.supplier,
        vendorDoc: item.vendorDoc,
        vendorAddress: item.vendorAddress,
        vendorPhone: item.vendorPhone,
        vendorCity: 'Quibdó-Chocó',
        vendorCountry: 'Colombia',
        recipientName: settings.legalName,
        recipientDoc: settings.document,
        recipientAddress: settings.address,
        grossGrams: new Prisma.Decimal(item.grossGrams.toFixed(4)),
        purity: new Prisma.Decimal(purityDec.toFixed(4)),
        purityRaw: item.purityRaw,
        fineGrams: new Prisma.Decimal(fineGrams.toFixed(4)),
        pricePerGram: new Prisma.Decimal(item.pricePerGram.toFixed(2)),
        pricingMode: PricingMode.PER_FINE_GRAM,
        totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
        purchaseDate: txDate,
        deliveryDate: txDate,
        batchId: null, // Sin lote asignado
      },
    });

    // Auto-registrar / asegurar en Barequeros (Formalizers)
    await prisma.formalizer.upsert({
      where: { document: item.vendorDoc },
      update: {
        name: item.supplier,
        address: item.vendorAddress,
        phone: item.vendorPhone,
        city: 'Quibdó-Chocó',
        country: 'Colombia',
      },
      create: {
        name: item.supplier,
        document: item.vendorDoc,
        address: item.vendorAddress,
        phone: item.vendorPhone,
        city: 'Quibdó-Chocó',
        country: 'Colombia',
        status: FormalizerStatus.AVAILABLE,
      },
    });

    // Movimiento de Cartera
    const balanceBefore = currentCapital;
    const balanceAfter = currentCapital - totalCost;
    currentCapital = balanceAfter;

    await prisma.capitalMovement.create({
      data: {
        type: CapitalMovementType.PURCHASE_PAYMENT,
        amount: new Prisma.Decimal((-totalCost).toFixed(2)),
        balanceBefore: new Prisma.Decimal(balanceBefore.toFixed(2)),
        balanceAfter: new Prisma.Decimal(balanceAfter.toFixed(2)),
        description: `Pago compra formal ${consecutive} - ${item.supplier}`,
        referenceId: purchase.id,
        createdAt: txDate,
      },
    });

    console.log(`  ✓ [Barequero] ${consecutive} | ${item.supplier.padEnd(30)} | ${item.grossGrams}g Ley ${item.purityRaw} | $${totalCost.toLocaleString('es-CO')}`);
  }

  // 3. Inyectar 4 Compras Estándar (ACCOUNTING)
  console.log('\n--- Inyectando 4 Compras Estándar ---');
  for (const item of NORMAL_PURCHASES) {
    nextPurchaseNum += 1;
    const consecutive = String(nextPurchaseNum);

    const purityDec = +(item.purityRaw / 1000).toFixed(4);
    const fineGrams = +(item.grossGrams * purityDec).toFixed(4);
    const totalCost = +(fineGrams * item.pricePerGram).toFixed(2);
    const txDate = new Date(Date.now() - item.daysAgo * 24 * 60 * 60 * 1000);

    const purchase = await prisma.purchase.create({
      data: {
        type: PurchaseType.ACCOUNTING,
        consecutive,
        supplier: item.supplier,
        recipientName: settings.legalName,
        recipientDoc: settings.document,
        recipientAddress: settings.address,
        grossGrams: new Prisma.Decimal(item.grossGrams.toFixed(4)),
        purity: new Prisma.Decimal(purityDec.toFixed(4)),
        purityRaw: item.purityRaw,
        fineGrams: new Prisma.Decimal(fineGrams.toFixed(4)),
        pricePerGram: new Prisma.Decimal(item.pricePerGram.toFixed(2)),
        pricingMode: PricingMode.PER_FINE_GRAM,
        totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
        purchaseDate: txDate,
        deliveryDate: txDate,
        batchId: null, // Sin lote asignado
      },
    });

    // Movimiento de Cartera
    const balanceBefore = currentCapital;
    const balanceAfter = currentCapital - totalCost;
    currentCapital = balanceAfter;

    await prisma.capitalMovement.create({
      data: {
        type: CapitalMovementType.PURCHASE_PAYMENT,
        amount: new Prisma.Decimal((-totalCost).toFixed(2)),
        balanceBefore: new Prisma.Decimal(balanceBefore.toFixed(2)),
        balanceAfter: new Prisma.Decimal(balanceAfter.toFixed(2)),
        description: `Pago compra Nº ${consecutive} - ${item.supplier}`,
        referenceId: purchase.id,
        createdAt: txDate,
      },
    });

    console.log(`  ✓ [Compra]    Nº ${consecutive.padEnd(4)} | ${item.supplier.padEnd(45)} | ${item.grossGrams}g Ley ${item.purityRaw} | $${totalCost.toLocaleString('es-CO')}`);
  }

  // 4. Actualizar contadores y saldo final en system_settings
  await prisma.systemSetting.update({
    where: { id: 'company_profile' },
    data: {
      lastConsecutiveNum: nextConsecutiveNum,
      lastPurchaseNum: nextPurchaseNum,
      currentCapital: new Prisma.Decimal(currentCapital.toFixed(2)),
    },
  });

  console.log('\n======================================================');
  console.log('✓ SEED COMPLETADO EXITOSAMENTE');
  console.log(`• Último consecutivo Barequero: ${settings.consecutivePrefix}${nextConsecutiveNum}`);
  console.log(`• Último consecutivo Compra:    Nº ${nextPurchaseNum}`);
  console.log(`• Saldo de Cartera Actual:      $${currentCapital.toLocaleString('es-CO')}`);
  console.log('• Barequeros disponibles listos en /personas');
  console.log('• Compras disponibles listas en /compras (pendientes de lote)');
  console.log('======================================================\n');
}

main()
  .catch((e) => {
    console.error('Error ejecutando seed de compras:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
