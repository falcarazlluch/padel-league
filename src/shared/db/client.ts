import { PrismaClient } from '@prisma/client';

// Reads DATABASE_URL directly from process.env — deliberately avoids the full
// `env()` parser so integration tests can use the DB client without providing
// the app's complete env (auth secrets, AI keys, etc.).

type GlobalWithPrisma = typeof globalThis & { __prisma?: PrismaClient };
const g = globalThis as GlobalWithPrisma;

function makeClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = g.__prisma ?? makeClient();

if (process.env.NODE_ENV !== 'production') {
  g.__prisma = prisma;
}
