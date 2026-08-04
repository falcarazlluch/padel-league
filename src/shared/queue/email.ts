import { after } from 'next/server';
import { logger } from '@/shared/logger';

/**
 * Immediate delivery of queued emails.
 *
 * Why this exists: on Vercel there is no long-lived worker, so the only consumer
 * of pg-boss was the daily `/api/cron/heartbeat`. Every email waited until the
 * small hours, which makes a password reset or a partner invite useless.
 * Publishing still happens first — that is what gives us the EmailLog row, the
 * dedup key and the retries — and this drains the `send-email` queue right
 * afterwards so the message actually leaves within seconds.
 *
 * The drain itself lives in the app layer (`src/app/_email/register-flush.ts`):
 * running worker handlers in-process is an app-layer concession to Vercel, and
 * `shared` is not allowed to depend on `src/worker`. So this module holds only
 * the hook — whoever may legally execute handlers registers itself at server
 * start, and callers stay oblivious.
 */
type EmailFlusher = () => Promise<void>;

let flusher: EmailFlusher | null = null;

/** Wired once at server start, from the app layer. */
export function registerEmailFlusher(fn: EmailFlusher): void {
  flusher = fn;
}

/**
 * Deliver the queued `send-email` jobs as soon as this response is out.
 *
 * `after()` runs once the response has been flushed, so the user never waits on
 * Resend. If the flush fails, or the platform cuts it short, the job stays
 * queued and the nightly cron still picks it up: the old behaviour becomes the
 * fallback instead of the norm.
 *
 * Safe to call anywhere. With no flusher registered (worker, scripts, tests) it
 * is a no-op, and outside a request scope `after()` throws and we swallow it —
 * in the worker the drain loop is already running, so there is nothing to
 * schedule.
 */
export function scheduleEmailFlush(): void {
  const run = flusher;
  if (!run) return;
  try {
    after(async () => {
      try {
        await run();
      } catch (err) {
        // Never surface this: the email is queued and the cron is the backstop.
        logger().warn({ err }, 'email.flush.failed');
      }
    });
  } catch {
    // No request scope — nothing to schedule.
  }
}
