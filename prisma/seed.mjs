import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const adminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@cardapio.local';
const adminPassword = process.env.ADMIN_SEED_PASSWORD || '12345678';

async function main() {
  const company = await prisma.company.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Luske Burguer',
      billingEmail: adminEmail,
      status: 'trial'
    }
  });

  const store = await prisma.store.upsert({
    where: { slug: 'luske-burguer' },
    update: {},
    create: {
      companyId: company.id,
      name: 'Luske Burguer',
      slug: 'luske-burguer',
      description: 'Loja de demonstração do TáPronto.',
      isActive: true
    }
  });

  await prisma.storeSetting.upsert({
    where: { id: '00000000-0000-0000-0000-000000000101' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000101',
      storeId: store.id,
      name: 'Luske Burguer',
      slug: store.slug,
      description: 'Pedido rapido pelo cardapio digital.',
      isOpen: true,
      minimumOrder: 20,
      deliveryFee: 5
    }
  });

  const admin = await prisma.adminUser.upsert({
    where: { id: '00000000-0000-0000-0000-000000000201' },
    update: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12)
    },
    create: {
      id: '00000000-0000-0000-0000-000000000201',
      companyId: company.id,
      name: process.env.ADMIN_SEED_NAME || 'Administrador',
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: 'owner',
      isActive: true
    }
  });

  await prisma.adminUserStoreAccess.upsert({
    where: {
      adminUserId_storeId: {
        adminUserId: admin.id,
        storeId: store.id
      }
    },
    update: {},
    create: {
      adminUserId: admin.id,
      companyId: company.id,
      storeId: store.id,
      role: 'owner',
      permissions: ['all'],
      isActive: true
    }
  });

  const categories = [
    { id: '00000000-0000-0000-0000-000000000301', name: 'Hamburgueres', sortOrder: 1 },
    { id: '00000000-0000-0000-0000-000000000302', name: 'Entradas', sortOrder: 2 },
    { id: '00000000-0000-0000-0000-000000000303', name: 'Bebidas', sortOrder: 3 }
  ];

  for (const category of categories) {
    await prisma.menuCategory.upsert({
      where: { id: category.id },
      update: {},
      create: {
        id: category.id,
        storeId: store.id,
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: true
      }
    });
  }

  await prisma.menuItem.upsert({
    where: { id: '00000000-0000-0000-0000-000000000401' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000401',
      storeId: store.id,
      categoryId: '00000000-0000-0000-0000-000000000301',
      name: 'Luske Smash',
      description: 'Smash burger com cheddar e molho da casa.',
      price: 34.9,
      isFeatured: true,
      isAvailable: true,
      sortOrder: 1
    }
  });

  console.log(`Seed local criado. Admin: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
