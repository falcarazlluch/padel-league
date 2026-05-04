import { describe, it, expect } from 'vitest';
import { deriveLeagueStatus } from '@/modules/leagues/presentation/league-status';

const REG_START = new Date('2026-04-01T00:00:00Z');
const REG_END = new Date('2026-04-30T23:59:59Z');
const START = new Date('2026-05-01T00:00:00Z');
const END = new Date('2026-06-30T23:59:59Z');

function at(iso: string): number {
  return new Date(iso).getTime();
}

describe('deriveLeagueStatus', () => {
  it('returns REGISTRATION_FUTURE before the registration window opens', () => {
    expect(
      deriveLeagueStatus('DRAFT', REG_START, REG_END, at('2026-03-01T00:00:00Z'), START, END),
    ).toBe('REGISTRATION_FUTURE');
  });

  it('returns REGISTRATION_OPEN inside the window', () => {
    expect(
      deriveLeagueStatus('DRAFT', REG_START, REG_END, at('2026-04-15T00:00:00Z'), START, END),
    ).toBe('REGISTRATION_OPEN');
  });

  it('returns REGISTRATION_CLOSED after window but before startDate', () => {
    // REG_END = 2026-04-30T23:59:59Z; START = 2026-05-01T00:00:00Z.
    // The gap is one millisecond, so we test with a registration window that
    // ends comfortably before the start date.
    const earlyRegEnd = new Date('2026-04-15T00:00:00Z');
    expect(
      deriveLeagueStatus('DRAFT', REG_START, earlyRegEnd, at('2026-04-20T00:00:00Z'), START, END),
    ).toBe('REGISTRATION_CLOSED');
  });

  it('overrides DRAFT to ACTIVE when the league startDate has been reached', () => {
    expect(
      deriveLeagueStatus('DRAFT', REG_START, REG_END, at('2026-05-15T12:00:00Z'), START, END),
    ).toBe('ACTIVE');
  });

  it('overrides DRAFT/ACTIVE to FINISHED when endDate has passed', () => {
    expect(
      deriveLeagueStatus('DRAFT', REG_START, REG_END, at('2026-07-15T00:00:00Z'), START, END),
    ).toBe('FINISHED');
    expect(
      deriveLeagueStatus('ACTIVE', REG_START, REG_END, at('2026-07-15T00:00:00Z'), START, END),
    ).toBe('FINISHED');
  });

  it('keeps ACTIVE when persisted ACTIVE and endDate not yet reached', () => {
    expect(
      deriveLeagueStatus('ACTIVE', REG_START, REG_END, at('2026-05-15T00:00:00Z'), START, END),
    ).toBe('ACTIVE');
  });

  it('returns ARCHIVED regardless of dates', () => {
    expect(
      deriveLeagueStatus('ARCHIVED', REG_START, REG_END, at('2026-05-15T00:00:00Z'), START, END),
    ).toBe('ARCHIVED');
  });

  it('falls back to old (window-only) behaviour when startDate/endDate omitted', () => {
    expect(deriveLeagueStatus('DRAFT', REG_START, REG_END, at('2026-03-01T00:00:00Z'))).toBe('REGISTRATION_FUTURE');
    expect(deriveLeagueStatus('DRAFT', REG_START, REG_END, at('2026-04-15T00:00:00Z'))).toBe('REGISTRATION_OPEN');
    expect(deriveLeagueStatus('DRAFT', REG_START, REG_END, at('2026-05-15T00:00:00Z'))).toBe('REGISTRATION_CLOSED');
    expect(deriveLeagueStatus('ACTIVE', REG_START, REG_END, at('2026-05-15T00:00:00Z'))).toBe('ACTIVE');
  });
});
