import { describe, it, expect } from 'vitest';
import {
  calculateAmericanaIndividualStandings,
  calculateAmericanaPairsStandings,
} from '@/modules/leagues/application/americana-standings';

describe('calculateAmericanaIndividualStandings', () => {
  const names = { u1: 'Ana', u2: 'Bea', u3: 'Carlos', u4: 'David' };

  it('counts games-for / against based on the player side per match', () => {
    const standings = calculateAmericanaIndividualStandings(names, [
      {
        status: 'CONFIRMED',
        participants: [
          { userId: 'u1', side: 'A' },
          { userId: 'u2', side: 'A' },
          { userId: 'u3', side: 'B' },
          { userId: 'u4', side: 'B' },
        ],
        sets: [{ gamesA: 8, gamesB: 6 }],
      },
      {
        status: 'CONFIRMED',
        participants: [
          { userId: 'u1', side: 'B' },
          { userId: 'u3', side: 'B' },
          { userId: 'u2', side: 'A' },
          { userId: 'u4', side: 'A' },
        ],
        sets: [{ gamesA: 5, gamesB: 8 }],
      },
    ]);
    const u1 = standings.find((s) => s.userId === 'u1')!;
    expect(u1.matchesPlayed).toBe(2);
    expect(u1.gamesFor).toBe(8 + 8); // ganó como A (8) y como B (8)
    expect(u1.gamesAgainst).toBe(6 + 5);
    expect(u1.gamesDiff).toBe(5);
  });

  it('skips matches that are not CONFIRMED or ADMIN_RESOLVED', () => {
    const standings = calculateAmericanaIndividualStandings(names, [
      {
        status: 'PENDING_VALIDATION',
        participants: [
          { userId: 'u1', side: 'A' },
          { userId: 'u2', side: 'A' },
          { userId: 'u3', side: 'B' },
          { userId: 'u4', side: 'B' },
        ],
        sets: [{ gamesA: 8, gamesB: 0 }],
      },
    ]);
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(0);
      expect(s.gamesFor).toBe(0);
    }
  });

  it('orders by gamesFor desc, then gamesDiff, then name', () => {
    const standings = calculateAmericanaIndividualStandings(names, [
      {
        status: 'CONFIRMED',
        participants: [
          { userId: 'u1', side: 'A' },
          { userId: 'u2', side: 'A' },
          { userId: 'u3', side: 'B' },
          { userId: 'u4', side: 'B' },
        ],
        sets: [{ gamesA: 8, gamesB: 2 }],
      },
    ]);
    expect(standings[0]?.userId).toBe('u1');
    expect(standings[1]?.userId).toBe('u2');
    expect(standings.at(-1)?.userId === 'u3' || standings.at(-1)?.userId === 'u4').toBe(true);
  });
});

describe('calculateAmericanaPairsStandings', () => {
  const teams = { t1: 'Pareja 1', t2: 'Pareja 2', t3: 'Pareja 3' };

  it('sums games-for / against per team across matches', () => {
    const standings = calculateAmericanaPairsStandings(teams, [
      { status: 'CONFIRMED', teamAId: 't1', teamBId: 't2', sets: [{ gamesA: 8, gamesB: 6 }] },
      { status: 'CONFIRMED', teamAId: 't1', teamBId: 't3', sets: [{ gamesA: 8, gamesB: 4 }] },
      { status: 'CONFIRMED', teamAId: 't2', teamBId: 't3', sets: [{ gamesA: 7, gamesB: 8 }] },
    ]);
    const t1 = standings.find((s) => s.teamId === 't1')!;
    expect(t1.gamesFor).toBe(16);
    expect(t1.gamesAgainst).toBe(10);
    expect(t1.matchesPlayed).toBe(2);
    expect(standings[0]?.teamId).toBe('t1');
  });

  it('returns rows for every team even if no match played', () => {
    const standings = calculateAmericanaPairsStandings(teams, []);
    expect(standings).toHaveLength(3);
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(0);
      expect(s.gamesFor).toBe(0);
    }
  });
});
