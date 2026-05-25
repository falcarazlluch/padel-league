import { prisma } from '@/shared/db/client';
import { PasswordService } from '@/shared/auth/password';
import { logger } from '@/shared/logger';
import type { JobMap } from '@/shared/queue/jobs';

export async function anonymizeUserHandler(data: JobMap['anonymize-user']): Promise<void> {
  const { userId } = data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    logger().warn({ userId }, 'anonymize-user.not-found');
    return;
  }
  if (user.anonymizedAt) {
    logger().info({ userId }, 'anonymize-user.already-anonymized');
    return;
  }

  const invalidHash = await PasswordService.hash(`__anon__${Date.now()}__${Math.random()}`);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        email: `anonymized-${userId}@deleted.local`,
        name: 'Jugador anónimo',
        passwordHash: invalidHash,
        avatarUrl: null,
        phone: null,
        anonymizedAt: new Date(),
      },
    }),
    prisma.session.deleteMany({ where: { userId } }),
    // Explicit cleanup: the User row stays for FK integrity so Cascade does
    // not fire. Push channels must not survive anonymisation — otherwise a
    // reassigned cookie/device could still receive pushes for this account.
    prisma.pushSubscription.deleteMany({ where: { userId } }),
    prisma.notificationPreference.deleteMany({ where: { userId } }),
  ]);

  logger().info({ userId }, 'anonymize-user.done');
}
