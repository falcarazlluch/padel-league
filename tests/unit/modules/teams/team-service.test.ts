import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamService } from '@/modules/teams';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    team: { findUnique: vi.fn(), delete: vi.fn() },
    teamMember: { findFirst: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
    leagueRegistration: { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
    match: { findMany: vi.fn(), count: vi.fn() },
    matchResult: { count: vi.fn() },
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
    match: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
    matchResult: { count: ReturnType<typeof vi.fn> };
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
        match: { count: vi.fn().mockResolvedValue(0) },
      } as unknown as typeof prisma;
      await fn(tx);
    });

    await TeamService.leaveTeam('t1', 'u1');

    expect(txMemberDeleteMany).toHaveBeenCalledWith({ where: { teamId: 't1', userId: 'u1' } });
    expect(txTeamDelete).toHaveBeenCalledWith({ where: { id: 't1' } });
    // Solo member: nobody to notify.
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('leaves the team as a 0-member orphan when the solo leaver has historical matches', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.team.findUnique.mockResolvedValue({
      id: 't1',
      name: 'Veterano',
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
        match: { count: vi.fn().mockResolvedValue(3) },
      } as unknown as typeof prisma;
      await fn(tx);
    });

    await TeamService.leaveTeam('t1', 'u1');

    expect(txMemberDeleteMany).toHaveBeenCalled();
    // Team is preserved because deleting it would violate the FK to historical Match rows.
    expect(txTeamDelete).not.toHaveBeenCalled();
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

describe('TeamService.getPublicProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the team with stats + history; does NOT require membership', async () => {
    const prisma = await getPrisma();
    prisma.team.findUnique.mockResolvedValue({
      id: 't1',
      name: 'Halcones',
      category: 'INTERMEDIATE',
      logoUrl: null,
      createdAt: new Date('2025-09-01T10:00:00Z'),
      members: [
        { userId: 'u-member', user: { id: 'u-member', name: 'Capi', avatarUrl: null } },
      ],
      registrations: [],
    });
    prisma.match.findMany.mockResolvedValue([
      {
        id: 'm-won',
        scheduledAt: new Date('2026-04-01T18:00:00Z'),
        teamAId: 't1',
        teamBId: 't2',
        winnerTeamId: 't1',
        league: { id: 'l1', name: 'L', slug: 'l' },
        teamA: { id: 't1', name: 'Halcones', logoUrl: null },
        teamB: { id: 't2', name: 'Tigres', logoUrl: null },
        confirmedResult: { sets: [{ setNumber: 1, gamesA: 6, gamesB: 4 }, { setNumber: 2, gamesA: 6, gamesB: 3 }] },
      },
      {
        id: 'm-lost',
        scheduledAt: new Date('2026-03-01T18:00:00Z'),
        teamAId: 't3',
        teamBId: 't1',
        winnerTeamId: 't3',
        league: { id: 'l1', name: 'L', slug: 'l' },
        teamA: { id: 't3', name: 'Lobos', logoUrl: null },
        teamB: { id: 't1', name: 'Halcones', logoUrl: null },
        confirmedResult: { sets: [{ setNumber: 1, gamesA: 6, gamesB: 2 }] },
      },
      {
        id: 'm-drawn',
        scheduledAt: new Date('2026-02-01T18:00:00Z'),
        teamAId: 't1',
        teamBId: 't4',
        winnerTeamId: null,
        league: { id: 'l1', name: 'L', slug: 'l' },
        teamA: { id: 't1', name: 'Halcones', logoUrl: null },
        teamB: { id: 't4', name: 'Osos', logoUrl: null },
        confirmedResult: { sets: [{ setNumber: 1, gamesA: 6, gamesB: 4 }, { setNumber: 2, gamesA: 4, gamesB: 6 }] },
      },
    ]);

    // Caller is a stranger — not member of team t1.
    const profile = await TeamService.getPublicProfile('t1', 'u-stranger');

    expect(profile.viewerIsMember).toBe(false);
    expect(profile.stats).toEqual({ played: 3, won: 1, drawn: 1, lost: 1 });
    expect(profile.history).toHaveLength(3);
    // Score normalised to "this team perspective": when our team is teamB we
    // flip the games per set so the first number is always our games.
    expect(profile.history[1]).toMatchObject({
      matchId: 'm-lost',
      outcome: 'lost',
      rivalTeamId: 't3',
      setsDisplay: '2-6',
    });
    expect(profile.history[0]).toMatchObject({ matchId: 'm-won', outcome: 'won', setsDisplay: '6-4 / 6-3' });
    // No emails leak in member projection (only id/name/avatarUrl).
    expect(profile.members[0]).toEqual({ userId: 'u-member', name: 'Capi', avatarUrl: null });
  });

  it('flags viewerIsMember=true when the caller is on the roster', async () => {
    const prisma = await getPrisma();
    prisma.team.findUnique.mockResolvedValue({
      id: 't1',
      name: 'Mi equipo',
      category: 'INTERMEDIATE',
      logoUrl: null,
      createdAt: new Date(),
      members: [{ userId: 'u-member', user: { id: 'u-member', name: 'Yo', avatarUrl: null } }],
      registrations: [],
    });
    prisma.match.findMany.mockResolvedValue([]);

    const profile = await TeamService.getPublicProfile('t1', 'u-member');
    expect(profile.viewerIsMember).toBe(true);
    expect(profile.stats).toEqual({ played: 0, won: 0, drawn: 0, lost: 0 });
  });

  it('throws TEAM_NOT_FOUND when the team does not exist', async () => {
    const prisma = await getPrisma();
    prisma.team.findUnique.mockResolvedValue(null);

    await expect(TeamService.getPublicProfile('t-missing', 'u1')).rejects.toThrow(/no encontrado/i);
  });
});
