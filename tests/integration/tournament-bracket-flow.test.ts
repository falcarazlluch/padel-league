import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { LeagueService } from '@/modules/leagues';

const prisma = testPrisma();

let userIdCounter = 0;
async function user(name: string) {
  userIdCounter += 1;
  return prisma.user.create({
    data: {
      name,
      email: `u${userIdCounter}-${Date.now()}@t.com`,
      passwordHash: 'h',
      emailVerifiedAt: new Date(),
      category: 'INTERMEDIATE',
      role: 'LEAGUE_ADMIN',
    },
  });
}

async function teamWithMembers(name: string, creatorId: string) {
  const member1 = await user(`${name}-m1`);
  const member2 = await user(`${name}-m2`);
  return prisma.team.create({
    data: {
      name,
      category: 'INTERMEDIATE',
      createdByUserId: creatorId,
      members: {
        create: [{ userId: member1.id }, { userId: member2.id }],
      },
    },
    include: { members: true },
  });
}

async function tournamentNoGroups(adminId: string) {
  const now = new Date();
  const dayMs = 86400000;
  return prisma.league.create({
    data: {
      name: `Torneo Sin Grupos ${Date.now()}`,
      slug: `torneo-sin-grupos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category: 'INTERMEDIATE',
      type: 'TOURNAMENT',
      hasGroupPhase: false,
      bracketSeedingMode: 'AUTO',
      registrationStart: now,
      registrationEnd: new Date(now.getTime() + dayMs * 7),
      startDate: new Date(now.getTime() + dayMs * 8),
      endDate: new Date(now.getTime() + dayMs * 38),
      status: 'DRAFT',
      createdByUserId: adminId,
    },
  });
}

async function registerTeam(leagueId: string, teamId: string, userId: string) {
  return prisma.leagueRegistration.create({
    data: { leagueId, teamId, registeredByUserId: userId },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
  userIdCounter = 0;
});

describe('Tournament bracket — full flow (integration)', () => {
  it('activates a 4-team tournament without groups, then propagates winners through the bracket', async () => {
    const admin = await user('Admin');
    const teamA = await teamWithMembers('Equipo A', admin.id);
    const teamB = await teamWithMembers('Equipo B', admin.id);
    const teamC = await teamWithMembers('Equipo C', admin.id);
    const teamD = await teamWithMembers('Equipo D', admin.id);

    const league = await tournamentNoGroups(admin.id);
    await registerTeam(league.id, teamA.id, admin.id);
    await registerTeam(league.id, teamB.id, admin.id);
    await registerTeam(league.id, teamC.id, admin.id);
    await registerTeam(league.id, teamD.id, admin.id);

    // Move registration window to "open right now" so activate accepts.
    // (DRAFT status + admin caller is enough; the registration window is
    // only enforced on register, not activate.)
    await LeagueService.activateLeague(league.id, admin.id);

    // 4 teams in linear pairing = 2 R0 matches + 1 R1 final. No Silver bracket
    // for 4 teams? Actually our Silver bracket consumes the 2 R0 losers, so 1
    // Silver final too. Total = 4 matches.
    const matches = await prisma.match.findMany({
      where: { leagueId: league.id },
      orderBy: [
        { bracketSide: 'asc' },
        { bracketRound: 'asc' },
        { bracketPosition: 'asc' },
      ],
    });
    expect(matches).toHaveLength(4);
    const goldR0 = matches.filter((m) => m.bracketSide === 'GOLD' && m.bracketRound === 0);
    const goldR1 = matches.filter((m) => m.bracketSide === 'GOLD' && m.bracketRound === 1);
    const silver = matches.filter((m) => m.bracketSide === 'SILVER');
    expect(goldR0).toHaveLength(2);
    expect(goldR1).toHaveLength(1);
    expect(silver).toHaveLength(1);

    // R0 matches should have both teams set; R1 final should reference both R0
    // matches via sourceMatchAId/BId and have teams null until propagation.
    for (const m of goldR0) {
      expect(m.teamAId).not.toBeNull();
      expect(m.teamBId).not.toBeNull();
    }
    expect(goldR1[0]?.teamAId).toBeNull();
    expect(goldR1[0]?.teamBId).toBeNull();
    expect(goldR1[0]?.sourceMatchAId).toBe(goldR0[0]?.id);
    expect(goldR1[0]?.sourceMatchBId).toBe(goldR0[1]?.id);

    // Silver also references the Gold R0 losers.
    expect(silver[0]?.sourceMatchAId).toBe(goldR0[0]?.id);
    expect(silver[0]?.sourceMatchBId).toBe(goldR0[1]?.id);

    // Confirm Gold R0 match 0: teamA wins.
    const r0m0 = goldR0[0]!;
    await prisma.match.update({
      where: { id: r0m0.id },
      data: { status: 'CONFIRMED', winnerTeamId: r0m0.teamAId },
    });
    await LeagueService.propagateBracketWinner(r0m0.id);

    const r1 = await prisma.match.findUniqueOrThrow({ where: { id: goldR1[0]!.id } });
    expect(r1.teamAId).toBe(r0m0.teamAId); // winner → Gold final teamA
    const silverFinal = await prisma.match.findUniqueOrThrow({ where: { id: silver[0]!.id } });
    expect(silverFinal.teamAId).toBe(r0m0.teamBId); // loser → Silver final teamA

    // Confirm Gold R0 match 1: teamB wins (the team in slot teamBId).
    const r0m1 = goldR0[1]!;
    await prisma.match.update({
      where: { id: r0m1.id },
      data: { status: 'CONFIRMED', winnerTeamId: r0m1.teamBId },
    });
    await LeagueService.propagateBracketWinner(r0m1.id);

    const r1After = await prisma.match.findUniqueOrThrow({ where: { id: goldR1[0]!.id } });
    expect(r1After.teamBId).toBe(r0m1.teamBId); // winner → Gold final teamB
    const silverFinalAfter = await prisma.match.findUniqueOrThrow({ where: { id: silver[0]!.id } });
    expect(silverFinalAfter.teamBId).toBe(r0m1.teamAId); // loser → Silver final teamB
  });

  it('materializeTournamentBracket builds the bracket from group standings', async () => {
    const admin = await user('Admin');
    const teams = await Promise.all([
      teamWithMembers('Equipo A', admin.id),
      teamWithMembers('Equipo B', admin.id),
      teamWithMembers('Equipo C', admin.id),
      teamWithMembers('Equipo D', admin.id),
    ]);

    const now = new Date();
    const dayMs = 86400000;
    const league = await prisma.league.create({
      data: {
        name: `Torneo Grupos ${Date.now()}`,
        slug: `torneo-grupos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        category: 'INTERMEDIATE',
        type: 'TOURNAMENT',
        hasGroupPhase: true,
        groupCount: 2,
        teamsPerGroup: 2,
        qualifiersPerGroup: 1,
        bracketSeedingMode: 'AUTO',
        registrationStart: now,
        registrationEnd: new Date(now.getTime() + dayMs * 7),
        startDate: new Date(now.getTime() + dayMs * 8),
        endDate: new Date(now.getTime() + dayMs * 38),
        status: 'DRAFT',
        createdByUserId: admin.id,
      },
    });

    for (const t of teams) {
      await registerTeam(league.id, t.id, admin.id);
    }

    await LeagueService.activateLeague(league.id, admin.id);

    // With groupCount=2, teamsPerGroup=2 we expect 2 CompetitionGroup rows
    // and 1 round-robin match per group (each group has 2 teams → 1 match).
    const groups = await prisma.competitionGroup.findMany({
      where: { leagueId: league.id },
      orderBy: { index: 'asc' },
    });
    expect(groups).toHaveLength(2);

    const groupMatches = await prisma.match.findMany({
      where: { leagueId: league.id, competitionGroupId: { not: null } },
    });
    expect(groupMatches).toHaveLength(2);

    // Bracket should NOT be materialized yet — only group matches exist.
    const bracketBefore = await prisma.match.count({
      where: { leagueId: league.id, bracketSide: { not: null } },
    });
    expect(bracketBefore).toBe(0);

    // Confirm both group matches with a winner each. To make standings
    // deterministic we mark teamA as winner in both matches + insert a Set.
    for (const m of groupMatches) {
      const result = await prisma.matchResult.create({
        data: {
          matchId: m.id,
          submittedByUserId: admin.id,
          submitterTeamId: m.teamAId,
          status: 'CONFIRMED',
          winnerTeamId: m.teamAId,
          sets: { create: [{ setNumber: 1, gamesA: 6, gamesB: 4 }] },
        },
      });
      await prisma.match.update({
        where: { id: m.id },
        data: { status: 'CONFIRMED', confirmedResultId: result.id, winnerTeamId: m.teamAId },
      });
    }

    await LeagueService.materializeTournamentBracket(league.id, admin.id);

    // 2 qualifiers (1 per group) → bracket is a single Gold match (no Silver
    // because there are 0 Gold R0 losers in a 2-team bracket of size 2).
    const bracket = await prisma.match.findMany({
      where: { leagueId: league.id, bracketSide: { not: null } },
    });
    expect(bracket.length).toBeGreaterThan(0);
    // The 2 qualifiers must be the two group winners (teamAId of each).
    const expectedQualifiers = new Set(groupMatches.map((m) => m.teamAId));
    const bracketTeams = new Set<string>();
    for (const m of bracket) {
      if (m.teamAId) bracketTeams.add(m.teamAId);
      if (m.teamBId) bracketTeams.add(m.teamBId);
    }
    expect(bracketTeams).toEqual(expectedQualifiers);
  });

  it('substituteBracketSlot swaps the team in an R0 bracket slot before play', async () => {
    const admin = await user('Admin');
    const teams = await Promise.all([
      teamWithMembers('A', admin.id),
      teamWithMembers('B', admin.id),
      teamWithMembers('C', admin.id),
      teamWithMembers('D', admin.id),
    ]);
    const league = await tournamentNoGroups(admin.id);
    for (const t of teams) {
      await registerTeam(league.id, t.id, admin.id);
    }
    await LeagueService.activateLeague(league.id, admin.id);

    // Create an extra team that's NOT in the bracket but IS registered (we
    // bypass the registration service because it requires DRAFT status —
    // here the league is already ACTIVE post-activate).
    const sub = await teamWithMembers('Substituto', admin.id);
    await prisma.leagueRegistration.create({
      data: { leagueId: league.id, teamId: sub.id, registeredByUserId: admin.id },
    });

    const r0 = await prisma.match.findFirstOrThrow({
      where: { leagueId: league.id, bracketSide: 'GOLD', bracketRound: 0 },
    });
    const originalTeamA = r0.teamAId!;

    await LeagueService.substituteBracketSlot(r0.id, 'A', sub.id, admin.id);

    const after = await prisma.match.findUniqueOrThrow({ where: { id: r0.id } });
    expect(after.teamAId).toBe(sub.id);
    expect(after.teamAId).not.toBe(originalTeamA);
  });

  it('reorderSeed swaps adjacent registrations and rewrites contiguous seedOrder', async () => {
    const admin = await user('Admin');
    const teams = await Promise.all([
      teamWithMembers('A', admin.id),
      teamWithMembers('B', admin.id),
      teamWithMembers('C', admin.id),
    ]);
    const now = new Date();
    const dayMs = 86400000;
    const league = await prisma.league.create({
      data: {
        name: `MANUAL ${Date.now()}`,
        slug: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        category: 'INTERMEDIATE',
        type: 'TOURNAMENT',
        hasGroupPhase: false,
        bracketSeedingMode: 'MANUAL',
        registrationStart: now,
        registrationEnd: new Date(now.getTime() + dayMs * 7),
        startDate: new Date(now.getTime() + dayMs * 8),
        endDate: new Date(now.getTime() + dayMs * 38),
        status: 'DRAFT',
        createdByUserId: admin.id,
      },
    });

    const regs = [];
    for (const t of teams) {
      const r = await registerTeam(league.id, t.id, admin.id);
      regs.push(r);
    }

    // Move the second registration UP — it should swap with the first.
    await LeagueService.reorderSeed(regs[1]!.id, 'UP', admin.id);
    const afterUp = await prisma.leagueRegistration.findMany({
      where: { leagueId: league.id, withdrawnAt: null },
      orderBy: { seedOrder: 'asc' },
    });
    // seedOrder should be 0, 1, 2 — contiguous.
    expect(afterUp.map((r) => r.seedOrder)).toEqual([0, 1, 2]);
    // First place is now the team that was second.
    expect(afterUp[0]?.id).toBe(regs[1]!.id);
    expect(afterUp[1]?.id).toBe(regs[0]!.id);
    expect(afterUp[2]?.id).toBe(regs[2]!.id);
  });
});
