import { describe, it, expect } from 'vitest';
import { calculateStandings } from '@/modules/leagues/application/standings-calculator';

type ConfirmedMatch = Parameters<typeof calculateStandings>[1][number];

const teamNames: Record<string, string> = { t1: 'Team 1', t2: 'Team 2', t3: 'Team 3', t4: 'Team 4' };

function makeMatch(
  teamAId: string,
  teamBId: string,
  sets: { gamesA: number; gamesB: number }[],
): ConfirmedMatch {
  const setsWonA = sets.filter((s) => s.gamesA > s.gamesB).length;
  const setsWonB = sets.filter((s) => s.gamesB > s.gamesA).length;
  const winnerTeamId = setsWonA > setsWonB ? teamAId : setsWonB > setsWonA ? teamBId : null;
  return { teamAId, teamBId, sets, winnerTeamId };
}

describe('calculateStandings', () => {
  it('gives 3 points to winner and 0 to loser', () => {
    const matches = [makeMatch('t1', 't2', [{ gamesA: 6, gamesB: 3 }, { gamesA: 6, gamesB: 2 }])];
    const standings = calculateStandings(teamNames, matches);
    const t1 = standings.find((s) => s.teamId === 't1')!;
    const t2 = standings.find((s) => s.teamId === 't2')!;
    expect(t1.points).toBe(3);
    expect(t2.points).toBe(0);
    expect(t1.won).toBe(1);
    expect(t2.lost).toBe(1);
  });

  it('gives 1 point each for a draw', () => {
    const matches = [makeMatch('t1', 't2', [{ gamesA: 6, gamesB: 3 }, { gamesA: 3, gamesB: 6 }])];
    const standings = calculateStandings(teamNames, matches);
    const t1 = standings.find((s) => s.teamId === 't1')!;
    const t2 = standings.find((s) => s.teamId === 't2')!;
    expect(t1.points).toBe(1);
    expect(t2.points).toBe(1);
    expect(t1.drawn).toBe(1);
  });

  it('sorts by points descending', () => {
    const matches = [
      makeMatch('t1', 't2', [{ gamesA: 6, gamesB: 3 }, { gamesA: 6, gamesB: 2 }]),
      makeMatch('t2', 't3', [{ gamesA: 6, gamesB: 3 }, { gamesA: 6, gamesB: 2 }]),
    ];
    const standings = calculateStandings(teamNames, matches);
    // t1 has 3 points (1 win), t2 has 3 points (1 win, 1 loss), t3 and t4 have 0 points
    expect(standings[0]!.points).toBe(3);
    expect(standings[1]!.points).toBe(3);
    expect(standings[2]!.points).toBe(0);
    expect(standings[3]!.points).toBe(0);
  });

  it('tracks sets for/against correctly', () => {
    const matches = [makeMatch('t1', 't2', [{ gamesA: 6, gamesB: 3 }, { gamesA: 6, gamesB: 2 }])];
    const standings = calculateStandings(teamNames, matches);
    const t1 = standings.find((s) => s.teamId === 't1')!;
    expect(t1.setsFor).toBe(2);
    expect(t1.setsAgainst).toBe(0);
  });

  it('returns entry for every team even with no matches played', () => {
    const standings = calculateStandings(teamNames, []);
    expect(standings).toHaveLength(4);
    standings.forEach((s) => {
      expect(s.points).toBe(0);
      expect(s.played).toBe(0);
    });
  });

  it('tiebreak by set difference when points equal', () => {
    const matches = [
      makeMatch('t1', 't3', [{ gamesA: 6, gamesB: 3 }, { gamesA: 6, gamesB: 2 }]),
      makeMatch('t2', 't3', [{ gamesA: 6, gamesB: 3 }, { gamesA: 3, gamesB: 6 }, { gamesA: 6, gamesB: 3 }]),
    ];
    const standings = calculateStandings(teamNames, matches);
    const t1 = standings.find((s) => s.teamId === 't1')!;
    const t2 = standings.find((s) => s.teamId === 't2')!;
    expect(t1.points).toBe(3);
    expect(t2.points).toBe(3);
    // t1 setsDiff=2, t2 setsDiff=1 → t1 ranked higher
    expect(standings.indexOf(t1)).toBeLessThan(standings.indexOf(t2));
  });
});
