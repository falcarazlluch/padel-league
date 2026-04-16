import { describe, it, expect } from 'vitest';
import { PasswordService } from '@/shared/auth/password';

describe('PasswordService', () => {
  it('hashes a password and verifies it', async () => {
    const hash = await PasswordService.hash('MyPass1234');
    expect(await PasswordService.verify(hash, 'MyPass1234')).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await PasswordService.hash('MyPass1234');
    expect(await PasswordService.verify(hash, 'WrongPass')).toBe(false);
  });

  it('needsRehash returns false for fresh hash', async () => {
    const hash = await PasswordService.hash('MyPass1234');
    expect(PasswordService.needsRehash(hash)).toBe(false);
  });
});
