import { logger } from '@/shared/logger';
import type { JobMap } from '@/shared/queue/jobs';

export function noopHandler(data: JobMap['noop']): Promise<void> {
  logger().info({ ping: data.ping }, 'noop.received');
  return Promise.resolve();
}
