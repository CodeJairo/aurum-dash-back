import { PrismaClient } from '@prisma/client';
import { seedSuperAdmin } from './seed-superadmin';
import { seedAtlasCapital } from './seed-atlas';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando proceso maestro de semillas (Seeds) de AurumDash...');

  await seedSuperAdmin();
  await seedAtlasCapital();

  console.log('🎉 Todos los seeds se completaron exitosamente.');
}

main()
  .catch((e) => {
    console.error('Error ejecutando seeds:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
