import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { OrganizationService } from '@/modules/organizations';
import { LeagueService } from '@/modules/leagues';
import { TeamService } from '@/modules/teams';
import { IndependentMatchService } from '@/modules/independent-matches';
import { NotificationService } from '@/modules/notifications';
import { MatchCommentaryService } from '@/modules/match-commentary';
import { CalendarService } from '@/modules/calendar';
import { UserStatsService } from '@/modules/users';

vi.mock('@/shared/queue/client', () => ({
  queue: () => ({ publish: vi.fn().mockResolvedValue('job-1'), start: vi.fn() }),
}));

const prisma = testPrisma();

/**
 * The surfaces below were platform-wide until the tenant sweep. Each test asks
 * the same question: browsing RACC, do I see the public platform's row?
 *
 * The compiler cannot catch these — several were raw prisma queries in pages —
 * so they are pinned here instead.
 */
async function seed() {
  const superAdmin = await prisma.user.create({
    data: { email: 'super@x.es', name: 'Super', passwordHash: 'x', emailVerifiedAt: new Date(), role: 'SUPER_ADMIN' },
  });
  const org = await OrganizationService.create({ slug: 'racc', name: 'RACC' }, superAdmin.id);

  const player = await prisma.user.create({
    data: { email: 'p@x.es', name: 'Jugador Uno', phone: '600111222', passwordHash: 'x', emailVerifiedAt: new Date() },
  });
  const mate = await prisma.user.create({
    data: { email: 'm@x.es', name: 'Jugador Dos', phone: '600333444', passwordHash: 'x', emailVerifiedAt: new Date() },
  });
  await OrganizationService.ensureMember(org.id, player.id);
  await OrganizationService.ensureMember(org.id, mate.id);

  const now = Date.now();
  const dates = {
    registrationStart: new Date(now - 7 * 86_400_000),
    registrationEnd: new Date(now + 7 * 86_400_000),
    startDate: new Date(now + 14 * 86_400_000),
    endDate: new Date(now + 40 * 86_400_000),
  };
  const tenantLeague = await LeagueService.create({
    name: 'Torneo RACC', organizationId: org.id, createdByUserId: superAdmin.id, ...dates,
  });
  const publicLeague = await LeagueService.create({
    name: 'Liga Pública', createdByUserId: superAdmin.id, ...dates,
  });

  return { superAdmin, org, player, mate, tenantLeague, publicLeague };
}

