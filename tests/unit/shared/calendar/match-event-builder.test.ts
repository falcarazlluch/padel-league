import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildIndependentMatchEvent, buildLeagueMatchEvent } from '@/shared/calendar/match-event-builder';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    independentMatch: { findUnique: vi.fn() },
    match: { findUnique: vi.fn() },
    teamMember: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    league: { findUnique: vi.fn() },
    leagueRegistration: { findFirst: vi.fn() },
  },
}));

vi.mock('@/shared/config/env', () => ({
  env: () => ({ APP_URL: 'https://example.com' }),
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    independentMatch: { findUnique: ReturnType<typeof vi.fn> };
    match: { findUnique: ReturnType<typeof vi.fn> };
    teamMember: { findFirst: ReturnType<typeof vi.fn> };
    user: { findUnique: ReturnType<typeof vi.fn> };
    league: { findUnique: ReturnType<typeof vi.fn> };
    leagueRegistration: { findFirst: ReturnType<typeof vi.fn> };
  };
}

describe('buildIndependentMatchEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not-found when match does not exist', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue(null);

    const result = await buildIndependentMatchEvent('m-missing', 'u1');
    expect(result.kind).toBe('not-found');
  });

  it('returns no-date when scheduledAt is null', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      name: 'M',
      visibility: 'PUBLIC',
      organizerId: 'u1',
      scheduledAt: null,
      location: null,
      hostTeamId: null,
      updatedAt: new Date(),
      organizer: { id: 'u1', name: 'Org' },
      participants: [],
      invitations: [],
      hostTeam: null,
    });

    const result = await buildIndependentMatchEvent('m1', 'u1');
    expect(result.kind).toBe('no-date');
  });

  it('returns ok for PUBLIC match with any logged-in user', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      name: 'Sábado',
      visibility: 'PUBLIC',
      organizerId: 'u1',
      scheduledAt: new Date('2026-05-03T17:00:00Z'),
      location: 'Club',
      hostTeamId: null,
      updatedAt: new Date('2026-04-01T10:00:00Z'),
      organizer: { id: 'u1', name: 'Org' },
      participants: [{ user: { id: 'u1', name: 'Org' } }],
      invitations: [],
      hostTeam: null,
    });

    const result = await buildIndependentMatchEvent('m1', 'u-stranger');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.event.summary).toBe('Sábado');
    expect(result.event.url).toBe('https://example.com/jugar/m1');
    expect(result.event.location).toBe('Club');
    expect(result.event.uid).toBe('match-m1@padelleague.app');
  });

  it('returns forbidden for PRIVATE match when caller is not a member, invitee, or organizer', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      name: 'Privado',
      visibility: 'PRIVATE',
      organizerId: 'u1',
      scheduledAt: new Date('2026-05-03T17:00:00Z'),
      location: null,
      hostTeamId: null,
      updatedAt: new Date(),
      organizer: { id: 'u1', name: 'Org' },
      participants: [{ user: { id: 'u1', name: 'Org' } }],
      invitations: [],
      hostTeam: null,
    });
    prisma.teamMember.findFirst.mockResolvedValue(null);

    const result = await buildIndependentMatchEvent('m1', 'u-stranger');
    expect(result.kind).toBe('forbidden');
  });

  it('returns ok for PRIVATE match when caller is the organizer', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      name: 'Privado',
      visibility: 'PRIVATE',
      organizerId: 'u1',
      scheduledAt: new Date('2026-05-03T17:00:00Z'),
      location: null,
      hostTeamId: null,
      updatedAt: new Date(),
      organizer: { id: 'u1', name: 'Org' },
      participants: [{ user: { id: 'u1', name: 'Org' } }],
      invitations: [],
      hostTeam: null,
    });

    const result = await buildIndependentMatchEvent('m1', 'u1');
    expect(result.kind).toBe('ok');
  });

  it('derives sequence from updatedAt epoch / 1000', async () => {
    const prisma = await getPrisma();
    const updatedAt = new Date('2026-04-30T18:00:00Z');
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      name: 'X',
      visibility: 'PUBLIC',
      organizerId: 'u1',
      scheduledAt: new Date('2026-05-03T17:00:00Z'),
      location: null,
      hostTeamId: null,
      updatedAt,
      organizer: { id: 'u1', name: 'Org' },
      participants: [],
      invitations: [],
      hostTeam: null,
    });

    const result = await buildIndependentMatchEvent('m1', 'u-any');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.event.sequence).toBe(Math.floor(updatedAt.getTime() / 1000));
  });
});

