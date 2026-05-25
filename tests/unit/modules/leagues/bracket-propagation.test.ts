import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma BEFORE importing the service.
const findUniqueMock = vi.fn();
const findManyMock = vi.fn();
const updateMock = vi.fn();
vi.mock('@/shared/db/client', () => ({
  prisma: {
    match: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
      findMany: (...a: unknown[]) => findManyMock(...a),
      update: (...a: unknown[]) => updateMock(...a),
    },
  },
}));

// Stubs for unrelated deps reached transitively by match-service imports.
vi.mock('@/shared/queue/client', () => ({ queue: () => ({ start: async () => ({}), publish: async () => null }) }));
vi.mock('@/shared/logger', () => ({ logger: () => ({ warn: () => {}, info: () => {}, error: () => {} }) }));

import { MatchService } from '@/modules/leagues';

describe('MatchService.propagateBracketWinner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('promotes the winner to the next gold round', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'gold-r0-pos0',
      teamAId: 'tA',
      teamBId: 'tB',
      winnerTeamId: 'tA',
      bracketSide: 'GOLD',
    });
    findManyMock.mockResolvedValue([
      {
        id: 'gold-r1-pos0',
        bracketSide: 'GOLD',
        sourceMatchAId: 'gold-r0-pos0',
        sourceMatchBId: 'gold-r0-pos1',
      },
    ]);

    await MatchService.propagateBracketWinner('gold-r0-pos0');

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'gold-r1-pos0' },
      data: { teamAId: 'tA' },
    });
  });

  it('puts the LOSER into the linked silver match', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'gold-r0-pos0',
      teamAId: 'tA',
      teamBId: 'tB',
      winnerTeamId: 'tA',
      bracketSide: 'GOLD',
    });
    findManyMock.mockResolvedValue([
      // Gold next round: receives winner.
      {
        id: 'gold-r1-pos0',
        bracketSide: 'GOLD',
        sourceMatchAId: 'gold-r0-pos0',
        sourceMatchBId: 'gold-r0-pos1',
      },
      // Silver R0: receives loser.
      {
        id: 'silver-r0-pos0',
        bracketSide: 'SILVER',
        sourceMatchAId: 'gold-r0-pos0',
        sourceMatchBId: 'gold-r0-pos1',
      },
    ]);

    await MatchService.propagateBracketWinner('gold-r0-pos0');

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'gold-r1-pos0' },
      data: { teamAId: 'tA' }, // winner
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'silver-r0-pos0' },
      data: { teamAId: 'tB' }, // loser
    });
  });

  it('propagates silver winners to the next silver round', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'silver-r0-pos0',
      teamAId: 'tX',
      teamBId: 'tY',
      winnerTeamId: 'tY',
      bracketSide: 'SILVER',
    });
    findManyMock.mockResolvedValue([
      {
        id: 'silver-r1-pos0',
        bracketSide: 'SILVER',
        sourceMatchAId: 'silver-r0-pos0',
        sourceMatchBId: 'silver-r0-pos1',
      },
    ]);

    await MatchService.propagateBracketWinner('silver-r0-pos0');

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'silver-r1-pos0' },
      data: { teamAId: 'tY' },
    });
  });

  it('uses slot B when the downstream references this match as sourceMatchB', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'gold-r0-pos1',
      teamAId: 'tC',
      teamBId: 'tD',
      winnerTeamId: 'tD',
      bracketSide: 'GOLD',
    });
    findManyMock.mockResolvedValue([
      {
        id: 'gold-r1-pos0',
        bracketSide: 'GOLD',
        sourceMatchAId: 'gold-r0-pos0',
        sourceMatchBId: 'gold-r0-pos1', // <-- B side
      },
    ]);

    await MatchService.propagateBracketWinner('gold-r0-pos1');

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'gold-r1-pos0' },
      data: { teamBId: 'tD' },
    });
  });

  it('is a no-op when the match has no winner (draw or no result)', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'gold-r0-pos0',
      teamAId: 'tA',
      teamBId: 'tB',
      winnerTeamId: null,
      bracketSide: 'GOLD',
    });

    await MatchService.propagateBracketWinner('gold-r0-pos0');

    expect(findManyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('is a no-op when the match is not a bracket match', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'league-match',
      teamAId: 'tA',
      teamBId: 'tB',
      winnerTeamId: 'tA',
      bracketSide: null,
    });

    await MatchService.propagateBracketWinner('league-match');

    expect(findManyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
