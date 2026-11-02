import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function seedSuperAdmin() {
  console.log('⚡ [Seed] Inicializando / Sincronizando Super Administrador...');

  const username = (process.env.SUPERADMIN_USERNAME || 'superadmin').trim().toLowerCase();
  const email = (process.env.SUPERADMIN_EMAIL || 'admin@aurumdash.com').trim().toLowerCase();
  const name = process.env.SUPERADMIN_NAME || 'Super Administrador';
  const rawPass = process.env.SUPERADMIN_PASSWORD || 'superadminpassword123';
  const hashedPassword = bcrypt.hashSync(rawPass, 10);

  // Buscar por username o email o por rol SUPER_ADMIN
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

if (require.main === module) {
  seedSuperAdmin()
    .catch((e) => {
      console.error('Error en seed SuperAdmin:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
