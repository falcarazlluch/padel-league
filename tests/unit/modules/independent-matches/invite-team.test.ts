import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndependentMatchService } from '@/modules/independent-matches';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    independentMatch: { findUnique: vi.fn() },
    independentMatchInvitation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    team: { findUnique: vi.fn() },
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    independentMatch: { findUnique: ReturnType<typeof vi.fn> };
    independentMatchInvitation: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    team: { findUnique: ReturnType<typeof vi.fn> };
  };
}

describe('IndependentMatchService.inviteTeam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when caller is not the organizer', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'someone-else',
      maxPlayers: 4,
      status: 'OPEN',
      hostTeamId: 'host-team',
      participants: [],
    });

    await expect(
      IndependentMatchService.inviteTeam('m1', 'u1', 't2'),
    ).rejects.toThrow(/organizador/i);
  });

  it('rejects when fewer than 2 slots remain', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      hostTeamId: 'host-team',
      participants: [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }],
    });

    await expect(
      IndependentMatchService.inviteTeam('m1', 'u1', 't2'),
    ).rejects.toThrow(/dos huecos/i);
  });

  it('rejects when invited team is the host team', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      hostTeamId: 'team-x',
      participants: [{ userId: 'u1' }, { userId: 'u2' }],
    });

    await expect(
      IndependentMatchService.inviteTeam('m1', 'u1', 'team-x'),
    ).rejects.toThrow(/tu propio equipo/i);
  });

  it('returns existing pending team invitation as not-new', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      hostTeamId: null,
      participants: [{ userId: 'u1' }],
    });
    prisma.team.findUnique.mockResolvedValue({ id: 't2', members: [{ userId: 'u3' }, { userId: 'u4' }] });
    const future = new Date(Date.now() + 60_000);
    prisma.independentMatchInvitation.findFirst.mockResolvedValue({
      id: 'inv1',
      acceptedAt: null,
      expiresAt: future,
    });

    const result = await IndependentMatchService.inviteTeam('m1', 'u1', 't2');
    expect(result).toEqual({ invitationId: 'inv1', isNew: false });
    expect(prisma.independentMatchInvitation.create).not.toHaveBeenCalled();
  });

  it('creates a new team invitation when none exists', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      hostTeamId: null,
      participants: [{ userId: 'u1' }],
    });
    prisma.team.findUnique.mockResolvedValue({ id: 't2', members: [{ userId: 'u3' }, { userId: 'u4' }] });
    prisma.independentMatchInvitation.findFirst.mockResolvedValue(null);
    prisma.independentMatchInvitation.create.mockResolvedValue({ id: 'inv-new' });

    const result = await IndependentMatchService.inviteTeam('m1', 'u1', 't2');
    expect(result).toEqual({ invitationId: 'inv-new', isNew: true });
    expect(prisma.independentMatchInvitation.create).toHaveBeenCalledTimes(1);
  });
});
