import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger';
import { queue } from '@/shared/queue/client';
import { registerHandler, attachDeadLetterRecorder } from '@/shared/queue/worker';
import { noopHandler } from './handlers/noop';

async function main() {
  env();
  const log = logger();
  log.info('worker.booting');

  const q = queue();
  await q.start();
  const boss = q.raw();
  attachDeadLetterRecorder(boss);

  await registerHandler(boss, 'noop', noopHandler);

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
