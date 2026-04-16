import { describe, it, expect } from 'vitest';
import { buildRateLimitKey } from '@/shared/auth/rate-limit';

describe('buildRateLimitKey', () => {
  it('builds expected key format', () => {
    expect(buildRateLimitKey('login', 'ip', '1.2.3.4')).toBe('login:ip:1.2.3.4');
  });
});
