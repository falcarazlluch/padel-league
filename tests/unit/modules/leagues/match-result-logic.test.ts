import { describe, it, expect } from 'vitest';
import {
  determineWinner,
  getSubmitterSide,
  resolveSubmitterSide,
} from '@/modules/leagues/application/match-result-logic';

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

  it('throws when sets array is empty', () => {
    expect(() => determineWinner('tA', 'tB', [])).toThrow('determineWinner requires at least one set.');
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

describe('resolveSubmitterSide', () => {
  const match = { teamAId: 'tA', teamBId: 'tB' };

  it('prefers the snapshot when submitterTeamId matches teamA', () => {
    // The snapshot must win even if the live roster contradicts it (e.g.
    // submitter has since left the team and is no longer a member).
    expect(
      resolveSubmitterSide(
        { submitterTeamId: 'tA', submittedByUserId: 'u-gone' },
        match,
        ['u1'], // u-gone is no longer here
        ['u2'],
      ),
    ).toBe('A');
  });

  it('prefers the snapshot when submitterTeamId matches teamB', () => {
    expect(
      resolveSubmitterSide(
        { submitterTeamId: 'tB', submittedByUserId: 'u-gone' },
        match,
        ['u1'],
        ['u2'],
      ),
    ).toBe('B');
  });

  it('falls back to the live roster when the snapshot is null (legacy row)', () => {
    expect(
      resolveSubmitterSide(
        { submitterTeamId: null, submittedByUserId: 'u1' },
        match,
        ['u1'],
        ['u2'],
      ),
    ).toBe('A');
  });

  it('returns null when snapshot missing AND submitter no longer on either roster', () => {
    expect(
      resolveSubmitterSide(
        { submitterTeamId: null, submittedByUserId: 'u-gone' },
        match,
        ['u1'],
        ['u2'],
      ),
    ).toBeNull();
  });

  it('returns null when snapshot points to a team unrelated to this match', () => {
    // Defensive: a stale or corrupted snapshot pointing at a different
    // team must NOT silently coerce to A or B.
    expect(
      resolveSubmitterSide(
        { submitterTeamId: 'tWrong', submittedByUserId: 'u-gone' },
        match,
        ['u1'],
        ['u2'],
      ),
    ).toBeNull();
  });
});
