import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__cardapioPrisma || new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error']
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__cardapioPrisma = prisma;
}

