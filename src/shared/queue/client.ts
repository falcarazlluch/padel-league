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
        return boss.send(name, payload, {
          startAfter: opts?.startAfter,
          singletonKey: opts?.singletonKey,
          retryLimit: opts?.retryLimit ?? 3,
          retryBackoff: true,
          expireInSeconds: opts?.expireInSeconds,
          // Route exhausted-retry jobs to the dead-letter queue so
          // attachDeadLetterRecorder() can persist them to JobDeadLetter.
          deadLetter: 'dead-letter',
        });
      },
      raw() {
        return boss;
      },
    };
  }
  return instance;
}
