import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const email = process.env.DEMO_ADMIN_EMAIL || 'admin@cardapio.local';
const password = process.env.DEMO_ADMIN_PASSWORD || '12345678';
const storeSlug = process.env.DEMO_STORE_SLUG || 'cardapio';

function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const iterations = 120000;
  const digest = pbkdf2Sync(value, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${digest}`;
}

async function main() {
  const store = await prisma.store.findUnique({ where: { slug: storeSlug } });
  if (!store) throw new Error(`Loja /${storeSlug} não encontrada.`);

  let admin = await prisma.adminUser.findFirst({ where: { email } });
  if (admin) {
    admin = await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        companyId: store.companyId,
        name: admin.name || 'Administrador Demo',
        email,
        passwordHash: hashPassword(password),
        role: 'owner',
        isActive: true
      }
    });
  } else {
    admin = await prisma.adminUser.create({
      data: {
        companyId: store.companyId,
        name: 'Administrador Demo',
        email,
        passwordHash: hashPassword(password),
        role: 'owner',
        isActive: true
      }
    });
  }

  await prisma.adminUserStoreAccess.upsert({
    where: { adminUserId_storeId: { adminUserId: admin.id, storeId: store.id } },
    update: {
      companyId: store.companyId,
      role: 'owner',
      permissions: [],
      isActive: true
    },
    create: {
      adminUserId: admin.id,
      companyId: store.companyId,
      storeId: store.id,
      role: 'owner',
      permissions: [],
      isActive: true
    }
  });

  await prisma.appSession.deleteMany({ where: { type: 'admin', ownerId: admin.id } }).catch(() => {});

  const access = await prisma.adminUserStoreAccess.findMany({
    where: { adminUserId: admin.id },
    include: { store: true },
    orderBy: { createdAt: 'asc' }
  });

  console.log(JSON.stringify({
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
      companyId: admin.companyId
    },
    access: access.map((entry) => ({
      store: entry.store.slug,
      role: entry.role,
      isActive: entry.isActive
    }))
  }, null, 2));
}

main()
  .finally(async () => prisma.$disconnect());
