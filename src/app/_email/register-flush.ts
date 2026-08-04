import { registerEmailFlusher, scheduleEmailFlush } from '@/shared/queue/email';
import { queue } from '@/shared/queue/client';
import { runQueueBatch } from '@/worker/run-queue';
import { sendEmailHandler } from '@/worker/handlers/send-email';

/** How long the post-response flush may spend delivering. */
const FLUSH_DEADLINE_MS = 12_000;

/**
 * Teaches `scheduleEmailFlush()` how to actually deliver, and wires it on import.
 *
 * Two boundaries meet here, which is why it is a separate module:
 *
 *  - Only the app layer may execute worker handlers in-process (`app → worker`),
 *    the same concession `/api/cron/heartbeat` relies on because Vercel runs no
 *    long-lived worker. `shared` therefore holds just the hook.
 *  - Only `send-email` is imported, never the full drainer: that one pulls in
 *    `send-push` → `web-push` → Node's `https`, which has no business in the
 *    bundle of a server action.
 *
 * Registering as a module side effect means any route that imports
 * `scheduleEmailFlush` from here is wired before it can call it — including the
 * domain services it goes on to invoke, which reach the hook through `shared`.
 */
registerEmailFlusher(async () => {
  const q = queue();
  await q.start();
  const deadline = Date.now() + FLUSH_DEADLINE_MS;
  // Loop so a burst larger than one batch (a team invite mails every member)
  // still leaves in this pass rather than dribbling out over later requests.
  while (Date.now() < deadline) {
    const batch = await runQueueBatch(q.raw(), 'send-email', sendEmailHandler as (d: unknown) => Promise<void>);
    if (!batch.workDone) break;
  }
});

export { scheduleEmailFlush };
