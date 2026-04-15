import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { createLogger } from '@/shared/logger';
import { runWithContext, currentContext, currentRequestId } from '@/shared/logger/context';

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

  it('redacts one-level-nested sensitive fields', async () => {
    const stream = new PassThrough();
    const log = createLogger({ level: 'info', pretty: false, stream });
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(c as Buffer));

    log.info(
      { user: { password: 'nested-secret', passwordHash: 'nested-hash', name: 'ok' } },
      'nested',
    );

    await new Promise((r) => setImmediate(r));
    const output = Buffer.concat(chunks).toString('utf8');
    expect(output).not.toContain('nested-secret');
    expect(output).not.toContain('nested-hash');
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('ok');
  });
});

describe('request context', () => {
  it('generates a requestId when none provided', () => {
    runWithContext({}, () => {
      expect(currentRequestId()).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('preserves an explicit requestId', () => {
    runWithContext({ requestId: 'rid-abc' }, () => {
      expect(currentRequestId()).toBe('rid-abc');
    });
  });

  it('returns undefined outside a context', () => {
    expect(currentRequestId()).toBeUndefined();
  });

  it('does not overwrite generated requestId when ctx has undefined', () => {
    // guards against the `{ requestId: fallback, ...ctx }` spread bug
    runWithContext({ requestId: undefined, userId: 'u1' }, () => {
      expect(currentRequestId()).toMatch(/^[0-9a-f-]{36}$/);
      expect(currentContext()?.userId).toBe('u1');
    });
  });

  it('freezes the stored context', () => {
    runWithContext({ userId: 'u1' }, () => {
      const ctx = currentContext()!;
      expect(() => {
        (ctx as { userId?: string }).userId = 'spoof';
      }).toThrow(TypeError);
    });
  });
});
