import { describe, it, expect } from 'vitest';
import { computeTeamProgress } from '@/modules/leagues/application/team-progress';

const TEAM = 't1';
const OPP = 'opp';

function m(opts: {
  date: string;
  status?: 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED';
  winner: 't1' | 'opp' | null;
  side?: 'A' | 'B';
}) {
  const side = opts.side ?? 'A';
  return {
    teamAId: side === 'A' ? TEAM : OPP,
    teamBId: side === 'A' ? OPP : TEAM,
    status: opts.status ?? 'CONFIRMED',
    winnerTeamId: opts.winner,
    finalizedAt: new Date(opts.date),
  };
}

describe('computeTeamProgress', () => {
  it('returns empty array when team has no matches', () => {
    expect(computeTeamProgress([], TEAM)).toEqual([]);
  });

  it('skips matches the team did not play', () => {
    const matches = [
      { teamAId: 'x', teamBId: 'y', status: 'CONFIRMED' as const, winnerTeamId: 'x', finalizedAt: new Date('2026-01-01') },
    ];
    expect(computeTeamProgress(matches, TEAM)).toEqual([]);
  });

  it('counts a win as wins+1', () => {
    const result = computeTeamProgress([m({ date: '2026-01-01', winner: 't1' })], TEAM);
    expect(result).toEqual([{ matchIndex: 1, wins: 1, losses: 0, draws: 0 }]);
  });

  it('counts a loss as losses+1', () => {
    const result = computeTeamProgress([m({ date: '2026-01-01', winner: 'opp' })], TEAM);
    expect(result).toEqual([{ matchIndex: 1, wins: 0, losses: 1, draws: 0 }]);
  });

  it('counts a draw (winner null and not expired)', () => {
    const result = computeTeamProgress([m({ date: '2026-01-01', winner: null })], TEAM);
    expect(result).toEqual([{ matchIndex: 1, wins: 0, losses: 0, draws: 1 }]);
  });

  it('counts an expired match as a loss', () => {
    const result = computeTeamProgress(
      [m({ date: '2026-01-01', status: 'EXPIRED_UNPLAYED', winner: null })],
      TEAM,
    );
    expect(result).toEqual([{ matchIndex: 1, wins: 0, losses: 1, draws: 0 }]);
  });

  it('accumulates over multiple matches in chronological order', () => {
    const matches = [
      m({ date: '2026-01-01', winner: 't1' }),
      m({ date: '2026-01-02', winner: 'opp' }),
      m({ date: '2026-01-03', winner: 't1' }),
      m({ date: '2026-01-04', winner: null }),
    ];
    expect(computeTeamProgress(matches, TEAM)).toEqual([
      { matchIndex: 1, wins: 1, losses: 0, draws: 0 },
      { matchIndex: 2, wins: 1, losses: 1, draws: 0 },
      { matchIndex: 3, wins: 2, losses: 1, draws: 0 },
      { matchIndex: 4, wins: 2, losses: 1, draws: 1 },
    ]);
  });

  it('sorts unsorted input by finalizedAt before accumulating', () => {
    const matches = [
      m({ date: '2026-01-03', winner: 't1' }),
      m({ date: '2026-01-01', winner: 'opp' }),
      m({ date: '2026-01-02', winner: 't1' }),
    ];
    const result = computeTeamProgress(matches, TEAM);
    expect(result.map((p) => p.wins)).toEqual([0, 1, 2]);
    expect(result.map((p) => p.losses)).toEqual([1, 1, 1]);
  });

  it('works whether the team is teamA or teamB', () => {
    const matches = [
      m({ date: '2026-01-01', winner: 't1', side: 'A' }),
      m({ date: '2026-01-02', winner: 'opp', side: 'B' }),
    ];
    expect(computeTeamProgress(matches, TEAM)).toEqual([
      { matchIndex: 1, wins: 1, losses: 0, draws: 0 },
      { matchIndex: 2, wins: 1, losses: 1, draws: 0 },
    ]);
  });
});
