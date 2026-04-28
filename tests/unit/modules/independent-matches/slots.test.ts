import { describe, it, expect } from 'vitest';
import { calculateAvailableSlots } from '@/modules/independent-matches/application/independent-match-service';

describe('calculateAvailableSlots', () => {
  it('returns maxPlayers minus confirmed participant count', () => {
    expect(calculateAvailableSlots(4, 2)).toBe(2);
  });

  it('returns 0 when full', () => {
    expect(calculateAvailableSlots(4, 4)).toBe(0);
  });

  it('never returns negative', () => {
    expect(calculateAvailableSlots(4, 5)).toBe(0);
  });
});
