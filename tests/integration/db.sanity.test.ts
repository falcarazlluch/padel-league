import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';

const prisma = testPrisma();

beforeAll(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('db sanity', () => {
  it('can create and read a User', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Tester',
        passwordHash: 'hash',
        role: 'PLAYER',
      },
    });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.email).toBe('test@example.com');
  });
});
