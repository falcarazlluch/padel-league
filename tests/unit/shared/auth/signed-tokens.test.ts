import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma client before importing SignedTokenService
vi.mock('@/shared/db/client', () => ({
  prisma: {
    signedToken: {
      create: vi.fn().mockResolvedValue({
        id: 'test-id',
        jti: 'test-jti',
        purpose: 'PASSWORD_RESET',
        subjectId: 'user-123',
        metadata: null,
        expiresAt: new Date(),
        usedAt: null,
        createdAt: new Date(),
      }),
    },
  },
}));

describe('SignedTokenService', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'a'.repeat(44);
  });

  it('exports issue and consume functions', async () => {
    const { SignedTokenService } = await import('@/shared/auth/signed-tokens');
    expect(typeof SignedTokenService.issue).toBe('function');
    expect(typeof SignedTokenService.consume).toBe('function');
  });

  it('issues a JWT with valid format', async () => {
    const { SignedTokenService } = await import('@/shared/auth/signed-tokens');
    const { SignedTokenPurpose } = await import('@prisma/client');

    const token = await SignedTokenService.issue({
      purpose: SignedTokenPurpose.PASSWORD_RESET,
      subjectId: 'user-123',
      ttlSeconds: 300,
    });

    // JWT format: three base64url segments separated by dots
    expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });
});
