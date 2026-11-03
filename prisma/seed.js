const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedSuperAdmin() {
  console.log('⚡ [Seed] Inicializando / Sincronizando Super Administrador...');

  const username = (process.env.SUPERADMIN_USERNAME || 'superadmin').trim().toLowerCase();
  const email = (process.env.SUPERADMIN_EMAIL || 'admin@aurumdash.com').trim().toLowerCase();
  const name = process.env.SUPERADMIN_NAME || 'Super Administrador';
  const rawPass = process.env.SUPERADMIN_PASSWORD || 'superadminpassword123';
  const hashedPassword = bcrypt.hashSync(rawPass, 10);

  const existingSuperAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { role: Role.SUPER_ADMIN },
        { username },
        { email },
      ],
    },
  });

  if (existingSuperAdmin) {
    const updated = await prisma.user.update({
      where: { id: existingSuperAdmin.id },
      data: {
        username,
        email,
        name,
        password: hashedPassword,
        role: Role.SUPER_ADMIN,
        companyId: null,
        isActive: true,
      },
    });
    console.log(`✓ Super Administrador actualizado: @${updated.username} (${updated.email})`);
    return updated;
  } else {
    const created = await prisma.user.create({
      data: {
        username,
        email,
        name,
        password: hashedPassword,
        role: Role.SUPER_ADMIN,
        companyId: null,
        profitSharePercent: 0,
        isActive: true,
      },
    });
    console.log(`✓ Super Administrador creado exitosamente: @${created.username} (${created.email})`);
    return created;
  }
}

