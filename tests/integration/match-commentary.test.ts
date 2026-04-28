import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import {
  MatchCommentaryService,
  __setProviderForTests,
} from '@/modules/match-commentary';
import type { AIProvider } from '@/modules/match-commentary';

const prisma = testPrisma();

const fakeProvider: AIProvider = {
  async generateCommentary(prompt: string) {
    return { content: `FAKE: ${prompt.length} chars`, model: 'fake-model' };
  },
};

beforeEach(async () => {
  await truncateAll(prisma);
  __setProviderForTests(fakeProvider);
});

async function createUser(name: string, email: string) {
  return prisma.user.create({
    data: { name, email, passwordHash: 'hash', emailVerifiedAt: new Date() },
  });
}

async function setup() {
  const admin = await createUser('Admin', `admin-${Date.now()}@test.com`);
  const league = await prisma.league.create({
    data: {
      name: 'Liga Test',
      slug: `liga-test-${Date.now()}`,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000 * 30),
      status: 'ACTIVE',
      createdByUserId: admin.id,
    },
  });
  const a1 = await createUser('A1', `a1-${Date.now()}@test.com`);
  const a2 = await createUser('A2', `a2-${Date.now()}@test.com`);
  const b1 = await createUser('B1', `b1-${Date.now()}@test.com`);
  const b2 = await createUser('B2', `b2-${Date.now()}@test.com`);
  const teamA = await prisma.team.create({
    data: {
      leagueId: league.id,
      name: 'Los Cañones',
      members: { create: [{ userId: a1.id }, { userId: a2.id }] },
    },
  });
  const teamB = await prisma.team.create({
    data: {
      leagueId: league.id,
      name: 'Pádel Bros',
      members: { create: [{ userId: b1.id }, { userId: b2.id }] },
    },
  });
  return { admin, league, teamA, teamB, a1, b1 };
}

describe('MatchCommentaryService — integration', () => {
  it('generates a PREVIEW commentary with team names and league context', async () => {
    const { league, teamA, teamB } = await setup();
    const match = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        round: 1,
        deadlineAt: new Date(Date.now() + 86400000 * 7),
        scheduledAt: new Date(Date.now() + 86400000 * 5),
        status: 'DATE_CONFIRMED',
      },
    });

    await MatchCommentaryService.generate(match.id, 'PREVIEW');

    const stored = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });
    expect(stored).not.toBeNull();
    expect(stored?.content).toContain('FAKE:');
    expect(stored?.type).toBe('PREVIEW');
    expect(stored?.regeneratedCount).toBe(0);
  });

  it('is idempotent — second call without regenerate is a no-op', async () => {
    const { league, teamA, teamB } = await setup();
    const match = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        round: 1,
        deadlineAt: new Date(Date.now() + 86400000 * 7),
        scheduledAt: new Date(Date.now() + 86400000 * 5),
        status: 'DATE_CONFIRMED',
      },
    });

    await MatchCommentaryService.generate(match.id, 'PREVIEW');
    const first = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });
    await MatchCommentaryService.generate(match.id, 'PREVIEW');
    const second = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });

    expect(second?.id).toBe(first?.id);
    expect(second?.generatedAt).toEqual(first?.generatedAt);
    expect(second?.regeneratedCount).toBe(0);
  });

  it('regenerate increments regeneratedCount', async () => {
    const { admin, league, teamA, teamB } = await setup();
    await prisma.leagueMember.create({
      data: { leagueId: league.id, userId: admin.id, role: 'LEAGUE_ADMIN' },
    });
    const match = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        round: 1,
        deadlineAt: new Date(Date.now() + 86400000 * 7),
        scheduledAt: new Date(Date.now() + 86400000 * 5),
        status: 'DATE_CONFIRMED',
      },
    });

    await MatchCommentaryService.generate(match.id, 'PREVIEW');
    const initial = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });

    await MatchCommentaryService.regenerate(initial!.id, admin.id);

    const after = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });
    expect(after?.regeneratedCount).toBe(1);
  });

  it('rejects regenerate from a non-admin user', async () => {
    const { league, teamA, teamB, a1 } = await setup();
    const match = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        round: 1,
        deadlineAt: new Date(Date.now() + 86400000 * 7),
        scheduledAt: new Date(Date.now() + 86400000 * 5),
        status: 'DATE_CONFIRMED',
      },
    });

    await MatchCommentaryService.generate(match.id, 'PREVIEW');
    const c = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });

    await expect(MatchCommentaryService.regenerate(c!.id, a1.id)).rejects.toThrow();
  });

  it('edit sets editedAt and editedByUserId', async () => {
    const { admin, league, teamA, teamB } = await setup();
    await prisma.leagueMember.create({
      data: { leagueId: league.id, userId: admin.id, role: 'LEAGUE_ADMIN' },
    });
    const match = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        round: 1,
        deadlineAt: new Date(Date.now() + 86400000 * 7),
        scheduledAt: new Date(Date.now() + 86400000 * 5),
        status: 'DATE_CONFIRMED',
      },
    });

    await MatchCommentaryService.generate(match.id, 'PREVIEW');
    const c = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });

    await MatchCommentaryService.edit(c!.id, admin.id, 'Texto editado a mano por el admin.');

    const updated = await prisma.matchCommentary.findUnique({ where: { id: c!.id } });
    expect(updated?.content).toBe('Texto editado a mano por el admin.');
    expect(updated?.editedAt).not.toBeNull();
    expect(updated?.editedByUserId).toBe(admin.id);
  });

  it('deleteByMatch removes both PREVIEW and RECAP', async () => {
    const { league, teamA, teamB } = await setup();
    const match = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        round: 1,
        deadlineAt: new Date(Date.now() + 86400000 * 7),
        scheduledAt: new Date(Date.now() + 86400000 * 5),
        status: 'DATE_CONFIRMED',
      },
    });

    await MatchCommentaryService.generate(match.id, 'PREVIEW');
    await prisma.matchCommentary.create({
      data: { matchId: match.id, type: 'RECAP', provider: 'OPENAI', content: 'fake recap' },
    });

    await MatchCommentaryService.deleteByMatch(match.id);

    const remaining = await prisma.matchCommentary.findMany({ where: { matchId: match.id } });
    expect(remaining).toHaveLength(0);
  });
});
