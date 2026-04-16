import { PrismaClient } from '@prisma/client';

let cached: PrismaClient | undefined;

export function testPrisma(): PrismaClient {
  cached ??= new PrismaClient();
  return cached;
}

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  const names = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  if (names) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;`);
  }
}
