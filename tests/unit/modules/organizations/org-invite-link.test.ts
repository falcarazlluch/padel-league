import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InviteLinkService } from '@/modules/organizations';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    tournamentInviteLink: { findUnique: vi.fn() },
    leagueRegistration: { count: vi.fn() },
    league: { findMany: vi.fn() },
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    tournamentInviteLink: { findUnique: ReturnType<typeof vi.fn> };
    leagueRegistration: { count: ReturnType<typeof vi.fn> };
    league: { findMany: ReturnType<typeof vi.fn> };
  };
}

const NOW = new Date('2026-08-10T12:00:00Z');

/** An ORGANIZATION link: no league_id. */
function orgLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-org',
    token: 'orgtok',
    leagueId: null,
    league: null,
    organizationId: 'org1',
    revokedAt: null,
    expiresAt: null,
    maxUses: null,
    useCount: 0,
    organization: {
      id: 'org1',
      slug: 'racc',
      name: 'RACC',
      logoUrl: null,
      tagline: 'Pádel para socios',
      isActive: true,
    },
    ...overrides,
  };
}

function openLeague(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `id-${slug}`,
    slug,
    name: slug.toUpperCase(),
    type: 'TOURNAMENT',
    category: 'INTERMEDIATE',
    registrationEnd: new Date('2026-08-20T00:00:00Z'),
    startDate: new Date('2026-09-01T00:00:00Z'),
    endDate: new Date('2026-09-30T00:00:00Z'),
    _count: { registrations: 3 },
    ...overrides,
  };
}

describe('InviteLinkService.preview — ORGANIZATION links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the open competitions instead of a single one', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(orgLink());
    prisma.league.findMany.mockResolvedValue([openLeague('torneo-a'), openLeague('torneo-b')]);

    const preview = await InviteLinkService.preview('orgtok', NOW);
    expect(preview?.kind).toBe('ORGANIZATION');
    expect(preview?.competition).toBeNull();
    expect(preview?.openCompetitions.map((c) => c.slug)).toEqual(['torneo-a', 'torneo-b']);
    expect(preview?.openCompetitions[0]?.registeredCount).toBe(3);
    expect(preview?.blockedReason).toBeNull();
    // No single-competition count query is needed for an org link.
    expect(prisma.leagueRegistration.count).not.toHaveBeenCalled();
  });

  it('reports NO_OPEN_COMPETITIONS rather than looking broken', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(orgLink());
    prisma.league.findMany.mockResolvedValue([]);

    const preview = await InviteLinkService.preview('orgtok', NOW);
    expect(preview?.blockedReason).toBe('NO_OPEN_COMPETITIONS');
  });

  it('still honours link-level problems, and they win over the empty list', async () => {
    const prisma = await getPrisma();
    prisma.league.findMany.mockResolvedValue([]);

    prisma.tournamentInviteLink.findUnique.mockResolvedValue(orgLink({ revokedAt: NOW }));
    expect((await InviteLinkService.preview('orgtok', NOW))?.blockedReason).toBe('REVOKED');

    prisma.tournamentInviteLink.findUnique.mockResolvedValue(
      orgLink({ expiresAt: new Date('2026-08-01T00:00:00Z') }),
    );
    expect((await InviteLinkService.preview('orgtok', NOW))?.blockedReason).toBe('EXPIRED');

    prisma.tournamentInviteLink.findUnique.mockResolvedValue(orgLink({ maxUses: 5, useCount: 5 }));
    expect((await InviteLinkService.preview('orgtok', NOW))?.blockedReason).toBe(
      'MAX_USES_REACHED',
    );
  });

  it('never applies competition-window reasons to an org link', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(orgLink());
    prisma.league.findMany.mockResolvedValue([openLeague('torneo-a')]);

    const preview = await InviteLinkService.preview('orgtok', NOW);
    // An org link has no window of its own: these must be impossible here.
    expect(preview?.blockedReason).not.toBe('REGISTRATION_CLOSED');
    expect(preview?.blockedReason).not.toBe('REGISTRATION_NOT_OPEN_YET');
    expect(preview?.blockedReason).not.toBe('COMPETITION_STARTED');
  });

  it('marks competitions the viewer already started so the picker has no dead ends', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(orgLink());
    prisma.league.findMany.mockResolvedValue([
      openLeague('torneo-a', { enrollments: [{ id: 'e1' }] }),
      openLeague('torneo-b', { enrollments: [] }),
    ]);

    const preview = await InviteLinkService.preview('orgtok', NOW, 'u1');
    expect(preview?.openCompetitions.map((c) => c.alreadyEnrolled)).toEqual([true, false]);
  });
});

describe('InviteLinkService.resolveForEnrollment — ORGANIZATION links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a null leagueId so the caller knows it must pick one', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(orgLink());

    await expect(InviteLinkService.resolveForEnrollment('orgtok', NOW)).resolves.toEqual({
      linkId: 'link-org',
      leagueId: null,
      organizationId: 'org1',
    });
  });

  it('rejects a revoked org link with its specific message', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(orgLink({ revokedAt: NOW }));

    await expect(InviteLinkService.resolveForEnrollment('orgtok', NOW)).rejects.toThrow(
      /desactivado/i,
    );
  });
});