async function seedAtlasCapital() {
  console.log('⚡ [Seed] Inicializando / Sincronizando Compraventa Atlas Capital...');

  // 1. Asegurar la Empresa "Atlas Capital"
  let company = await prisma.company.findFirst({
    where: {
      OR: [
        { slug: 'atlas-capital' },
        { name: 'Atlas Capital' },
      ],
    },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'Atlas Capital',
        slug: 'atlas-capital',
        nit: '123456789-1',
        phone: '3001231122',
        address: 'CR 8 CL 30 8 07',
        city: 'Quibdó, Chocó',
        isActive: true,
      },
    });
    console.log(`✓ Empresa creada: ${company.name} [ID: ${company.id}]`);
  } else {
    company = await prisma.company.update({
      where: { id: company.id },
      data: {
        name: 'Atlas Capital',
        slug: 'atlas-capital',
        isActive: true,
      },
    });
    console.log(`✓ Empresa Atlas Capital verificada [ID: ${company.id}]`);
  }

  // 2. Asegurar SystemSetting con configuración de Siigo vinculada a company
  const existingSetting = await prisma.systemSetting.findFirst({
    where: { companyId: company.id },
  });

  const siigoConfig = {
    siigoActive: existingSetting?.siigoActive ?? true,
    siigoApiUrl: existingSetting?.siigoApiUrl || 'https://api.siigo.com',
    siigoUsername: existingSetting?.siigoUsername || 'atlascapital.col@gmail.com',
    siigoAccessKey: existingSetting?.siigoAccessKey || 'OTczNDNmMGMtN2I4YS00NWVlLWE4MDEtYzliYzkxNzI2MjJmOmM0WGNjfnE1eEM=',
    siigoPartnerId: existingSetting?.siigoPartnerId || 'AtlasCapital',
    siigoDebitAccount: existingSetting?.siigoDebitAccount || '13309595',
    siigoCreditAccount: existingSetting?.siigoCreditAccount || '11050501',
    siigoRpDocumentId: existingSetting?.siigoRpDocumentId || 31163,
    siigoCashPaymentId: existingSetting?.siigoCashPaymentId || 4375,
  };

  if (!existingSetting) {
    await prisma.systemSetting.create({
      data: {
        companyId: company.id,
        legalName: 'DANIEL CAMILO HERRERA RENTERIA',
        document: '1.078.000.069',
        address: 'CR 8 CL 30 8 07',
        phone: '3001231122',
        city: 'Quibdó',
        country: 'Colombia',
        consecutivePrefix: 'DH-',
        ...siigoConfig,
      },
    });
    console.log('✓ Ajustes comerciales y de Siigo creados para Atlas Capital');
  } else {
    await prisma.systemSetting.update({
      where: { id: existingSetting.id },
      data: {
        legalName: 'DANIEL CAMILO HERRERA RENTERIA',
        document: '1.078.000.069',
        consecutivePrefix: existingSetting.consecutivePrefix || 'DH-',
        ...siigoConfig,
      },
    });
    console.log('✓ Ajustes comerciales y de Siigo sincronizados para Atlas Capital');
  }

  // 3. Colaboradores Oficiales: Daniel (ADMIN) y Andrés (VIEWER)
  const danielPass = process.env.DANIEL_PASSWORD || 'password123';
  const andresPass = process.env.ANDRES_PASSWORD || 'password123';

  const danielHash = bcrypt.hashSync(danielPass, 10);
  const andresHash = bcrypt.hashSync(andresPass, 10);

  // Daniel Herrera - Administrador
  const existingDaniel = await prisma.user.findFirst({
    where: {
      OR: [
        { username: 'daniel' },
        { username: 'daniel2026' },
        { email: 'daniel@aurumdash.com' },
      ],
    },
  });

  if (existingDaniel) {
    await prisma.user.update({
      where: { id: existingDaniel.id },
      data: {
        companyId: company.id,
        username: 'daniel',
        name: 'Daniel Camilo Herrera Renteria',
        email: 'daniel@aurumdash.com',
        role: Role.ADMIN,
        password: danielHash,
        profitSharePercent: 50.0,
        isActive: true,
      },
    });
    console.log('✓ Usuario Daniel Herrera actualizado [ADMIN]');
  } else {
    await prisma.user.create({
      data: {
        companyId: company.id,
        username: 'daniel',
        name: 'Daniel Camilo Herrera Renteria',
        email: 'daniel@aurumdash.com',
        role: Role.ADMIN,
        password: danielHash,
        profitSharePercent: 50.0,
        isActive: true,
      },
    });
    console.log('✓ Usuario Daniel Herrera creado [ADMIN]');
  }

  // Andrés Herrera - Observador (Solo Lectura)
  const existingAndres = await prisma.user.findFirst({
    where: {
      OR: [
        { username: 'andres' },
        { email: 'andres@aurumdash.com' },
      ],
    },
  });

  if (existingAndres) {
    await prisma.user.update({
      where: { id: existingAndres.id },
      data: {
        companyId: company.id,
        username: 'andres',
        name: 'Andres Felipe Herrera',
        email: 'andres@aurumdash.com',
        role: Role.VIEWER,
        password: andresHash,
        profitSharePercent: 50.0,
        isActive: true,
      },
    });
    console.log('✓ Usuario Andrés Herrera actualizado [VIEWER]');
  } else {
    await prisma.user.create({
      data: {
        companyId: company.id,
        username: 'andres',
        name: 'Andres Felipe Herrera',
        email: 'andres@aurumdash.com',
        role: Role.VIEWER,
        password: andresHash,
        profitSharePercent: 50.0,
        isActive: true,
      },
    });
    console.log('✓ Usuario Andrés Herrera creado [VIEWER]');
  }

  console.log('✓ Seed de Atlas Capital completado con éxito.');
}

async function main() {
  console.log('🚀 Iniciando proceso maestro de semillas (Seeds) de AurumDash...');

  // Migraciones seguras de columnas y categorías históricas
  await prisma.$executeRawUnsafe(`ALTER TABLE "purchases" ALTER COLUMN "purityRaw" TYPE DECIMAL(8,3) USING "purityRaw"::DECIMAL(8,3)`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE "purchases" ALTER COLUMN "purity" TYPE DECIMAL(10,6) USING "purity"::DECIMAL(10,6)`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE "purchases" ALTER COLUMN "fineGrams" TYPE DECIMAL(14,6) USING "fineGrams"::DECIMAL(14,6)`).catch(() => {});
  await prisma.$executeRawUnsafe(`UPDATE barequero_documents SET category = 'ANM' WHERE category = 'ARM'`).catch(() => {});

  await seedSuperAdmin();
  await seedAtlasCapital();
  console.log('🎉 Todos los seeds se completaron exitosamente.');
}

main()
  .catch((e) => {
    console.error('Error al ejecutar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
