import { describe, it, expect } from 'vitest';
import { determineWinner, getSubmitterSide } from '@/modules/leagues/application/match-result-logic';

describe('determineWinner', () => {
  it('returns teamAId when A wins more sets', () => {
    const result = determineWinner('tA', 'tB', [
      { gamesA: 6, gamesB: 3 },
      { gamesA: 6, gamesB: 2 },
    ]);
    expect(result).toBe('tA');
  });

  it('returns teamBId when B wins more sets', () => {
    const result = determineWinner('tA', 'tB', [
      { gamesA: 3, gamesB: 6 },
      { gamesA: 2, gamesB: 6 },
    ]);
    expect(result).toBe('tB');
  });

  it('returns null when sets are tied', () => {
    const result = determineWinner('tA', 'tB', [
      { gamesA: 6, gamesB: 3 },
      { gamesA: 3, gamesB: 6 },
    ]);
    expect(result).toBeNull();
  });

  it('handles best-of-3 with 2-1 result for A', () => {
    const result = determineWinner('tA', 'tB', [
      { gamesA: 6, gamesB: 3 },
      { gamesA: 3, gamesB: 6 },
      { gamesA: 6, gamesB: 4 },
    ]);
    expect(result).toBe('tA');
  });
});

describe('getSubmitterSide', () => {
  it('returns A when userId is in teamA members', () => {
    expect(getSubmitterSide('u1', ['u1', 'u2'], ['u3', 'u4'])).toBe('A');
  });

  it('returns B when userId is in teamB members', () => {
    expect(getSubmitterSide('u3', ['u1', 'u2'], ['u3', 'u4'])).toBe('B');
  });

  it('returns null when userId is in neither team', () => {
    expect(getSubmitterSide('u99', ['u1', 'u2'], ['u3', 'u4'])).toBeNull();
  });
});
