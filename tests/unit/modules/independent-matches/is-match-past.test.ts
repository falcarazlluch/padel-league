import { describe, it, expect } from 'vitest';
import { isMatchPast } from '@/modules/independent-matches';

describe('isMatchPast', () => {
  it('returns false when scheduledAt is undefined', () => {
    expect(isMatchPast({})).toBe(false);
    expect(isMatchPast({ scheduledAt: undefined })).toBe(false);
  });

  it('returns false when scheduledAt is null', () => {
    expect(isMatchPast({ scheduledAt: null })).toBe(false);
  });

  it('returns true when scheduledAt is in the past', () => {
    expect(isMatchPast({ scheduledAt: new Date(Date.now() - 1000) })).toBe(true);
  });

  it('returns false when scheduledAt is in the future', () => {
    expect(isMatchPast({ scheduledAt: new Date(Date.now() + 60_000) })).toBe(false);
  });

  it('returns false when scheduledAt is exactly now-ish (within the same ms)', () => {
    // At the boundary, the comparison is `<` so equal is not past.
    const now = new Date(Date.now() + 1);
    expect(isMatchPast({ scheduledAt: now })).toBe(false);
  });
});
