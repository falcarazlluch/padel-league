import { describe, it, expect } from 'vitest';
import { formatSetScore, formatMatchDateTime } from '@/shared/format/match';

describe('formatSetScore', () => {
  it('formats a best-of-3 in order', () => {
    const sets = [
      { setNumber: 2, gamesA: 6, gamesB: 3 },
      { setNumber: 1, gamesA: 6, gamesB: 4 },
    ];
    expect(formatSetScore(sets)).toBe('6-4, 6-3');
  });

  it('handles a 3-set win with super-tiebreak (10-8)', () => {
    const sets = [
      { setNumber: 1, gamesA: 6, gamesB: 4 },
      { setNumber: 2, gamesA: 3, gamesB: 6 },
      { setNumber: 3, gamesA: 10, gamesB: 8 },
    ];
    expect(formatSetScore(sets)).toBe('6-4, 3-6, 10-8');
  });

  it('returns empty string for no sets', () => {
    expect(formatSetScore([])).toBe('');
  });
});

describe('formatMatchDateTime', () => {
  it('returns undefined for null/undefined', () => {
    expect(formatMatchDateTime(null)).toBeUndefined();
    expect(formatMatchDateTime(undefined)).toBeUndefined();
  });

  it('formats an instant in Spanish Madrid time', () => {
    // 18:00 UTC on a Saturday May (DST = UTC+2) → 20:00 Madrid time
    const date = new Date('2026-05-30T18:00:00Z');
    const out = formatMatchDateTime(date) ?? '';
    expect(out).toMatch(/sábado/i);
    expect(out).toMatch(/mayo/i);
    expect(out).toContain('20:00');
  });
});
