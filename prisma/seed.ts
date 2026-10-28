import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Inicializando cuentas de socios administradores...');

  const defaultHashedPassword = bcrypt.hashSync('password123', 10);

  // Socio 1 (Administrador)
  const socio1 = await prisma.user.upsert({
    where: { email: 'socio1@aurumdash.com' },
    update: {
      name: 'Socio 1',
      password: defaultHashedPassword,
      role: Role.ADMIN,
      profitSharePercent: 50.0,
    },
    create: {
      email: 'socio1@aurumdash.com',
      name: 'Socio 1',
      password: defaultHashedPassword,
      role: Role.ADMIN,
      profitSharePercent: 50.0,
    },
  });

  // Socio 2 (Administrador con la misma autoridad)
  const socio2 = await prisma.user.upsert({
    where: { email: 'socio2@aurumdash.com' },
    update: {
      name: 'Socio 2',
      password: defaultHashedPassword,
      role: Role.ADMIN,
      profitSharePercent: 50.0,
    },
    create: {
      email: 'socio2@aurumdash.com',
      name: 'Socio 2',
      password: defaultHashedPassword,
      role: Role.ADMIN,
      profitSharePercent: 50.0,
    },
  });

  console.log(`Cuentas de socios creadas y aseguradas: ${socio1.name} y ${socio2.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
