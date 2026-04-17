import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import type { JobMap } from '@/shared/queue/jobs';

export async function sessionCleanupHandler(_data: JobMap['session-cleanup']): Promise<void> {
  const result = await prisma.session.deleteMany({
    where: { expires: { lt: new Date() } },
  });
  logger().info({ deleted: result.count }, 'session-cleanup.done');
}
