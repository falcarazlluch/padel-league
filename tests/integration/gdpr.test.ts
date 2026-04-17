import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { PasswordService } from '@/shared/auth/password';
import { anonymizeUserHandler } from '@/worker/handlers/anonymize-user';

const prisma = testPrisma();

beforeAll(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('anonymizeUserHandler', () => {
  it('anonymizes user data and invalidates sessions', async () => {
    const passwordHash = await PasswordService.hash('TestPass1234');
    const user = await prisma.user.create({
      data: {
        email: 'gdpr@test.com',
        name: 'GDPR Test',
        passwordHash,
        phone: '+34600000000',
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.session.create({
      data: { userId: user.id, sessionToken: 'test-token', expires: new Date(Date.now() + 9999999) },
    });

    await anonymizeUserHandler({ userId: user.id });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.email).toBe(`anonymized-${user.id}@deleted.local`);
    expect(updated.name).toBe('Jugador anónimo');
    expect(updated.phone).toBeNull();
    expect(updated.anonymizedAt).not.toBeNull();

    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(0);

    // Idempotency: calling again should not throw
    await expect(anonymizeUserHandler({ userId: user.id })).resolves.not.toThrow();
  });
});
