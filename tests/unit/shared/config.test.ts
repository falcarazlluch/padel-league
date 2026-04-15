import { describe, it, expect } from 'vitest';
import { parseEnv } from '@/shared/config/env';

describe('parseEnv', () => {
  const valid = {
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:3000',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://u:p@h:5432/db',
    DIRECT_URL: 'postgresql://u:p@h:5432/db',
    NEXTAUTH_URL: 'http://localhost:3000',
    NEXTAUTH_SECRET: 'a'.repeat(44),
    ENCRYPTION_KEY: 'b'.repeat(44),
    RESEND_API_KEY: 're_test',
    RESEND_FROM_EMAIL: 'noreply@example.com',
    AI_PROVIDER: 'claude',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    OPENAI_API_KEY: 'sk-test',
    AI_MODEL_CLAUDE: 'claude-haiku-4-5-20251001',
    AI_MODEL_OPENAI: 'gpt-4o-mini',
    CRON_SECRET: 'c'.repeat(44),
    FEATURE_2FA: 'false',
    FEATURE_AI_COMMENTARY: 'true',
    FEATURE_INDEPENDENT_MATCHES: 'true',
    WORKER_CONCURRENCY: '4',
  };

  it('parses a valid environment', () => {
    const env = parseEnv(valid);
    expect(env.NODE_ENV).toBe('test');
    expect(env.WORKER_CONCURRENCY).toBe(4);
    expect(env.FEATURE_2FA).toBe(false);
    expect(env.AI_PROVIDER).toBe('claude');
  });

  it('throws when a required var is missing', () => {
    const { DATABASE_URL: _, ...incomplete } = valid;
    expect(() => parseEnv(incomplete)).toThrow(/DATABASE_URL/);
  });

  it('rejects invalid AI_PROVIDER', () => {
    expect(() => parseEnv({ ...valid, AI_PROVIDER: 'bard' })).toThrow();
  });

  it('coerces WORKER_CONCURRENCY to number', () => {
    const env = parseEnv({ ...valid, WORKER_CONCURRENCY: '8' });
    expect(env.WORKER_CONCURRENCY).toBe(8);
    expect(typeof env.WORKER_CONCURRENCY).toBe('number');
  });
});
