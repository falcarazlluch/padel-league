import { PgBoss } from 'pg-boss';
import { logger } from '@/shared/logger';
import { currentRequestId } from '@/shared/logger/context';
import type { JobMap, JobName } from './jobs';

export type PublishOptions = {
  startAfter?: Date | string | number;
  singletonKey?: string;
  retryLimit?: number;
  expireInSeconds?: number;
};

export interface Queue {
  start(): Promise<void>;
  stop(): Promise<void>;
  publish<N extends JobName>(name: N, data: JobMap[N], opts?: PublishOptions): Promise<string | null>;
  raw(): InstanceType<typeof PgBoss>;
}

let instance: Queue | undefined;

export function queue(): Queue {
  if (!instance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for pg-boss');
    }
    const boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
      // retentionDays does not exist in pg-boss v12 — retention is configured
      // per-queue via boss.createQueue(name, { retentionSeconds }) if needed.
    });
    boss.on('error', (err: Error) => logger().error({ err }, 'pg-boss error'));

    instance = {
      async start() {
        await boss.start();
        logger().info('pg-boss started');
      },
      async stop() {
        await boss.stop({ graceful: true });
      },
      async publish(name, data, opts) {
        const payload = {
          ...(data as Record<string, unknown>),
          __requestId: currentRequestId(),
        };
        // pg-boss v12 asserts on undefined values for some options (notably
        // expireInSeconds, which it coerces to 0 then asserts >= 1). Build the
        // options object without optional keys when caller didn't set them.
        const sendOpts: Parameters<typeof boss.send>[2] = {
          retryLimit: opts?.retryLimit ?? 3,
          retryBackoff: true,
          // Route exhausted-retry jobs to the dead-letter queue so
          // attachDeadLetterRecorder() can persist them to JobDeadLetter.
          deadLetter: 'dead-letter',
        };
        if (opts?.startAfter !== undefined) sendOpts.startAfter = opts.startAfter;
        if (opts?.singletonKey !== undefined) sendOpts.singletonKey = opts.singletonKey;
        if (opts?.expireInSeconds !== undefined) sendOpts.expireInSeconds = opts.expireInSeconds;
        return boss.send(name, payload, sendOpts);
      },
      raw() {
        return boss;
      },
    };
  }
  return instance;
}
