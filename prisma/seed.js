const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Inicializando cuentas de usuarios (Daniel, Andrés y Operador)...');

  const defaultHashedPassword = bcrypt.hashSync('password123', 10);

  // 1. Daniel - Administrador con Control Total
  const daniel = await prisma.user.upsert({
    where: { email: 'daniel@aurumdash.com' },
    update: {
      username: 'daniel',
      name: 'Daniel',
      password: defaultHashedPassword,
      role: Role.ADMIN,
      profitSharePercent: 50.0,
      isActive: true,
    },
    create: {
      username: 'daniel',
      email: 'daniel@aurumdash.com',
      name: 'Daniel',
      password: defaultHashedPassword,
      role: Role.ADMIN,
      profitSharePercent: 50.0,
      isActive: true,
    },
  });

  // 2. Andrés - Auditor / Solo Lectura (Consulta Contable)
  const andres = await prisma.user.upsert({
    where: { email: 'andres@aurumdash.com' },
    update: {
      username: 'andres',
      name: 'Andres',
      password: defaultHashedPassword,
      role: Role.VIEWER,
      profitSharePercent: 50.0,
      isActive: true,
    },
    create: {
      username: 'andres',
      email: 'andres@aurumdash.com',
      name: 'Andres',
      password: defaultHashedPassword,
      role: Role.VIEWER,
      profitSharePercent: 50.0,
      isActive: true,
    },
  });

  // 3. Operador - Auxiliar de Compras a Barequeros
  const operador = await prisma.user.upsert({
    where: { email: 'operador@aurumdash.com' },
    update: {
      username: 'operador',
      name: 'Operador Barequeros',
      password: defaultHashedPassword,
      role: Role.BAREQUERO_OPERATOR || 'BAREQUERO_OPERATOR',
      profitSharePercent: 0,
      isActive: true,
    },
    create: {
      username: 'operador',
      email: 'operador@aurumdash.com',
      name: 'Operador Barequeros',
      password: defaultHashedPassword,
      role: Role.BAREQUERO_OPERATOR || 'BAREQUERO_OPERATOR',
      profitSharePercent: 0,
      isActive: true,
    },
  });

  // 4. Ajustes Institucionales (Atlas Capital)
  await prisma.systemSetting.upsert({
    where: { id: 'company_profile' },
    update: {
      legalName: 'DANIEL CAMILO HERRERA RENTERIA',
      document: '1.078.000.069',
      address: 'CR 8 CL 30 8 07',
      city: 'Quibdó',
      country: 'Colombia',
      consecutivePrefix: 'DH-',
    },
    create: {
      id: 'company_profile',
      legalName: 'DANIEL CAMILO HERRERA RENTERIA',
      document: '1.078.000.069',
      address: 'CR 8 CL 30 8 07',
      city: 'Quibdó',
      country: 'Colombia',
      consecutivePrefix: 'DH-',
    },
  });

  console.log(`✓ Cuenta de Daniel lista: ${daniel.username} (${daniel.email}) [ADMIN]`);
  console.log(`✓ Cuenta de Andrés lista: ${andres.username} (${andres.email}) [VIEWER]`);
  console.log(`✓ Cuenta de Operador lista: ${operador.username} (${operador.email}) [OPERADOR]`);
}

main()
  .catch((e) => {
    console.error('Error al ejecutar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
