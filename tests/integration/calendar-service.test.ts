import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { CalendarService } from '@/modules/calendar';

const prisma = testPrisma();

async function user(name: string, suffix: string) {
  return prisma.user.create({
    data: { name, email: `${suffix}@t.com`, passwordHash: 'h', emailVerifiedAt: new Date() },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('CalendarService.listMatchesForUserMonth — integration', () => {
  it('returns own-team league matches as OWN_LEAGUE and others as OTHER_LEAGUE_MINE', async () => {
    const me = await user('Me', `me-${Date.now()}`);
    const partner = await user('Partner', `pa-${Date.now()}`);
    const rivalA1 = await user('R1', `r1-${Date.now()}`);
    const rivalA2 = await user('R2', `r2-${Date.now()}`);
    const rivalB1 = await user('R3', `r3-${Date.now()}`);
    const rivalB2 = await user('R4', `r4-${Date.now()}`);

    const myTeam = await prisma.team.create({
      data: {
        name: 'Mi Equipo',
        category: 'INTERMEDIATE',
        createdByUserId: me.id,
        members: { create: [{ userId: me.id }, { userId: partner.id }] },
      },
    });
    const teamX = await prisma.team.create({
      data: {
        name: 'Equipo X',
        category: 'INTERMEDIATE',
        createdByUserId: rivalA1.id,
        members: { create: [{ userId: rivalA1.id }, { userId: rivalA2.id }] },
      },
    });
    const teamY = await prisma.team.create({
      data: {
        name: 'Equipo Y',
        category: 'INTERMEDIATE',
        createdByUserId: rivalB1.id,
        members: { create: [{ userId: rivalB1.id }, { userId: rivalB2.id }] },
      },
    });

    const league = await prisma.league.create({
      data: {
        name: 'Liga Otoño',
        slug: `liga-otono-${Date.now()}`,
        category: 'INTERMEDIATE',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-05-30'),
        registrationStart: new Date('2026-03-01'),
        registrationEnd: new Date('2026-03-31'),
        status: 'ACTIVE',
        createdByUserId: me.id,
        registrations: {
          create: [
            { teamId: myTeam.id },
            { teamId: teamX.id },
            { teamId: teamY.id },
          ],
        },
      },
    });

    // Match where I play
    const myMatch = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: myTeam.id,
        teamBId: teamX.id,
        scheduledAt: new Date('2026-04-12T17:00:00Z'),
        status: 'DATE_CONFIRMED',
        deadlineAt: new Date('2026-04-19T17:00:00Z'),
      },
    });

    // Match between two other teams (in same league I'm registered in)
    const otherMatch = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamX.id,
        teamBId: teamY.id,
        scheduledAt: new Date('2026-04-20T17:00:00Z'),
        status: 'DATE_PROPOSED',
        deadlineAt: new Date('2026-04-27T17:00:00Z'),
      },
    });

    const result = await CalendarService.listMatchesForUserMonth(me.id, 2026, 4);
    expect(result).toHaveLength(2);

    const own = result.find((r) => r.id === myMatch.id);
    expect(own?.category).toBe('OWN_LEAGUE');
    expect(own?.status).toBe('CONFIRMED');
    expect(own?.title).toBe('Mi Equipo vs Equipo X');

    const other = result.find((r) => r.id === otherMatch.id);
    expect(other?.category).toBe('OTHER_LEAGUE_MINE');
    expect(other?.status).toBe('TENTATIVE');
    expect(other?.title).toBe('Equipo X vs Equipo Y');
  });

  it('includes independent matches I organize', async () => {
    const me = await user('Me', `me-${Date.now()}`);

    const im = await prisma.independentMatch.create({
      data: {
        organizerId: me.id,
        name: 'Sábado por la tarde',
        visibility: 'PUBLIC',
        maxPlayers: 4,
        scheduledAt: new Date('2026-04-10T17:00:00Z'),
      },
    });

    const result = await CalendarService.listMatchesForUserMonth(me.id, 2026, 4);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(im.id);
    expect(result[0]!.category).toBe('INDEPENDENT');
    expect(result[0]!.title).toBe('Sábado por la tarde');
  });

  it('strictly filters by month (no spillover to neighbour months)', async () => {
    const me = await user('Me', `me-${Date.now()}`);

    // March 31 — should NOT appear in April query
    await prisma.independentMatch.create({
      data: {
        organizerId: me.id,
        name: 'March match',
        visibility: 'PUBLIC',
        maxPlayers: 4,
        scheduledAt: new Date('2026-03-31T22:00:00Z'),
      },
    });
    // April 1 — should appear
    await prisma.independentMatch.create({
      data: {
        organizerId: me.id,
        name: 'April match',
        visibility: 'PUBLIC',
        maxPlayers: 4,
        scheduledAt: new Date('2026-04-01T05:00:00Z'),
      },
    });
    // May 1 — should NOT appear
    await prisma.independentMatch.create({
      data: {
        organizerId: me.id,
        name: 'May match',
        visibility: 'PUBLIC',
        maxPlayers: 4,
        scheduledAt: new Date('2026-05-01T05:00:00Z'),
      },
    });

    const result = await CalendarService.listMatchesForUserMonth(me.id, 2026, 4);
    expect(result.map((r) => r.title)).toEqual(['April match']);
  });
});
