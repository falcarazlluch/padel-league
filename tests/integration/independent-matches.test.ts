import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { IndependentMatchService } from '@/modules/independent-matches';

const prisma = testPrisma();

async function createUser(name: string, email: string) {
  return prisma.user.create({
    data: { name, email, passwordHash: 'hash', emailVerifiedAt: new Date() },
  });
}

async function createLeagueWithTeams() {
  const admin = await createUser('Admin', `admin-${Date.now()}@test.com`);
  const league = await prisma.league.create({
    data: {
      name: 'Test Liga',
      slug: `test-liga-${Date.now()}`,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000 * 30),
      status: 'ACTIVE',
      createdByUserId: admin.id,
    },
  });

  const userA1 = await createUser('Player A1', `a1-${Date.now()}@test.com`);
  const userA2 = await createUser('Player A2', `a2-${Date.now()}@test.com`);
  const userB1 = await createUser('Player B1', `b1-${Date.now()}@test.com`);
  const userB2 = await createUser('Player B2', `b2-${Date.now()}@test.com`);

  const teamA = await prisma.team.create({
    data: {
      leagueId: league.id,
      name: 'Team A',
      members: { create: [{ userId: userA1.id }, { userId: userA2.id }] },
    },
  });
  const teamB = await prisma.team.create({
    data: {
      leagueId: league.id,
      name: 'Team B',
      members: { create: [{ userId: userB1.id }, { userId: userB2.id }] },
    },
  });

  return { league, teamA, teamB, userA1, userA2, userB1, userB2 };
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('IndependentMatchService — OPEN match flow', () => {
  it('creates an OPEN match and organizer is participant', async () => {
    const organizer = await createUser('Organizer', `org-${Date.now()}@test.com`);

    const match = await IndependentMatchService.createOpen({
      organizerId: organizer.id,
      name: 'Partido tarde',
      maxPlayers: 4,
    });

    expect(match.status).toBe('OPEN');
    expect(match.type).toBe('OPEN');

    const participants = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: match.id, status: 'ACCEPTED' },
    });
    expect(participants).toHaveLength(1);
    expect(participants[0]!.userId).toBe(organizer.id);
  });

  it('join request → approve → match CONFIRMED when full (maxPlayers 2)', async () => {
    const organizer = await createUser('Org', `org2-${Date.now()}@test.com`);
    const joiner = await createUser('Joiner', `joiner-${Date.now()}@test.com`);

    const match = await IndependentMatchService.createOpen({
      organizerId: organizer.id,
      name: 'Test 2-player',
      maxPlayers: 2,
    });

    await IndependentMatchService.requestToJoin(match.id, joiner.id);

    const requests = await prisma.independentMatchJoinRequest.findMany({
      where: { independentMatchId: match.id, status: 'PENDING' },
    });
    expect(requests).toHaveLength(1);

    await IndependentMatchService.approveJoinRequest(requests[0]!.id, organizer.id);

    const updated = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(updated?.status).toBe('CONFIRMED');
  });

  it('blocks requestToJoin when match is full', async () => {
    const organizer = await createUser('Org3', `org3-${Date.now()}@test.com`);
    const joiner1 = await createUser('J1', `j1-${Date.now()}@test.com`);
    const joiner2 = await createUser('J2', `j2-${Date.now()}@test.com`);

    const match = await IndependentMatchService.createOpen({
      organizerId: organizer.id,
      name: 'Full match',
      maxPlayers: 2,
    });

    await IndependentMatchService.requestToJoin(match.id, joiner1.id);
    const reqs = await prisma.independentMatchJoinRequest.findMany({
      where: { independentMatchId: match.id, status: 'PENDING' },
    });
    await IndependentMatchService.approveJoinRequest(reqs[0]!.id, organizer.id);

    await expect(IndependentMatchService.requestToJoin(match.id, joiner2.id)).rejects.toThrow();
  });
});

describe('IndependentMatchService — TEAM_CHALLENGE flow', () => {
  it('creates a challenge with PENDING_APPROVAL status', async () => {
    const { teamA, teamB, userA1, league } = await createLeagueWithTeams();

    const match = await IndependentMatchService.createChallenge({
      organizerId: userA1.id,
      organizerTeamId: teamA.id,
      challengedTeamId: teamB.id,
      leagueId: league.id,
      name: 'Reto épico',
    });

    expect(match.status).toBe('PENDING_APPROVAL');
    expect(match.type).toBe('TEAM_CHALLENGE');
    expect(match.challengedTeamId).toBe(teamB.id);
    expect(match.organizerTeamId).toBe(teamA.id);
  });

  it('accept challenge → CONFIRMED with all team members as participants', async () => {
    const { teamA, teamB, userA1, userB1, league } = await createLeagueWithTeams();

    const match = await IndependentMatchService.createChallenge({
      organizerId: userA1.id,
      organizerTeamId: teamA.id,
      challengedTeamId: teamB.id,
      leagueId: league.id,
      name: 'Reto aceptado',
    });

    await IndependentMatchService.acceptChallenge(match.id, userB1.id);

    const updated = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(updated?.status).toBe('CONFIRMED');

    const participants = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: match.id, status: 'ACCEPTED' },
    });
    expect(participants).toHaveLength(4);
  });

  it('reject challenge → REJECTED status, organizer notified', async () => {
    const { teamA, teamB, userA1, userB1, league } = await createLeagueWithTeams();

    const match = await IndependentMatchService.createChallenge({
      organizerId: userA1.id,
      organizerTeamId: teamA.id,
      challengedTeamId: teamB.id,
      leagueId: league.id,
      name: 'Reto rechazado',
    });

    await IndependentMatchService.rejectChallenge(match.id, userB1.id);

    const updated = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(updated?.status).toBe('REJECTED');
  });

  it('non-team-member cannot accept a challenge', async () => {
    const { teamA, teamB, userA1, league } = await createLeagueWithTeams();
    const outsider = await createUser('Outsider', `outsider-${Date.now()}@test.com`);

    const match = await IndependentMatchService.createChallenge({
      organizerId: userA1.id,
      organizerTeamId: teamA.id,
      challengedTeamId: teamB.id,
      leagueId: league.id,
      name: 'Reto no autorizado',
    });

    await expect(IndependentMatchService.acceptChallenge(match.id, outsider.id)).rejects.toThrow();
  });
});
