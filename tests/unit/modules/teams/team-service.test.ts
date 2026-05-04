import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamService } from '@/modules/teams';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    team: { findUnique: vi.fn(), delete: vi.fn() },
    teamMember: { findFirst: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
    leagueRegistration: { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    team: { findUnique: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    teamMember: { findFirst: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
    user: { findUnique: ReturnType<typeof vi.fn> };
    leagueRegistration: { findMany: ReturnType<typeof vi.fn> };
    notification: { createMany: ReturnType<typeof vi.fn> };
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

describe('TeamService.leaveTeam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when caller is not a member of the team', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue(null);

    await expect(TeamService.leaveTeam('t1', 'u1')).rejects.toThrow(/No eres miembro/i);
  });

  it('refuses to leave a team that has active league registrations', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.team.findUnique.mockResolvedValue({
      id: 't1',
      name: 'Mi equipo',
      members: [
        { userId: 'u1', user: { id: 'u1', name: 'A' } },
        { userId: 'u2', user: { id: 'u2', name: 'B' } },
      ],
    });
    // The transaction callback runs the registrations check first; simulate it
    // returning an active registration so the throw fires before any delete.
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      const fn = cb as (tx: typeof prisma) => Promise<void>;
      const tx = {
        leagueRegistration: {
          findMany: vi.fn().mockResolvedValue([{ league: { name: 'Liga Otoño' } }]),
        },
        teamMember: { deleteMany: vi.fn() },
        team: { delete: vi.fn() },
      } as unknown as typeof prisma;
      await fn(tx);
    });

    await expect(TeamService.leaveTeam('t1', 'u1')).rejects.toThrow(/Liga Otoño/);
  });

  it('deletes the empty team after the last member leaves', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.team.findUnique.mockResolvedValue({
      id: 't1',
      name: 'Solo team',
      members: [{ userId: 'u1', user: { id: 'u1', name: 'A' } }],
    });

    const txTeamDelete = vi.fn();
    const txMemberDeleteMany = vi.fn();
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      const fn = cb as (tx: typeof prisma) => Promise<void>;
      const tx = {
        leagueRegistration: { findMany: vi.fn().mockResolvedValue([]) },
        teamMember: { deleteMany: txMemberDeleteMany },
        team: { delete: txTeamDelete },
      } as unknown as typeof prisma;
      await fn(tx);
    });

    await TeamService.leaveTeam('t1', 'u1');

    expect(txMemberDeleteMany).toHaveBeenCalledWith({ where: { teamId: 't1', userId: 'u1' } });
    expect(txTeamDelete).toHaveBeenCalledWith({ where: { id: 't1' } });
    // Solo member: nobody to notify.
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('keeps the team alive and notifies the remaining member', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.team.findUnique.mockResolvedValue({
      id: 't1',
      name: 'Pareja',
      members: [
        { userId: 'u1', user: { id: 'u1', name: 'Quien sale' } },
        { userId: 'u2', user: { id: 'u2', name: 'Quien queda' } },
      ],
    });

    const txTeamDelete = vi.fn();
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      const fn = cb as (tx: typeof prisma) => Promise<void>;
      const tx = {
        leagueRegistration: { findMany: vi.fn().mockResolvedValue([]) },
        teamMember: { deleteMany: vi.fn() },
        team: { delete: txTeamDelete },
      } as unknown as typeof prisma;
      await fn(tx);
    });

    await TeamService.leaveTeam('t1', 'u1');

    expect(txTeamDelete).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'u2',
          type: 'TEAM_MEMBER_LEFT',
          metadata: { teamId: 't1' },
        }),
      ],
    });
  });
});
