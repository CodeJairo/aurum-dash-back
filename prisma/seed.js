const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Inicializando cuentas de usuarios (Daniel y Andrés)...');

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

  console.log(`✓ Cuenta de Daniel lista: ${daniel.username} (${daniel.email}) [ADMIN]`);
  console.log(`✓ Cuenta de Andrés lista: ${andres.username} (${andres.email}) [VIEWER]`);
}

main()
  .catch((e) => {
    console.error('Error al ejecutar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
