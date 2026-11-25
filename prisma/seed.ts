import { PrismaClient } from '@prisma/client';
import { seedSuperAdmin } from './seed-superadmin';
import { seedAtlasCapital } from './seed-atlas';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando proceso maestro de semillas (Seeds) de AurumDash...');

  await seedSuperAdmin();

  // La empresa piloto (Atlas Capital) solo se siembra si se pide explícitamente:
  //   SEED_ATLAS=true pnpm seed   (o directamente: pnpm seed:atlas)
  // Las empresas nuevas se crean desde el panel del Super Administrador.
  if (process.env.SEED_ATLAS === 'true') {
    await seedAtlasCapital();
  }

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
