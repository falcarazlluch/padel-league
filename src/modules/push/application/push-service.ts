import webpush from 'web-push';
import { prisma } from '@/shared/db/client';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger';
import type { NotificationType } from '@prisma/client';
import { categoryFor, isEnabled } from './notification-categories';
import { PreferencesService } from './preferences-service';
import { buildPushPayload, type PushPayload } from './payload-builder';

const MAX_SUBS_PER_USER = 10;

let vapidConfigured = false;
function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const e = env();
  if (!e.FEATURE_WEB_PUSH || !e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY || !e.VAPID_SUBJECT) {
    return false;
  }
  webpush.setVapidDetails(e.VAPID_SUBJECT, e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

export type SubscribeInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

export const PushService = {
  /**
   * Upsert by endpoint. If another user owned this endpoint we reassign it
   * (same browser, account swap). Caps subscriptions per user at MAX_SUBS_PER_USER
   * by deleting the oldest ones first (LRU on lastSeenAt).
   */
  async subscribe(userId: string, input: SubscribeInput): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: {
          userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent ?? null,
        },
        update: {
          userId,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent ?? null,
          lastSeenAt: new Date(),
          lastErrorAt: null,
        },
      });

      const subs = await tx.pushSubscription.findMany({
        where: { userId },
        orderBy: { lastSeenAt: 'desc' },
        select: { id: true },
      });
      if (subs.length > MAX_SUBS_PER_USER) {
        const stale = subs.slice(MAX_SUBS_PER_USER).map((s) => s.id);
        await tx.pushSubscription.deleteMany({ where: { id: { in: stale } } });
      }
    });
  },

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  },

  /**
   * Send a push for a single Notification row. Reads the user's preferences,
   * filters by category, fans out to every active subscription. Returns the
   * number of subs that were attempted; cleans up dead ones (404/410).
   *
   * Returns instead of throwing on terminal per-sub errors so a single bad
   * device doesn't fail the whole job — but transient/upstream errors are
   * re-thrown so pg-boss can retry once (retryLimit 1 in the handler).
   */
  async sendForNotification(notificationId: string): Promise<{ attempted: number; sent: number }> {
    if (!ensureVapid()) {
      logger().debug({ notificationId }, 'push.send.skip.disabled');
      return { attempted: 0, sent: 0 };
    }

    const n = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: {
        id: true,
        userId: true,
        type: true,
        title: true,
        body: true,
        metadata: true,
      },
    });
    if (!n) return { attempted: 0, sent: 0 };

    const category = categoryFor(n.type);
    const prefs = await PreferencesService.get(n.userId);
    if (!isEnabled(prefs, category)) {
      logger().debug({ notificationId, category }, 'push.send.skip.preference');
      return { attempted: 0, sent: 0 };
    }

    const subs = await prisma.pushSubscription.findMany({
      where: { userId: n.userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subs.length === 0) return { attempted: 0, sent: 0 };

    const payload = await buildPushPayload(n);
    const body = JSON.stringify(payload);

    let sent = 0;
    let transientFailures = 0;
    for (const sub of subs) {
      const ok = await sendOne(sub, body, payload, n.type);
      if (ok === 'sent') sent++;
      else if (ok === 'retry') transientFailures++;
    }

    if (transientFailures > 0) {
      // Surface a retryable error to pg-boss only when ALL deliveries failed
      // with transient codes — otherwise some users got the push and we don't
      // want to re-fire to them (tag dedup helps but is not guaranteed across
      // providers).
      if (sent === 0 && transientFailures === subs.length) {
        throw new Error(`push.send.transient_failure (${transientFailures} subs)`);
      }
    }

    return { attempted: subs.length, sent };
  },
};

type SendResult = 'sent' | 'gone' | 'config' | 'retry';

async function sendOne(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  body: string,
  payload: PushPayload,
  type: NotificationType,
): Promise<SendResult> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      body,
      { TTL: 60 * 60 * 24, urgency: 'normal' },
    );
    await prisma.pushSubscription
      .update({ where: { id: sub.id }, data: { lastSeenAt: new Date(), lastErrorAt: null } })
      .catch(() => undefined);
    return 'sent';
  } catch (err) {
    const status = (err as { statusCode?: number } | null)?.statusCode;
    if (status === 404 || status === 410) {
      // Subscription expired — clean up.
      await prisma.pushSubscription
        .delete({ where: { id: sub.id } })
        .catch(() => undefined);
      logger().info({ subId: sub.id, status, type }, 'push.send.gone.deleted');
      return 'gone';
    }
    if (status === 401 || status === 403) {
      logger().error({ subId: sub.id, status, type, err }, 'push.send.config_error');
      await markError(sub.id);
      return 'config';
    }
    if (status === 413) {
      // Payload too large — config bug in our code, not retryable.
      logger().error({ subId: sub.id, payloadBytes: body.length, type }, 'push.send.payload_too_large');
      await markError(sub.id);
      return 'config';
    }
    // 429 / 5xx / network — let pg-boss retry once (handled at the caller).
    logger().warn({ subId: sub.id, status, type, err }, 'push.send.transient');
    await markError(sub.id);
    return 'retry';
  }
}

async function markError(subId: string): Promise<void> {
  await prisma.pushSubscription
    .update({ where: { id: subId }, data: { lastErrorAt: new Date() } })
    .catch(() => undefined);
}
