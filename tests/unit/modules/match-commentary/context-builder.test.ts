import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the prisma client and calculateStandings before importing the module under test.
vi.mock('@/shared/db/client', () => ({
  prisma: {
    match: { findUnique: vi.fn(), findMany: vi.fn() },
    leagueRegistration: { findMany: vi.fn() },
    teamCategoryChangeProposal: { findFirst: vi.fn() },
  },
}));

vi.mock('@/modules/leagues', () => ({
  calculateStandings: vi.fn(),
}));

import { prisma } from '@/shared/db/client';
import { calculateStandings } from '@/modules/leagues';
import { buildContext } from '@/modules/match-commentary/application/context-builder';
import { NotFoundError } from '@/shared/errors';

function regs(teams: Array<{ id: string; name: string }>) {
  return teams.map((t) => ({ team: t }));
}

const mockMatch = (overrides: Record<string, unknown> = {}) => ({
  id: 'match-1',
  teamAId: 'team-a',
  teamBId: 'team-b',
  winnerTeamId: null,
  scheduledAt: new Date('2026-05-12T19:00:00Z'),
  league: { id: 'league-1', name: 'Liga Verano 2026' },
  teamA: { id: 'team-a', name: 'Los Cañones' },
  teamB: { id: 'team-b', name: 'Pádel Bros' },
  confirmedResult: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildContext', () => {
  it('throws NotFoundError when match does not exist', async () => {
    (prisma.match.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(buildContext('missing', 'PREVIEW')).rejects.toThrow(NotFoundError);
  });

  it('builds a PREVIEW context with team names, ranking, and recent matches', async () => {
    (prisma.match.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockMatch());
    (prisma.leagueRegistration.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      regs([
        { id: 'team-a', name: 'Los Cañones' },
        { id: 'team-b', name: 'Pádel Bros' },
        { id: 'team-c', name: 'Team Rafa' },
      ]),
    );
    (prisma.match.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // confirmedMatches for standings
      .mockResolvedValueOnce([
        { teamAId: 'team-a', teamBId: 'team-c', winnerTeamId: 'team-a' },
      ]) // recent A
      .mockResolvedValueOnce([
        { teamAId: 'team-b', teamBId: 'team-c', winnerTeamId: 'team-c' },
      ]); // recent B
    (calculateStandings as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      { teamId: 'team-a', teamName: 'Los Cañones', played: 1, points: 3 },
      { teamId: 'team-b', teamName: 'Pádel Bros', played: 1, points: 0 },
      { teamId: 'team-c', teamName: 'Team Rafa', played: 2, points: 3 },
    ]);

    const ctx = await buildContext('match-1', 'PREVIEW');

    expect(ctx.type).toBe('PREVIEW');
    expect(ctx.league.name).toBe('Liga Verano 2026');
    expect(ctx.teamA.name).toBe('Los Cañones');
    expect(ctx.teamA.rank).toBe(1);
    expect(ctx.teamA.points).toBe(3);
    expect(ctx.teamA.recent).toEqual([{ won: true, opponent: 'Team Rafa' }]);
    expect(ctx.teamB.recent).toEqual([{ won: false, opponent: 'Team Rafa' }]);
    expect(ctx.scheduledAt).toBeInstanceOf(Date);
    expect(ctx.result).toBeUndefined();
  });

  it('returns rank=null when team has not played any match yet', async () => {
    (prisma.match.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockMatch());
    (prisma.leagueRegistration.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      regs([
        { id: 'team-a', name: 'Los Cañones' },
        { id: 'team-b', name: 'Pádel Bros' },
      ]),
    );
    (prisma.match.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (calculateStandings as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      { teamId: 'team-a', teamName: 'Los Cañones', played: 0, points: 0 },
      { teamId: 'team-b', teamName: 'Pádel Bros', played: 0, points: 0 },
    ]);

    const ctx = await buildContext('match-1', 'PREVIEW');
    expect(ctx.teamA.rank).toBeNull();
    expect(ctx.teamB.rank).toBeNull();
  });

  it('builds a RECAP context with the confirmed result', async () => {
    (prisma.match.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockMatch({
        winnerTeamId: 'team-a',
        confirmedResult: {
          sets: [
            { setNumber: 1, gamesA: 6, gamesB: 4 },
            { setNumber: 2, gamesA: 3, gamesB: 6 },
            { setNumber: 3, gamesA: 7, gamesB: 5 },
          ],
        },
      }),
    );
    (prisma.leagueRegistration.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      regs([
        { id: 'team-a', name: 'Los Cañones' },
        { id: 'team-b', name: 'Pádel Bros' },
      ]),
    );
    (prisma.match.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (calculateStandings as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      { teamId: 'team-a', teamName: 'Los Cañones', played: 1, points: 3 },
      { teamId: 'team-b', teamName: 'Pádel Bros', played: 1, points: 0 },
    ]);

    const ctx = await buildContext('match-1', 'RECAP');
    expect(ctx.type).toBe('RECAP');
    expect(ctx.result).toEqual({
      sets: [
        { gamesA: 6, gamesB: 4 },
        { gamesA: 3, gamesB: 6 },
        { gamesA: 7, gamesB: 5 },
      ],
      winnerTeam: 'A',
    });
  });

  it('marks DRAW when winnerTeamId is null in RECAP', async () => {
    (prisma.match.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockMatch({
        winnerTeamId: null,
        confirmedResult: { sets: [{ setNumber: 1, gamesA: 6, gamesB: 6 }] },
      }),
    );
    (prisma.leagueRegistration.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      regs([
        { id: 'team-a', name: 'Los Cañones' },
        { id: 'team-b', name: 'Pádel Bros' },
      ]),
    );
    (prisma.match.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (calculateStandings as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

    const ctx = await buildContext('match-1', 'RECAP');
    expect(ctx.result?.winnerTeam).toBe('DRAW');
  });
});
