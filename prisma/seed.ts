import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Inicializando cuentas de usuarios (Daniel, Andrés y Operador)...');

  const danielPass = process.env.DANIEL_PASSWORD || 'password123';
  const andresPass = process.env.ANDRES_PASSWORD || 'password123';
  const operadorPass = process.env.OPERADOR_PASSWORD || 'password123';

  const danielHashedPassword = bcrypt.hashSync(danielPass, 10);
  const andresHashedPassword = bcrypt.hashSync(andresPass, 10);
  const operadorHashedPassword = bcrypt.hashSync(operadorPass, 10);

  // 1. Daniel - Administrador con Control Total
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

  // 2. Andrés - Auditor / Socio Administrador
  const andres = await prisma.user.upsert({
    where: { username: 'andres' },
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

  // 3. Operador - Auxiliar de Compras a Barequeros
  const operador = await prisma.user.upsert({
    where: { username: 'operador' },
    update: {
      username: 'operador',
      name: 'Operador Barequeros',
      password: operadorHashedPassword,
      role: Role.BAREQUERO_OPERATOR,
      profitSharePercent: 0,
      isActive: true,
    },
    create: {
      username: 'operador',
      name: 'Operador Barequeros',
      password: operadorHashedPassword,
      role: Role.BAREQUERO_OPERATOR,
      profitSharePercent: 0,
      isActive: true,
    },
  });

  // 3. Ajustes Institucionales (Atlas Capital)
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
      currentCapital: 0,
    },
  });

  console.log(`✓ Cuenta de Daniel asegurada: ${daniel.username} [ADMIN]`);
  console.log(`✓ Cuenta de Andrés asegurada: ${andres.username} [VIEWER]`);
  console.log(`✓ Cuenta de Operador asegurada: ${operador.username} [BAREQUERO_OPERATOR]`);
  console.log('✓ Ajustes institucionales asegurados');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
