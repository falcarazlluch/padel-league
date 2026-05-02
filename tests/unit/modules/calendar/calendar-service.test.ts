import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalendarService, monthRangeUtc } from '@/modules/calendar';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    match: { findMany: vi.fn() },
    independentMatch: { findMany: vi.fn() },
    teamMember: { findMany: vi.fn() },
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    match: { findMany: ReturnType<typeof vi.fn> };
    independentMatch: { findMany: ReturnType<typeof vi.fn> };
    teamMember: { findMany: ReturnType<typeof vi.fn> };
  };
}

describe('monthRangeUtc', () => {
  it('returns first millisecond of the month and first millisecond of next month', () => {
    const { start, end } = monthRangeUtc(2026, 4);
    expect(start.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('handles December rollover', () => {
    const { start, end } = monthRangeUtc(2026, 12);
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('CalendarService.listMatchesForUserMonth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies a match where the user belongs to teamA as OWN_LEAGUE', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findMany.mockResolvedValue([{ teamId: 't1' }]);
    prisma.match.findMany.mockResolvedValueOnce([
      {
        id: 'lm1',
        scheduledAt: new Date('2026-04-12T17:00:00Z'),
        status: 'DATE_CONFIRMED',
        teamA: { id: 't1', name: 'Halcones' },
        teamB: { id: 't2', name: 'Tigres' },
        league: { slug: 'liga-otono' },
      },
    ]).mockResolvedValueOnce([]); // category B query empty
    prisma.independentMatch.findMany.mockResolvedValue([]);

    const result = await CalendarService.listMatchesForUserMonth('u1', 2026, 4);
    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('OWN_LEAGUE');
    expect(result[0]!.status).toBe('CONFIRMED');
    expect(result[0]!.title).toBe('Halcones vs Tigres');
    expect(result[0]!.href).toBe('/ligas/liga-otono/partidos/lm1');
  });

  it('marks DATE_PROPOSED matches as TENTATIVE', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findMany.mockResolvedValue([]);
    prisma.match.findMany.mockResolvedValueOnce([
      {
        id: 'lm2',
        scheduledAt: new Date('2026-04-15T18:00:00Z'),
        status: 'DATE_PROPOSED',
        teamA: { id: 't1', name: 'A' },
        teamB: { id: 't2', name: 'B' },
        league: { slug: 's' },
      },
    ]).mockResolvedValueOnce([]);
    prisma.independentMatch.findMany.mockResolvedValue([]);

    const result = await CalendarService.listMatchesForUserMonth('u1', 2026, 4);
    expect(result[0]!.status).toBe('TENTATIVE');
  });

  it('classifies league matches in user’s leagues where they don’t play as OTHER_LEAGUE_MINE', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findMany.mockResolvedValue([]);
    prisma.match.findMany
      .mockResolvedValueOnce([]) // category A: user doesn't play
      .mockResolvedValueOnce([
        {
          id: 'lm3',
          scheduledAt: new Date('2026-04-20T17:00:00Z'),
          status: 'DATE_CONFIRMED',
          teamA: { id: 't3', name: 'X' },
          teamB: { id: 't4', name: 'Y' },
          league: { slug: 's' },
        },
      ]);
    prisma.independentMatch.findMany.mockResolvedValue([]);

    const result = await CalendarService.listMatchesForUserMonth('u1', 2026, 4);
    expect(result[0]!.category).toBe('OTHER_LEAGUE_MINE');
  });

  it('classifies independent matches as INDEPENDENT', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findMany.mockResolvedValue([]);
    prisma.match.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.independentMatch.findMany.mockResolvedValue([
      {
        id: 'im1',
        name: 'Sábado por la tarde',
        scheduledAt: new Date('2026-04-18T17:00:00Z'),
        status: 'OPEN',
      },
    ]);

    const result = await CalendarService.listMatchesForUserMonth('u1', 2026, 4);
    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('INDEPENDENT');
    expect(result[0]!.title).toBe('Sábado por la tarde');
    expect(result[0]!.href).toBe('/jugar/im1');
  });

  it('sorts merged results by scheduledAt ascending', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findMany.mockResolvedValue([]);
    prisma.match.findMany
      .mockResolvedValueOnce([
        {
          id: 'lm-late',
          scheduledAt: new Date('2026-04-25T17:00:00Z'),
          status: 'DATE_CONFIRMED',
          teamA: { id: 't1', name: 'A' },
          teamB: { id: 't2', name: 'B' },
          league: { slug: 's' },
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.independentMatch.findMany.mockResolvedValue([
      {
        id: 'im-early',
        name: 'X',
        scheduledAt: new Date('2026-04-05T17:00:00Z'),
        status: 'OPEN',
      },
    ]);

    const result = await CalendarService.listMatchesForUserMonth('u1', 2026, 4);
    expect(result.map((m) => m.id)).toEqual(['im-early', 'lm-late']);
  });
});
