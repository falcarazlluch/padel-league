import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamService } from '@/modules/teams';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    team: { findUnique: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    teamMember: { findFirst: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    teamInvitation: { findMany: vi.fn() },
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
    team: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    teamMember: {
      findFirst: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    teamInvitation: { findMany: ReturnType<typeof vi.fn> };
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
      name: 'Mi equipo',
      members: [{ user: { name: 'A' } }],
    });
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      const fn = cb as (tx: typeof prisma) => Promise<unknown>;
      const tx = {
        leagueRegistration: {
          findMany: vi.fn().mockResolvedValue([{ league: { name: 'Liga Otoño' } }]),
        },
        teamMember: { deleteMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
        team: { delete: vi.fn() },
        match: { count: vi.fn().mockResolvedValue(0) },
      } as unknown as typeof prisma;
      return fn(tx);
    });

    await expect(TeamService.leaveTeam('t1', 'u1')).rejects.toThrow(/Liga Otoño/);
  });

  it('deletes the empty team after the last member leaves', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.team.findUnique.mockResolvedValue({
      name: 'Solo team',
      members: [{ user: { name: 'A' } }],
    });

    const txTeamDelete = vi.fn();
    const txMemberDeleteMany = vi.fn();
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      const fn = cb as (tx: typeof prisma) => Promise<unknown>;
      const tx = {
        leagueRegistration: { findMany: vi.fn().mockResolvedValue([]) },
        teamMember: {
          deleteMany: txMemberDeleteMany,
          // Re-read inside the TX returns 0 members → solo leaver case.
          findMany: vi.fn().mockResolvedValue([]),
        },
        team: { delete: txTeamDelete },
        match: { count: vi.fn().mockResolvedValue(0) },
      } as unknown as typeof prisma;
      return fn(tx);
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
      name: 'Veterano',
      members: [{ user: { name: 'A' } }],
    });

    const txTeamDelete = vi.fn();
    const txMemberDeleteMany = vi.fn();
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      const fn = cb as (tx: typeof prisma) => Promise<unknown>;
      const tx = {
        leagueRegistration: { findMany: vi.fn().mockResolvedValue([]) },
        teamMember: {
          deleteMany: txMemberDeleteMany,
          findMany: vi.fn().mockResolvedValue([]),
        },
        team: { delete: txTeamDelete },
        match: { count: vi.fn().mockResolvedValue(3) },
      } as unknown as typeof prisma;
      return fn(tx);
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
      name: 'Pareja',
      members: [{ user: { name: 'Quien sale' } }],
    });

    const txTeamDelete = vi.fn();
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      const fn = cb as (tx: typeof prisma) => Promise<unknown>;
      const tx = {
        leagueRegistration: { findMany: vi.fn().mockResolvedValue([]) },
        teamMember: {
          deleteMany: vi.fn(),
          // Re-read inside the TX shows 'u2' still on the roster.
          findMany: vi.fn().mockResolvedValue([{ userId: 'u2' }]),
        },
        team: { delete: txTeamDelete },
        match: { count: vi.fn().mockResolvedValue(0) },
      } as unknown as typeof prisma;
      return fn(tx);
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

  it('TOCTOU: deletes team only when post-delete read confirms 0 members', async () => {
    // Snapshot taken pre-TX shows we're the last member. But a concurrent join
    // happens between the pre-fetch and the delete, so the post-delete read
    // inside the TX returns 1 remaining member. The team must NOT be deleted.
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.team.findUnique.mockResolvedValue({
      name: 'Race',
      members: [{ user: { name: 'A' } }],
    });

    const txTeamDelete = vi.fn();
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      const fn = cb as (tx: typeof prisma) => Promise<unknown>;
      const tx = {
        leagueRegistration: { findMany: vi.fn().mockResolvedValue([]) },
        teamMember: {
          deleteMany: vi.fn(),
          // Concurrent join landed before our delete: post-delete read shows
          // a different user is still on the roster.
          findMany: vi.fn().mockResolvedValue([{ userId: 'u-late-joiner' }]),
        },
        team: { delete: txTeamDelete },
        match: { count: vi.fn().mockResolvedValue(0) },
      } as unknown as typeof prisma;
      return fn(tx);
    });

    await TeamService.leaveTeam('t1', 'u1');

    expect(txTeamDelete).not.toHaveBeenCalled();
  });
});

describe('TeamService.listPendingInvitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when caller is not a member of the team', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue(null);

    await expect(TeamService.listPendingInvitations('t1', 'u1')).rejects.toThrow(/No eres miembro/i);
  });

  it('returns the pending invitations with the invited user name', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.teamInvitation.findMany.mockResolvedValue([
      { id: 'i1', invitedUser: { name: 'Alice' } },
      { id: 'i2', invitedUser: { name: 'Bob' } },
    ]);

    const result = await TeamService.listPendingInvitations('t1', 'u1');

    expect(result).toEqual([
      { id: 'i1', invitedUserName: 'Alice' },
      { id: 'i2', invitedUserName: 'Bob' },
    ]);
    expect(prisma.teamInvitation.findMany).toHaveBeenCalledWith({
      where: { teamId: 't1', status: 'PENDING' },
      include: { invitedUser: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('TeamService.getPublicProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the team with stats + history; does NOT require membership', async () => {
    const prisma = await getPrisma();
    prisma.team.findFirst.mockResolvedValue({
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
    const profile = await TeamService.getPublicProfile('t1', 'u-stranger', null);

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
    prisma.team.findFirst.mockResolvedValue({
      id: 't1',
      name: 'Mi equipo',
      category: 'INTERMEDIATE',
      logoUrl: null,
      createdAt: new Date(),
      members: [{ userId: 'u-member', user: { id: 'u-member', name: 'Yo', avatarUrl: null } }],
      registrations: [],
    });
    prisma.match.findMany.mockResolvedValue([]);

    const profile = await TeamService.getPublicProfile('t1', 'u-member', null);
    expect(profile.viewerIsMember).toBe(true);
    expect(profile.stats).toEqual({ played: 0, won: 0, drawn: 0, lost: 0 });
  });

  it('throws TEAM_NOT_FOUND when the team does not exist', async () => {
    const prisma = await getPrisma();
    prisma.team.findFirst.mockResolvedValue(null);

    await expect(TeamService.getPublicProfile('t-missing', 'u1', null)).rejects.toThrow(/no encontrado/i);
  });

  it('scopes the lookup to the tenant, so a cross-tenant team id is not found', async () => {
    const prisma = await getPrisma();
    // findFirst returns null because the where clause carries organizationId.
    prisma.team.findFirst.mockResolvedValue(null);

    await expect(TeamService.getPublicProfile('t-other-org', 'u1', 'org-racc')).rejects.toThrow(
      /no encontrado/i,
    );
    expect(prisma.team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 't-other-org', organizationId: 'org-racc' }),
      }),
    );
  });
});
