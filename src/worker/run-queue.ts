import type { PgBoss } from 'pg-boss';
import { logger } from '@/shared/logger';
import { runWithContext } from '@/shared/logger/context';
import { prisma } from '@/shared/db/client';
import type { JobName } from '@/shared/queue/jobs';

export const DEAD_LETTER_QUEUE = 'dead-letter';
export const DEFAULT_BATCH = 5;

export type AnyHandler = (data: unknown) => Promise<void>;

export interface QueueRunStats {
  processed: number;
  failed: number;
  deadLettered: number;
  /** False when the fetch came back empty, so callers know to stop looping. */
  workDone: boolean;
}

/**
 * Fetch one batch off `name` and run it, with the bookkeeping every consumer
 * needs: request-id context, completion, failure recording and a JobDeadLetter
 * row per attempt.
 *
 * Lives apart from `drainer.ts` on purpose. The drainer imports every handler —
 * including `send-push`, which drags `web-push` and Node's `https` into whatever
 * bundle touches it. The post-response email flush only needs `send-email`, so it
 * pairs this with that one handler and stays light.
 */
export async function runQueueBatch(
  boss: InstanceType<typeof PgBoss>,
  name: JobName,
  handler: AnyHandler,
  opts: { batchSize?: number } = {},
): Promise<QueueRunStats> {
  const log = logger();
  const stats: QueueRunStats = { processed: 0, failed: 0, deadLettered: 0, workDone: false };

  // includeMetadata: true gives us retryCount / retryLimit so we can detect the
  // final attempt and persist a JobDeadLetter row with the real error.
  const jobs = await boss.fetch<Record<string, unknown> & { __requestId?: string }>(name, {
    batchSize: opts.batchSize ?? DEFAULT_BATCH,
    includeMetadata: true,
  });
  if (jobs.length === 0) return stats;
  stats.workDone = true;

  for (const job of jobs) {
    const { __requestId, ...payload } = job.data as Record<string, unknown> & {
      __requestId?: string;
    };
    try {
      await runWithContext({ requestId: __requestId }, async () => {
        await handler(payload as unknown);
      });
      await boss.complete(name, job.id);
      stats.processed++;
    } catch (err) {
      const errorMessage = String((err as Error)?.message ?? err).slice(0, 2000);
      const retryCount = job.retryCount ?? 0;
      const retryLimit = job.retryLimit ?? 0;
      const willRetry = retryCount + 1 < retryLimit;

      log.error(
        { err, jobId: job.id, queue: name, retryCount, retryLimit, willRetry },
        'drain.job.fail',
      );

      // Record EVERY failure to JobDeadLetter so we get fast feedback in
      // /admin/cola without having to wait through 3 retries first. The error
      // column distinguishes attempts via the prefix.
      const attemptInfo = `[attempt ${retryCount + 1}/${retryLimit}${willRetry ? '' : ' final'}]`;
      await prisma.jobDeadLetter
        .create({
          data: {
            jobName: name,
            jobId: job.id,
            payload: payload as object,
            error: `${attemptInfo} ${errorMessage}`,
          },
        })
        .catch((dlErr) => log.error({ dlErr, jobId: job.id }, 'drain.dl.persist.fail'));
      if (!willRetry) stats.deadLettered++;

      await boss
        .fail(name, job.id, { error: errorMessage })
        .catch((failErr) => log.error({ failErr, jobId: job.id }, 'drain.job.fail.recordError'));
      stats.failed++;
    }
  }

  return stats;
}
