import { describe, it, expect } from 'vitest';

describe('SignedTokenService — exports', () => {
  it('exports issue and consume functions', async () => {
    process.env.NEXTAUTH_SECRET = 'a'.repeat(44);
    const { SignedTokenService } = await import('@/shared/auth/signed-tokens');
    expect(typeof SignedTokenService.issue).toBe('function');
    expect(typeof SignedTokenService.consume).toBe('function');
  });
});
