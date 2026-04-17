import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { SignedTokenService } from '@/shared/auth/signed-tokens';
import { PasswordService } from '@/shared/auth/password';
import { SessionService } from '@/shared/auth/session';
import type { AppError } from '@/shared/errors';
import { SignedTokenPurpose } from '@prisma/client';

const prisma = testPrisma();

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = 'test-secret-'.padEnd(44, 'x');
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PasswordService', () => {
  it('hashes and verifies correctly', async () => {
    const hash = await PasswordService.hash('TestPass1234');
    expect(await PasswordService.verify(hash, 'TestPass1234')).toBe(true);
    expect(await PasswordService.verify(hash, 'WrongPass')).toBe(false);
  });
});

describe('SignedTokenService — CAS concurrency', () => {
  it('only one of two concurrent consume calls succeeds', async () => {
    const user = await prisma.user.create({
      data: { email: 'cas@test.com', name: 'CAS Test', passwordHash: 'x', emailVerifiedAt: new Date() },
    });

    const token = await SignedTokenService.issue({
      purpose: SignedTokenPurpose.PASSWORD_RESET,
      subjectId: user.id,
      ttlSeconds: 300,
    });

    const results = await Promise.allSettled([
      SignedTokenService.consume(token, SignedTokenPurpose.PASSWORD_RESET),
      SignedTokenService.consume(token, SignedTokenPurpose.PASSWORD_RESET),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0].reason as AppError).code).toBe('TOKEN_INVALID');
  });
});

describe('SessionService', () => {
  it('creates and validates a session', async () => {
    const user = await prisma.user.create({
      data: { email: 'session@test.com', name: 'Session Test', passwordHash: 'x', emailVerifiedAt: new Date() },
    });

    const token = await SessionService.create(user.id);
    const sessionUser = await SessionService.validate(token);
    expect(sessionUser.id).toBe(user.id);
    expect(sessionUser.email).toBe('session@test.com');
  });

  it('revokes a session', async () => {
    const user = await prisma.user.create({
      data: { email: 'revoke@test.com', name: 'Revoke Test', passwordHash: 'x', emailVerifiedAt: new Date() },
    });

    const token = await SessionService.create(user.id);
    await SessionService.revoke(token);
    await expect(SessionService.validate(token)).rejects.toThrow();
  });
});
