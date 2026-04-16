import { describe, it, expect } from 'vitest';
import { SessionService } from '@/shared/auth/session';

describe('SessionService.generateToken', () => {
  it('generates a URL-safe string of expected length', () => {
    const token = SessionService.generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes base64url = ~43 chars
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('generates unique tokens', () => {
    const a = SessionService.generateToken();
    const b = SessionService.generateToken();
    expect(a).not.toBe(b);
  });
});
