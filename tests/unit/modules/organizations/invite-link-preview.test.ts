import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InviteLinkService } from '@/modules/organizations';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    tournamentInviteLink: { findUnique: vi.fn() },
    leagueRegistration: { count: vi.fn() },
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    tournamentInviteLink: { findUnique: ReturnType<typeof vi.fn> };
    leagueRegistration: { count: ReturnType<typeof vi.fn> };
  };
}

const NOW = new Date('2026-08-01T12:00:00Z');

function link(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link1',
    token: 'tok',
    leagueId: 'l1',
    organizationId: 'org1',
    revokedAt: null,
    expiresAt: new Date('2026-09-01T00:00:00Z'),
    maxUses: null,
    useCount: 0,
    organization: {
      id: 'org1',
      slug: 'racc',
      name: 'RACC',
      logoUrl: null,
      tagline: null,
      isActive: true,
    },
    league: {
      id: 'l1',
      slug: 'torneo-verano',
      name: 'Torneo de Verano',
      description: null,
      type: 'TOURNAMENT',
      category: 'INTERMEDIATE',
      status: 'DRAFT',
      registrationStart: new Date('2026-07-01T00:00:00Z'),
      registrationEnd: new Date('2026-08-20T00:00:00Z'),
      startDate: new Date('2026-09-01T00:00:00Z'),
      endDate: new Date('2026-09-30T00:00:00Z'),
    },
    _count: { enrollments: 0 },
    ...overrides,
  };
}

describe('InviteLinkService.preview — blockedReason', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null only when the token does not exist', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(null);
    await expect(InviteLinkService.preview('nope', NOW)).resolves.toBeNull();
  });

  it('hides links of a deactivated organization', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(
      link({ organization: { ...link().organization, isActive: false } }),
    );
    await expect(InviteLinkService.preview('tok', NOW)).resolves.toBeNull();
  });

  it('is usable inside the window', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(link());
    prisma.leagueRegistration.count.mockResolvedValue(4);

    const preview = await InviteLinkService.preview('tok', NOW);
    expect(preview?.blockedReason).toBeNull();
    expect(preview?.competition.registeredCount).toBe(4);
    expect(preview?.organization.slug).toBe('racc');
  });

  it('reports REVOKED', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(link({ revokedAt: NOW }));
    prisma.leagueRegistration.count.mockResolvedValue(0);
    const preview = await InviteLinkService.preview('tok', NOW);
    expect(preview?.blockedReason).toBe('REVOKED');
  });

  it('reports EXPIRED', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(
      link({ expiresAt: new Date('2026-07-31T00:00:00Z') }),
    );
    prisma.leagueRegistration.count.mockResolvedValue(0);
    const preview = await InviteLinkService.preview('tok', NOW);
    expect(preview?.blockedReason).toBe('EXPIRED');
  });

  it('reports MAX_USES_REACHED', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(link({ maxUses: 8, useCount: 8 }));
    prisma.leagueRegistration.count.mockResolvedValue(0);
    const preview = await InviteLinkService.preview('tok', NOW);
    expect(preview?.blockedReason).toBe('MAX_USES_REACHED');
  });

  it('reports COMPETITION_STARTED once the league leaves DRAFT', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(
      link({ league: { ...link().league, status: 'ACTIVE' } }),
    );
    prisma.leagueRegistration.count.mockResolvedValue(0);
    const preview = await InviteLinkService.preview('tok', NOW);
    expect(preview?.blockedReason).toBe('COMPETITION_STARTED');
  });

  it('reports REGISTRATION_NOT_OPEN_YET before the window', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(
      link({
        league: { ...link().league, registrationStart: new Date('2026-08-10T00:00:00Z') },
      }),
    );
    prisma.leagueRegistration.count.mockResolvedValue(0);
    const preview = await InviteLinkService.preview('tok', NOW);
    expect(preview?.blockedReason).toBe('REGISTRATION_NOT_OPEN_YET');
  });

  it('reports REGISTRATION_CLOSED after the window', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(
      link({ league: { ...link().league, registrationEnd: new Date('2026-07-15T00:00:00Z') } }),
    );
    prisma.leagueRegistration.count.mockResolvedValue(0);
    const preview = await InviteLinkService.preview('tok', NOW);
    expect(preview?.blockedReason).toBe('REGISTRATION_CLOSED');
  });
});

describe('InviteLinkService.resolveForEnrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the ids for a usable link', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(link());
    await expect(InviteLinkService.resolveForEnrollment('tok', NOW)).resolves.toEqual({
      linkId: 'link1',
      leagueId: 'l1',
      organizationId: 'org1',
    });
  });

  it('throws a user-facing message when the window is closed', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(
      link({ league: { ...link().league, registrationEnd: new Date('2026-07-15T00:00:00Z') } }),
    );
    await expect(InviteLinkService.resolveForEnrollment('tok', NOW)).rejects.toThrow(
      /plazo de inscripción/i,
    );
  });

  it('throws when the token is unknown', async () => {
    const prisma = await getPrisma();
    prisma.tournamentInviteLink.findUnique.mockResolvedValue(null);
    await expect(InviteLinkService.resolveForEnrollment('tok', NOW)).rejects.toThrow(/no existe/i);
  });
});
