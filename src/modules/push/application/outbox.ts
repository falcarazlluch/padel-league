import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import { env } from '@/shared/config/env';
import { queue } from '@/shared/queue/client';

// Sweep window: only push notifications created in the last 5 minutes. Older
// rows are stamped as dispatched without actually firing — this is intentional
// so the first deploy after enabling the feature doesn't blast every existing
// notification as a push.
const SWEEP_WINDOW_MS = 5 * 60 * 1000;
const BATCH_SIZE = 200;

export async function runPushOutboxTick(): Promise<{ enqueued: number; skipped: number }> {
  if (!env().FEATURE_WEB_PUSH) {
    return { enqueued: 0, skipped: 0 };
  }

  const cutoff = new Date(Date.now() - SWEEP_WINDOW_MS);
  const result: { enqueued: number; skipped: number } = { enqueued: 0, skipped: 0 };

  // Mark old undispatched rows as dispatched without queuing — keeps the
  // index small and avoids ever delivering a stale push if the cutoff window
  // is later widened.
  const stale = await prisma.notification.updateMany({
    where: { pushDispatchedAt: null, createdAt: { lt: cutoff } },
    data: { pushDispatchedAt: new Date() },
  });
  result.skipped = stale.count;

  // Pick fresh ones. We do a non-transactional select+update — duplicates are
  // prevented at enqueue time by `singletonKey: notification.id`.
  const fresh = await prisma.notification.findMany({
    where: { pushDispatchedAt: null, createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true },
  });
  if (fresh.length === 0) return result;

  const q = queue();
  await q.start();

  // Enqueue first, then stamp. If pg-boss fails halfway the next tick will
  // pick the same rows up again (still inside the 5-min window).
  for (const row of fresh) {
    try {
      await q.publish(
        'send-push',
        { notificationId: row.id },
        { singletonKey: row.id, retryLimit: 1, expireInSeconds: 120 },
      );
      result.enqueued++;
    } catch (err) {
      logger().error({ err, notificationId: row.id }, 'push.outbox.enqueue.fail');
    }
  }

  const ids = fresh.slice(0, result.enqueued).map((r) => r.id);
  if (ids.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: { pushDispatchedAt: new Date() },
    });
  }

  return result;
}
