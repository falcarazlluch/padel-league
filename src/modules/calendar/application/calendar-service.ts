import { prisma } from '@/shared/db/client';
import type { CalendarMatch, CalendarItemStatus } from '../domain/types';

export function monthRangeUtc(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 1, 0, 0, 0)),
  };
}

function leagueMatchStatusToCalendar(status: string): CalendarItemStatus {
  return status === 'DATE_PROPOSED' ? 'TENTATIVE' : 'CONFIRMED';
}

export const CalendarService = {
  async listMatchesForUserMonth(userId: string, year: number, month: number): Promise<CalendarMatch[]> {
    const { start, end } = monthRangeUtc(year, month);

    const teamMembers = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const userTeamIds = teamMembers.map((m) => m.teamId);

    const [ownLeague, otherLeague, independent] = await Promise.all([
      // A — own-team league matches
      prisma.match.findMany({
        where: {
          scheduledAt: { gte: start, lt: end },
          status: { not: 'CANCELLED' },
          OR: [
            { teamA: { members: { some: { userId } } } },
            { teamB: { members: { some: { userId } } } },
          ],
        },
        include: {
          teamA: { select: { id: true, name: true } },
          teamB: { select: { id: true, name: true } },
          league: { select: { slug: true } },
        },
      }),
      // B — other matches in user's leagues
      prisma.match.findMany({
        where: {
          scheduledAt: { gte: start, lt: end },
          status: { not: 'CANCELLED' },
          league: {
            registrations: {
              some: { withdrawnAt: null, team: { members: { some: { userId } } } },
            },
          },
          NOT: {
            OR: [
              { teamA: { members: { some: { userId } } } },
              { teamB: { members: { some: { userId } } } },
            ],
          },
        },
        include: {
          teamA: { select: { id: true, name: true } },
          teamB: { select: { id: true, name: true } },
          league: { select: { slug: true } },
        },
      }),
      // C — independent matches
      prisma.independentMatch.findMany({
        where: {
          scheduledAt: { gte: start, lt: end },
          status: { not: 'CANCELLED' },
          OR: [
            { organizerId: userId },
            { participants: { some: { userId, status: 'ACCEPTED' } } },
            {
              invitations: {
                some: {
                  invitedUserId: userId,
                  acceptedAt: null,
                  expiresAt: { gt: new Date() },
                },
              },
            },
            ...(userTeamIds.length > 0
              ? [
                  {
                    invitations: {
                      some: {
                        invitedTeamId: { in: userTeamIds },
                        acceptedAt: null,
                        expiresAt: { gt: new Date() },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
      }),
    ]);

    const items: CalendarMatch[] = [];

    for (const m of ownLeague) {
      // Solo matches con ambos equipos. Para Americana ROTATING_INDIVIDUAL
      // habrá un calendar item específico cuando se complete sub-fase 4.
      if (!m.teamA || !m.teamB) continue;
      items.push({
        id: m.id,
        category: 'OWN_LEAGUE',
        status: leagueMatchStatusToCalendar(m.status),
        scheduledAt: m.scheduledAt!,
        title: `${m.teamA.name} vs ${m.teamB.name}`,
        href: `/ligas/${m.league.slug}/partidos/${m.id}`,
      });
    }
    for (const m of otherLeague) {
      if (!m.teamA || !m.teamB) continue;
      items.push({
        id: m.id,
        category: 'OTHER_LEAGUE_MINE',
        status: leagueMatchStatusToCalendar(m.status),
        scheduledAt: m.scheduledAt!,
        title: `${m.teamA.name} vs ${m.teamB.name}`,
        href: `/ligas/${m.league.slug}/partidos/${m.id}`,
      });
    }
    for (const m of independent) {
      items.push({
        id: m.id,
        category: 'INDEPENDENT',
        status: 'CONFIRMED',
        scheduledAt: m.scheduledAt!,
        title: m.name,
        href: `/jugar/${m.id}`,
      });
    }

    items.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    return items;
  },
} as const;
