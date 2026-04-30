import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamService } from '@/modules/teams';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    team: { findUnique: vi.fn() },
    teamMember: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    team: { findUnique: ReturnType<typeof vi.fn> };
    teamMember: { findFirst: ReturnType<typeof vi.fn> };
    user: { findUnique: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

describe('TeamService.invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects self-invite', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });

    await expect(
      TeamService.invite({ teamId: 't1', invitedByUserId: 'u1', invitedUserId: 'u1' }),
    ).rejects.toThrow(/ti mismo/i);
  });

  it('rejects when invitee is already a member', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.team.findUnique.mockResolvedValue({
      members: [{ userId: 'u1' }, { userId: 'u2' }],
      invitations: [],
    });

    await expect(
      TeamService.invite({ teamId: 't1', invitedByUserId: 'u1', invitedUserId: 'u2' }),
    ).rejects.toThrow(/ya es miembro/i);
  });

  it('rejects when there is already a pending invitation for that user', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.team.findUnique.mockResolvedValue({
      members: [{ userId: 'u1' }],
      invitations: [{ invitedUserId: 'u2' }],
    });

    await expect(
      TeamService.invite({ teamId: 't1', invitedByUserId: 'u1', invitedUserId: 'u2' }),
    ).rejects.toThrow(/pendiente para ese usuario/i);
  });

  it('rejects when team is full and invitee is neither member nor pending', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.team.findUnique.mockResolvedValue({
      members: [{ userId: 'u1' }, { userId: 'u3' }],
      invitations: [],
    });

    await expect(
      TeamService.invite({ teamId: 't1', invitedByUserId: 'u1', invitedUserId: 'u2' }),
    ).rejects.toThrow(/completo/i);
  });

  it('rejects when team is not found', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.team.findUnique.mockResolvedValue(null);

    await expect(
      TeamService.invite({ teamId: 't1', invitedByUserId: 'u1', invitedUserId: 'u2' }),
    ).rejects.toThrow(/no encontrado/i);
  });

  it('rejects when invitee user does not exist', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.team.findUnique.mockResolvedValue({
      members: [{ userId: 'u1' }],
      invitations: [],
    });
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      TeamService.invite({ teamId: 't1', invitedByUserId: 'u1', invitedUserId: 'u2' }),
    ).rejects.toThrow(/Usuario no encontrado/i);
  });
});