describe('buildLeagueMatchEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not-found when match does not exist', async () => {
    const prisma = await getPrisma();
    prisma.match.findUnique.mockResolvedValue(null);

    const result = await buildLeagueMatchEvent('lm-missing', 'u1');
    expect(result.kind).toBe('not-found');
  });

  it('builds summary as "<TeamA> vs <TeamB>" and url to ligas slug for a participant', async () => {
    const prisma = await getPrisma();
    prisma.match.findUnique.mockResolvedValue({
      id: 'lm1',
      scheduledAt: new Date('2026-05-03T17:00:00Z'),
      updatedAt: new Date('2026-04-30T18:00:00Z'),
      teamA: {
        id: 'tA',
        name: 'Halcones',
        members: [
          { userId: 'u1', user: { id: 'u1', name: 'Cap' } },
          { userId: 'u2', user: { id: 'u2', name: 'Par' } },
        ],
      },
      teamB: {
        id: 'tB',
        name: 'Tigres',
        members: [
          { userId: 'u3', user: { id: 'u3', name: 'C' } },
          { userId: 'u4', user: { id: 'u4', name: 'D' } },
        ],
      },
      league: { id: 'l1', name: 'Liga Otoño', slug: 'liga-otono' },
    });

    // Caller is teamA member -> short-circuits the ACL.
    const result = await buildLeagueMatchEvent('lm1', 'u1');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.event.summary).toBe('Halcones vs Tigres');
    expect(result.event.url).toBe('https://example.com/ligas/liga-otono/partidos/lm1');
    expect(result.event.uid).toBe('match-lm1@padelleague.app');
  });

  it('returns forbidden for non-participant who is not super-admin / league-admin / league-registrant', async () => {
    const prisma = await getPrisma();
    prisma.match.findUnique.mockResolvedValue({
      id: 'lm1',
      scheduledAt: new Date('2026-05-03T17:00:00Z'),
      updatedAt: new Date('2026-04-30T18:00:00Z'),
      teamA: { id: 'tA', name: 'A', members: [{ userId: 'u1', user: { id: 'u1', name: 'A' } }] },
      teamB: { id: 'tB', name: 'B', members: [{ userId: 'u2', user: { id: 'u2', name: 'B' } }] },
      league: { id: 'l1', name: 'L', slug: 's' },
    });
    prisma.user.findUnique.mockResolvedValue({ role: 'PLAYER' });
    prisma.league.findUnique.mockResolvedValue({ createdByUserId: 'someone-else' });
    prisma.leagueRegistration.findFirst.mockResolvedValue(null);

    const result = await buildLeagueMatchEvent('lm1', 'u-stranger');
    expect(result.kind).toBe('forbidden');
  });

  it('returns ok for SUPER_ADMIN even when not a participant', async () => {
    const prisma = await getPrisma();
    prisma.match.findUnique.mockResolvedValue({
      id: 'lm1',
      scheduledAt: new Date('2026-05-03T17:00:00Z'),
      updatedAt: new Date('2026-04-30T18:00:00Z'),
      teamA: { id: 'tA', name: 'A', members: [{ userId: 'u1', user: { id: 'u1', name: 'A' } }] },
      teamB: { id: 'tB', name: 'B', members: [{ userId: 'u2', user: { id: 'u2', name: 'B' } }] },
      league: { id: 'l1', name: 'L', slug: 's' },
    });
    prisma.user.findUnique.mockResolvedValue({ role: 'SUPER_ADMIN' });

    const result = await buildLeagueMatchEvent('lm1', 'u-admin');
    expect(result.kind).toBe('ok');
  });

  it('returns no-date when scheduledAt is null', async () => {
    const prisma = await getPrisma();
    prisma.match.findUnique.mockResolvedValue({
      id: 'lm1',
      scheduledAt: null,
      updatedAt: new Date(),
      teamA: { id: 'tA', name: 'A', members: [] },
      teamB: { id: 'tB', name: 'B', members: [] },
      league: { id: 'l1', name: 'L', slug: 's' },
    });

    const result = await buildLeagueMatchEvent('lm1', 'u-any');
    expect(result.kind).toBe('no-date');
  });
});
