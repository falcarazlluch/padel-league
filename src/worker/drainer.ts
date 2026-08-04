import type { PgBoss } from 'pg-boss';
import { logger } from '@/shared/logger';
import { type JobName } from '@/shared/queue/jobs';
import {
  DEAD_LETTER_QUEUE,
  DEFAULT_BATCH,
  runQueueBatch,
  type AnyHandler,
} from './run-queue';
import { noopHandler } from './handlers/noop';
import { sendEmailHandler } from './handlers/send-email';
import { sessionCleanupHandler } from './handlers/session-cleanup';
import { anonymizeUserHandler } from './handlers/anonymize-user';
import { matchAutoApproveResultHandler } from './handlers/match-auto-approve-result';
import { generateMatchCommentaryHandler } from './handlers/generate-match-commentary';
import { leagueFinalizeHandler } from './handlers/league-finalize';
import { sendPushHandler } from './handlers/send-push';

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

      const batch = await runQueueBatch(boss, name, handler, { batchSize });
      stats.processed += batch.processed;
      stats.failed += batch.failed;
      stats.deadLettered += batch.deadLettered;
      if (batch.workDone) workDone = true;
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
