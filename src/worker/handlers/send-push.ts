import { logger } from '@/shared/logger';
import { PushService } from '@/modules/push';
import type { JobMap } from '@/shared/queue/jobs';

export async function sendPushHandler(data: JobMap['send-push']): Promise<void> {
  const { notificationId } = data;
  if (typeof notificationId !== 'string' || notificationId.length === 0) {
    logger().warn({ data }, 'send-push.skip.invalid_payload');
    return;
  }
  const result = await PushService.sendForNotification(notificationId);
  logger().info({ notificationId, ...result }, 'send-push.done');
}
