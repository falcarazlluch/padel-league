import { PgBoss } from 'pg-boss';
import { logger } from '@/shared/logger';
import { currentRequestId } from '@/shared/logger/context';
import { ALL_JOB_NAMES, type JobMap, type JobName } from './jobs';

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

const DEAD_LETTER_QUEUE = 'dead-letter';

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

    // Memoize the boot sequence (start + create queues) so concurrent callers
    // share the same in-flight promise and we don't race on first cold start.
    let bootPromise: Promise<void> | null = null;
    const ensureBooted = (): Promise<void> => {
      bootPromise ??= (async () => {
        await boss.start();
        // pg-boss v12 no longer auto-creates queues on send/work — they must
        // exist beforehand. createQueue is idempotent (INSERT ON CONFLICT DO
        // NOTHING) so repeating it across cold starts is safe.
        const queues: string[] = [...ALL_JOB_NAMES, DEAD_LETTER_QUEUE];
        await Promise.all(
          queues.map((name) =>
            boss.createQueue(name).catch((err) => {
              logger().warn({ err, queue: name }, 'queue.create.skip');
            }),
          ),
        );
        logger().info({ queues }, 'pg-boss started');
      })();
      return bootPromise;
    };

    instance = {
      start: ensureBooted,
      async stop() {
        await boss.stop({ graceful: true });
      },
      async publish(name, data, opts) {
        // Defensive: callers in server actions are expected to await q.start()
        // before publishing, but ensureBooted is memoized so doing it here too
        // is free and removes a class of "Queue does not exist" races.
        await ensureBooted();
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
          deadLetter: DEAD_LETTER_QUEUE,
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
