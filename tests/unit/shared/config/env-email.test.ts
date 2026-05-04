import { describe, it, expect } from 'vitest';
import { parseEnv } from '@/shared/config/env';

const BASE_ENV = {
  NODE_ENV: 'test',
  APP_URL: 'https://example.com',
  DATABASE_URL: 'postgres://x',
  DIRECT_URL: 'postgres://x',
  NEXTAUTH_URL: 'https://example.com',
  NEXTAUTH_SECRET: 'a'.repeat(32),
  ENCRYPTION_KEY: 'b'.repeat(32),
  CRON_SECRET: 'c'.repeat(32),
};

function withResendFrom(value: string | undefined) {
  const env = { ...BASE_ENV } as Record<string, string | undefined>;
  if (value !== undefined) env.RESEND_FROM_EMAIL = value;
  return parseEnv(env);
}

describe('env.RESEND_FROM_EMAIL (optionalEmail)', () => {
  it('accepts a bare email', () => {
    const env = withResendFrom('noreply@example.com');
    expect(env.RESEND_FROM_EMAIL).toBe('noreply@example.com');
  });

  it("accepts the 'Display Name <email@domain>' format", () => {
    const env = withResendFrom('Padel League <noreply@example.com>');
    expect(env.RESEND_FROM_EMAIL).toBe('Padel League <noreply@example.com>');
  });

  it('discards a value with no TLD (localhost-like)', () => {
    const env = withResendFrom('Padel League <noreply@localhost>');
    expect(env.RESEND_FROM_EMAIL).toBeUndefined();
  });

  it('discards an obviously bad string', () => {
    const env = withResendFrom('not an email');
    expect(env.RESEND_FROM_EMAIL).toBeUndefined();
  });

  it('discards an empty / whitespace-only value', () => {
    expect(withResendFrom('').RESEND_FROM_EMAIL).toBeUndefined();
    expect(withResendFrom('   ').RESEND_FROM_EMAIL).toBeUndefined();
  });

  it('treats a missing var as undefined', () => {
    const env = withResendFrom(undefined);
    expect(env.RESEND_FROM_EMAIL).toBeUndefined();
  });

  it('trims surrounding whitespace before validating', () => {
    const env = withResendFrom('  noreply@example.com  ');
    expect(env.RESEND_FROM_EMAIL).toBe('noreply@example.com');
  });
});
