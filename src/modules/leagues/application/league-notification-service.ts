import { prisma } from '@/shared/db/client';
import { CATEGORY_LABEL } from '../domain/category';

export const LeagueNotificationService = {
  /**
   * Idempotent. Notifies every alive user whose `User.category` matches the
   * league's category and marks the league as notified. Safe to call multiple
   * times — only the first call (when `registrationOpenNotifiedAt` is null)
   * actually creates notifications.
   */
  async notifyRegistrationOpen(leagueId: string): Promise<{ recipients: number }> {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        organizationId: true,
        registrationOpenNotifiedAt: true,
      },
    });
    if (!league || league.registrationOpenNotifiedAt !== null) {
      return { recipients: 0 };
    }

    // Inside a tenant only its members hear about a new competition; on the
    // public platform, everyone of that level as before.
    const recipients = await prisma.user.findMany({
      where: {
        category: league.category,
        deletedAt: null,
        ...(league.organizationId
          ? { organizationMemberships: { some: { organizationId: league.organizationId } } }
          : {}),
      },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      if (recipients.length > 0) {
        await tx.notification.createMany({
          data: recipients.map((r) => ({
            userId: r.id,
            organizationId: league.organizationId,
            type: 'LEAGUE_REGISTRATION_OPEN' as const,
            title: 'Nueva liga abierta',
            body: `Se ha abierto la inscripción de "${league.name}" (${CATEGORY_LABEL[league.category]}).`,
            metadata: { leagueId: league.id, leagueSlug: league.slug },
          })),
        });
      }
      await tx.league.update({
        where: { id: leagueId },
        data: { registrationOpenNotifiedAt: new Date() },
      });
    });

    return { recipients: recipients.length };
  },
} as const;
