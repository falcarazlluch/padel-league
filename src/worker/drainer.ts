import type { PgBoss } from 'pg-boss';
import { logger } from '@/shared/logger';
import { runWithContext } from '@/shared/logger/context';
import { prisma } from '@/shared/db/client';
import { type JobMap, type JobName } from '@/shared/queue/jobs';
import { noopHandler } from './handlers/noop';
import { sendEmailHandler } from './handlers/send-email';
import { sessionCleanupHandler } from './handlers/session-cleanup';
import { anonymizeUserHandler } from './handlers/anonymize-user';
import { matchAutoApproveResultHandler } from './handlers/match-auto-approve-result';
import { generateMatchCommentaryHandler } from './handlers/generate-match-commentary';
import { leagueFinalizeHandler } from './handlers/league-finalize';
import { sendPushHandler } from './handlers/send-push';

const DEAD_LETTER_QUEUE = 'dead-letter';
const DEFAULT_BATCH = 5;

type AnyHandler = (data: unknown) => Promise<void>;

const HANDLERS: Partial<Record<JobName, AnyHandler>> = {
  noop: noopHandler as AnyHandler,
  'send-email': sendEmailHandler as AnyHandler,
  'session-cleanup': sessionCleanupHandler as AnyHandler,
  'anonymize-user': anonymizeUserHandler as AnyHandler,
  'match-auto-approve-result': matchAutoApproveResultHandler as AnyHandler,
  'generate-match-commentary': generateMatchCommentaryHandler as AnyHandler,
  'league-finalize': leagueFinalizeHandler as AnyHandler,
  'send-push': sendPushHandler as AnyHandler,
  // 'match-reminder' is declared in JobMap but has no handler yet.
};

export interface DrainOptions {
  deadlineMs: number;
  batchSize?: number;
}

export interface DrainStats {
  processed: number;
  failed: number;
  deadLettered: number;
  durationMs: number;
}

export async function drainPendingJobs(
  boss: InstanceType<typeof PgBoss>,
  opts: DrainOptions,
): Promise<DrainStats> {
  const log = logger();
  const startedAt = Date.now();
  const deadline = startedAt + opts.deadlineMs;
  const batchSize = opts.batchSize ?? DEFAULT_BATCH;
  const stats: DrainStats = { processed: 0, failed: 0, deadLettered: 0, durationMs: 0 };

  const queues = Object.keys(HANDLERS) as JobName[];

  while (Date.now() < deadline) {
    let workDone = false;

    for (const name of queues) {
      if (Date.now() >= deadline) break;
      const handler = HANDLERS[name];
      if (!handler) continue;

      // includeMetadata: true gives us retryCount / retryLimit so we can detect
      // the final attempt and persist a JobDeadLetter row with the real error.
      const jobs = await boss.fetch<JobMap[typeof name] & { __requestId?: string }>(name, {
        batchSize,
        includeMetadata: true,
      });
      if (jobs.length === 0) continue;
      workDone = true;

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
          // /admin/cola without having to wait through 3 retries first. The
          // error column distinguishes attempts via the prefix.
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
          if (!willRetry) {
            stats.deadLettered++;
          }

          await boss
            .fail(name, job.id, { error: errorMessage })
            .catch((failErr) => log.error({ failErr, jobId: job.id }, 'drain.job.fail.recordError'));
          stats.failed++;
        }
      }
    }

    // Drain pg-boss native dead-letter routing too, so the queue doesn't bloat
    // with empty-payload entries from earlier retry-exhausted jobs.
    if (Date.now() < deadline) {
      const dlJobs = await boss.fetch<Record<string, unknown>>(DEAD_LETTER_QUEUE, { batchSize });
      if (dlJobs.length > 0) workDone = true;
      for (const job of dlJobs) {
        await boss
          .complete(DEAD_LETTER_QUEUE, job.id)
          .catch((err) => log.error({ err, jobId: job.id }, 'drain.dl-queue.complete.fail'));
      }
    }

    if (!workDone) break;
  }

  stats.durationMs = Date.now() - startedAt;
  log.info({ ...stats }, 'drain.complete');
  return stats;
}
