import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger';
import { queue } from '@/shared/queue/client';
import { registerHandler, attachDeadLetterRecorder } from '@/shared/queue/worker';
import { noopHandler } from './handlers/noop';
import { sendEmailHandler } from './handlers/send-email';
import { sessionCleanupHandler } from './handlers/session-cleanup';
import { anonymizeUserHandler } from './handlers/anonymize-user';
import { matchAutoApproveResultHandler } from './handlers/match-auto-approve-result';
import { leagueFinalizeHandler } from './handlers/league-finalize';
import { generateMatchCommentaryHandler } from './handlers/generate-match-commentary';
import { sendPushHandler } from './handlers/send-push';

async function main() {
  env();
  const log = logger();
  log.info('worker.booting');

  const q = queue();
  await q.start();
  const boss = q.raw();
  attachDeadLetterRecorder(boss);

  await registerHandler(boss, 'noop', noopHandler);
  await registerHandler(boss, 'send-email', sendEmailHandler);
  await registerHandler(boss, 'session-cleanup', sessionCleanupHandler);
  await registerHandler(boss, 'anonymize-user', anonymizeUserHandler);
  await registerHandler(boss, 'match-auto-approve-result', matchAutoApproveResultHandler);
  await registerHandler(boss, 'generate-match-commentary', generateMatchCommentaryHandler);
  await registerHandler(boss, 'league-finalize', leagueFinalizeHandler);
  await registerHandler(boss, 'send-push', sendPushHandler);

  log.info('worker.ready');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'worker.shutdown.start');
    try {
      await q.stop();
      log.info('worker.shutdown.ok');
      process.exit(0);
    } catch (err) {
      log.error({ err }, 'worker.shutdown.err');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger().fatal({ err }, 'worker.fatal');
  process.exit(1);
});
