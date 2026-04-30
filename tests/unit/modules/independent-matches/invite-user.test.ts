import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndependentMatchService } from '@/modules/independent-matches';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    independentMatch: { findUnique: vi.fn() },
    independentMatchInvitation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    independentMatch: { findUnique: ReturnType<typeof vi.fn> };
    independentMatchInvitation: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    user: { findUnique: ReturnType<typeof vi.fn> };
  };
}

describe('IndependentMatchService.inviteUser', () => {
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
      participants: [],
    });

    await expect(
      IndependentMatchService.inviteUser('m1', 'u1', 'u2'),
    ).rejects.toThrow(/organizador/i);
  });

  it('rejects self-invite', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      participants: [],
    });

    await expect(
      IndependentMatchService.inviteUser('m1', 'u1', 'u1'),
    ).rejects.toThrow(/ti mismo/i);
  });

  it('rejects when invitee is already a participant', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      participants: [{ userId: 'u2' }],
    });

    await expect(
      IndependentMatchService.inviteUser('m1', 'u1', 'u2'),
    ).rejects.toThrow(/ya está en el partido/i);
  });

  it('returns existing invitation as not-new when still pending', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      participants: [],
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', deletedAt: null });
    const future = new Date(Date.now() + 60_000);
    prisma.independentMatchInvitation.findUnique.mockResolvedValue({
      id: 'inv1',
      acceptedAt: null,
      expiresAt: future,
    });

    const result = await IndependentMatchService.inviteUser('m1', 'u1', 'u2');
    expect(result).toEqual({ invitationId: 'inv1', isNew: false });
    expect(prisma.independentMatchInvitation.create).not.toHaveBeenCalled();
  });

  it('creates a new invitation when none exists', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      participants: [],
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', deletedAt: null });
    prisma.independentMatchInvitation.findUnique.mockResolvedValue(null);
    prisma.independentMatchInvitation.create.mockResolvedValue({ id: 'inv-new' });

    const result = await IndependentMatchService.inviteUser('m1', 'u1', 'u2');
    expect(result).toEqual({ invitationId: 'inv-new', isNew: true });
    expect(prisma.independentMatchInvitation.create).toHaveBeenCalledTimes(1);
  });
});
