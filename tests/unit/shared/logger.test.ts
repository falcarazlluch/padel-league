import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { createLogger } from '@/shared/logger';

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts sensitive fields', async () => {
    const stream = new PassThrough();
    const log = createLogger({ level: 'info', pretty: false, stream });
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(c as Buffer));

    log.info({ password: 'secret', passwordHash: 'hash', sessionToken: 'tok', safe: 'ok' }, 'hi');

    await new Promise((r) => setImmediate(r));
    const output = Buffer.concat(chunks).toString('utf8');
    expect(output).not.toContain('secret');
    expect(output).not.toContain('hash');
    expect(output).not.toContain('tok');
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('ok');
  });
});
