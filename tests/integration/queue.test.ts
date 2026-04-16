import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PgBoss } from 'pg-boss';
import { registerHandler } from '@/shared/queue/worker';

describe('pg-boss queue', () => {
  let boss: InstanceType<typeof PgBoss>;

  beforeAll(async () => {
    boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: 'pgboss_test' });
    await boss.start();
  });

  afterAll(async () => {
    await boss.stop({ graceful: true });
  });

  it('round-trips a noop job through publish + consume', async () => {
    const received: Array<{ ping: string }> = [];
    await registerHandler(boss, 'noop', (data) => {
      received.push(data);
      return Promise.resolve();
    });

    await boss.send('noop', { ping: 'abc', __requestId: 'req-xyz' });

    const deadline = Date.now() + 10_000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ ping: 'abc' });
  });
});
