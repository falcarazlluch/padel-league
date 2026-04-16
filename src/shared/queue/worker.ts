import { PgBoss } from 'pg-boss';
import { logger } from '@/shared/logger';
import { runWithContext } from '@/shared/logger/context';
import { prisma } from '@/shared/db/client';
import type { JobMap, JobName } from './jobs';

export type Handler<N extends JobName> = (data: JobMap[N]) => Promise<void>;

type EnvelopedData<N extends JobName> = JobMap[N] & { __requestId?: string };

export async function registerHandler<N extends JobName>(
  boss: InstanceType<typeof PgBoss>,
  name: N,
  handler: Handler<N>,
  opts: { batchSize?: number; localConcurrency?: number } = {},
): Promise<void> {
  await boss.work<EnvelopedData<N>>(
    name,
    { batchSize: opts.batchSize ?? 4, localConcurrency: opts.localConcurrency ?? 2 },
    async (jobs) => {
      for (const job of jobs) {
        const { __requestId, ...data } = job.data;
        await runWithContext({ requestId: __requestId }, async () => {
          const log = logger().child({ jobId: job.id, jobName: name });
          const started = Date.now();
          try {
            log.info({ data }, 'job.start');
            await handler(data as unknown as JobMap[N]);
            log.info({ ms: Date.now() - started }, 'job.ok');
          } catch (err) {
            log.error({ err, ms: Date.now() - started }, 'job.fail');
            throw err;
          }
        });
      }
    },
  );
}

/**
 * pg-boss v12 does not emit a `failed` event on the boss instance.
 * Instead, jobs that exhaust retries are moved to a configured dead-letter queue.
 * We subscribe to the dead-letter queue ("dead-letter") and persist a row in
 * `JobDeadLetter`. Call this after `boss.start()`.
 */
export function attachDeadLetterRecorder(boss: InstanceType<typeof PgBoss>): void {
  const DL_QUEUE = 'dead-letter';

  boss
    .work<{ __originalName?: string; __originalId?: string; error?: string; [key: string]: unknown }>(
      DL_QUEUE,
      { batchSize: 10, localConcurrency: 1 },
      async (jobs) => {
        for (const job of jobs) {
          const { __originalName, __originalId, error, ...payload } = job.data;
          const jobName = __originalName ?? job.name;
          const jobId = __originalId ?? job.id;

          await prisma.jobDeadLetter
            .create({
              data: {
                jobName,
                jobId,
                payload: payload as object,
                error: typeof error === 'string' ? error : String(error ?? ''),
              },
            })
            .catch((err) => logger().error({ err }, 'dead-letter.persist.fail'));

          logger().error({ jobId, jobName }, 'job.dead-letter');
        }
      },
    )
    .catch((err) => logger().error({ err }, 'dead-letter.worker.register.fail'));
}
