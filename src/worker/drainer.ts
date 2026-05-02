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

      const jobs = await boss.fetch<JobMap[typeof name] & { __requestId?: string }>(name, { batchSize });
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
          log.error({ err, jobId: job.id, queue: name }, 'drain.job.fail');
          await boss
            .fail(name, job.id, { error: String((err as Error)?.message ?? err) })
            .catch((failErr) => log.error({ failErr, jobId: job.id }, 'drain.job.fail.recordError'));
          stats.failed++;
        }
      }
    }

    // Dead-letter queue: persist exhausted-retry jobs to JobDeadLetter so they
    // are visible for ops, then mark complete so they don't loop.
    if (Date.now() < deadline) {
      const dlJobs = await boss.fetch<{
        __originalName?: string;
        __originalId?: string;
        error?: string;
        [k: string]: unknown;
      }>(DEAD_LETTER_QUEUE, { batchSize });
      if (dlJobs.length > 0) workDone = true;

      for (const job of dlJobs) {
        const { __originalName, __originalId, error, ...payload } = job.data;
        try {
          await prisma.jobDeadLetter.create({
            data: {
              jobName: __originalName ?? job.name,
              jobId: __originalId ?? job.id,
              payload: payload as object,
              error: typeof error === 'string' ? error : String(error ?? ''),
            },
          });
          stats.deadLettered++;
        } catch (err) {
          log.error({ err }, 'drain.dead-letter.persist.fail');
        }
        await boss
          .complete(DEAD_LETTER_QUEUE, job.id)
          .catch((err) => log.error({ err, jobId: job.id }, 'drain.dead-letter.complete.fail'));
      }
    }

    if (!workDone) break;
  }

  stats.durationMs = Date.now() - startedAt;
  log.info({ ...stats }, 'drain.complete');
  return stats;
}