describe('tenant isolation across the whole app', () => {
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('keeps pick-up matches inside their environment', async () => {
    const { org, player } = await seed();

    const inTenant = await IndependentMatchService.createOpen({
      organizerId: player.id, organizationId: org.id,
      name: 'Partidillo RACC', visibility: 'PUBLIC', maxPlayers: 4,
    });
    const inPublic = await IndependentMatchService.createOpen({
      organizerId: player.id,
      name: 'Partidillo público', visibility: 'PUBLIC', maxPlayers: 4,
    });

    expect((await IndependentMatchService.listOpen(org.id)).map((m) => m.id)).toEqual([inTenant.id]);
    expect((await IndependentMatchService.listOpen(null)).map((m) => m.id)).toEqual([inPublic.id]);
    expect((await IndependentMatchService.getForUser(player.id, org.id)).map((m) => m.id)).toEqual([inTenant.id]);

    // Guessing an id from the other environment must 404, not render.
    await expect(IndependentMatchService.getById(inPublic.id, org.id)).rejects.toThrow(/no encontrado/i);
    await expect(IndependentMatchService.getById(inTenant.id, null)).rejects.toThrow(/no encontrado/i);
    await expect(IndependentMatchService.getById(inTenant.id, org.id)).resolves.toBeTruthy();
  });

  it('separates notifications and the unread badge per environment', async () => {
    const { org, player, tenantLeague, publicLeague } = await seed();

    await NotificationService.create(
      { userId: player.id, type: 'LEAGUE_REGISTRATION_OPEN', title: 'RACC', body: 'x' },
      { scope: { leagueId: tenantLeague.id } },
    );
    await NotificationService.create(
      { userId: player.id, type: 'LEAGUE_REGISTRATION_OPEN', title: 'Pública', body: 'x' },
      { scope: { leagueId: publicLeague.id } },
    );

    const inTenant = await NotificationService.getUnread(player.id, org.id);
    const inPublic = await NotificationService.getUnread(player.id, null);
    expect(inTenant.count).toBe(1);
    expect(inTenant.items.map((i) => i.title)).toEqual(['RACC']);
    expect(inPublic.count).toBe(1);
    expect(inPublic.items.map((i) => i.title)).toEqual(['Pública']);

    // "Marcar todas como leídas" in one environment leaves the other alone.
    await NotificationService.markAllRead(player.id, org.id);
    expect((await NotificationService.getUnread(player.id, org.id)).count).toBe(0);
    expect((await NotificationService.getUnread(player.id, null)).count).toBe(1);
  });

  it('scopes crónicas, calendar and player stats', async () => {
    const { org, player, mate, tenantLeague, publicLeague } = await seed();

    // A registered, played match in each environment.
    const built = [];
    for (const [league, orgId, label] of [
      [tenantLeague, org.id, 'RACC'],
      [publicLeague, null, 'Pública'],
    ] as const) {
      const a = await TeamService.create({ name: `A ${label}`, category: 'INTERMEDIATE', createdByUserId: player.id, organizationId: orgId });
      const b = await TeamService.create({ name: `B ${label}`, category: 'INTERMEDIATE', createdByUserId: mate.id, organizationId: orgId });
      await prisma.teamMember.create({ data: { teamId: a.id, userId: mate.id } });
      await prisma.teamMember.create({ data: { teamId: b.id, userId: player.id } });
      for (const teamId of [a.id, b.id]) {
        await prisma.leagueRegistration.create({
          data: { leagueId: league.id, teamId, registeredByUserId: player.id },
        });
      }
      const match = await prisma.match.create({
        data: {
          leagueId: league.id, teamAId: a.id, teamBId: b.id, status: 'CONFIRMED',
          winnerTeamId: a.id,
          scheduledAt: new Date(Date.UTC(2026, 6, 15, 18, 0)),
          deadlineAt: new Date(Date.UTC(2026, 6, 20)),
        },
      });
      await prisma.matchCommentary.create({
        data: { matchId: match.id, type: 'RECAP', provider: 'OPENAI', content: `Crónica ${label}` },
      });
      built.push({ label, match });
    }

    const tenantCronicas = await MatchCommentaryService.listForUser(player.id, org.id, 10);
    const publicCronicas = await MatchCommentaryService.listForUser(player.id, null, 10);
    expect(tenantCronicas.map((c) => c.content)).toEqual(['Crónica RACC']);
    expect(publicCronicas.map((c) => c.content)).toEqual(['Crónica Pública']);

    const tenantCal = await CalendarService.listMatchesForUserMonth(player.id, 2026, 7, org.id);
    const publicCal = await CalendarService.listMatchesForUserMonth(player.id, 2026, 7, null);
    expect(tenantCal).toHaveLength(1);
    expect(publicCal).toHaveLength(1);
    expect(tenantCal[0]!.id).toBe(built[0]!.match.id);
    expect(publicCal[0]!.id).toBe(built[1]!.match.id);

    // Stats must not aggregate across environments: one played match each.
    const tenantStats = await UserStatsService.getStats(player.id, org.id);
    const publicStats = await UserStatsService.getStats(player.id, null);
    expect(tenantStats.overall.played).toBe(1);
    expect(publicStats.overall.played).toBe(1);
  });

  it('scopes team lookup by id so a cross-tenant team 404s', async () => {
    const { org, player } = await seed();
    const publicTeam = await TeamService.create({
      name: 'Pareja pública', category: 'INTERMEDIATE', createdByUserId: player.id,
    });

    await expect(TeamService.getPublicProfile(publicTeam.id, player.id, org.id)).rejects.toThrow(
      /no encontrado/i,
    );
    await expect(TeamService.getPublicProfile(publicTeam.id, player.id, null)).resolves.toBeTruthy();
  });

  it('tells only the tenant’s members that a competition opened', async () => {
    const { org, tenantLeague, publicLeague } = await seed();
    const outsider = await prisma.user.create({
      data: { email: 'out@x.es', name: 'Fuera', passwordHash: 'x', emailVerifiedAt: new Date() },
    });

    const { LeagueNotificationService } = await import('@/modules/leagues');
    await LeagueNotificationService.notifyRegistrationOpen(tenantLeague.id);

    const outsiderGot = await prisma.notification.count({
      where: { userId: outsider.id, type: 'LEAGUE_REGISTRATION_OPEN' },
    });
    expect(outsiderGot).toBe(0);

    const tenantNotifs = await prisma.notification.findMany({
      where: { type: 'LEAGUE_REGISTRATION_OPEN' },
      select: { organizationId: true },
    });
    expect(tenantNotifs.length).toBeGreaterThan(0);
    expect(tenantNotifs.every((n) => n.organizationId === org.id)).toBe(true);

    // The public competition still fans out to everyone of that level.
    await LeagueNotificationService.notifyRegistrationOpen(publicLeague.id);
    expect(
      await prisma.notification.count({
        where: { userId: outsider.id, type: 'LEAGUE_REGISTRATION_OPEN', organizationId: null },
      }),
    ).toBe(1);
  });
});
