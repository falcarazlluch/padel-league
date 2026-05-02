import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { LeagueNotificationService } from '@/modules/leagues';

const prisma = testPrisma();

async function user(name: string, suffix: string, category: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED', deleted = false) {
  return prisma.user.create({
    data: {
      name,
      email: `${suffix}@t.com`,
      passwordHash: 'h',
      emailVerifiedAt: new Date(),
      category,
      deletedAt: deleted ? new Date() : null,
    },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('LeagueNotificationService.notifyRegistrationOpen — integration', () => {
  it('only notifies alive users with matching category and is idempotent', async () => {
    const admin = await user('Admin', `adm-${Date.now()}`, 'INTERMEDIATE');
    const matchA = await user('Match A', `ma-${Date.now()}`, 'INTERMEDIATE');
    const matchB = await user('Match B', `mb-${Date.now()}`, 'INTERMEDIATE');
    const wrongLevel = await user('Avanzado', `av-${Date.now()}`, 'ADVANCED');
    const deleted = await user('Deleted', `del-${Date.now()}`, 'INTERMEDIATE', true);

    const league = await prisma.league.create({
      data: {
        name: 'Liga Otoño',
        slug: `liga-otono-${Date.now()}`,
        category: 'INTERMEDIATE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000 * 30),
        registrationStart: new Date(),
        registrationEnd: new Date(Date.now() + 86400000 * 7),
        status: 'DRAFT',
        createdByUserId: admin.id,
      },
    });

    const first = await LeagueNotificationService.notifyRegistrationOpen(league.id);
    expect(first.recipients).toBe(3);

    const notifs = await prisma.notification.findMany({
      where: { type: 'LEAGUE_REGISTRATION_OPEN' },
      select: { userId: true },
    });
    const ids = notifs.map((n) => n.userId).sort();
    expect(ids).toEqual([admin.id, matchA.id, matchB.id].sort());
    expect(ids).not.toContain(wrongLevel.id);
    expect(ids).not.toContain(deleted.id);

    const reloaded = await prisma.league.findUniqueOrThrow({ where: { id: league.id } });
    expect(reloaded.registrationOpenNotifiedAt).not.toBeNull();

    const second = await LeagueNotificationService.notifyRegistrationOpen(league.id);
    expect(second.recipients).toBe(0);

    const notifsAfter = await prisma.notification.count({
      where: { type: 'LEAGUE_REGISTRATION_OPEN' },
    });
    expect(notifsAfter).toBe(3);
  });
});
