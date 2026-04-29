import { prisma } from '@/shared/db/client';
import { AuthorizationError, DomainError, NotFoundError } from '@/shared/errors';
import type { UserRole } from '@prisma/client';

export type UserListItem = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  teamCount: number;
  leaguesCreatedCount: number;
};

export type UserDetail = UserListItem & {
  teams: Array<{ id: string; name: string; category: string }>;
  leaguesCreated: Array<{ id: string; name: string; slug: string; status: string }>;
};

async function ensureSuperAdmin(actingUserId: string): Promise<void> {
  const acting = await prisma.user.findUnique({
    where: { id: actingUserId },
    select: { role: true },
  });
  if (acting?.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('FORBIDDEN', 'Acción reservada para Super Admin.');
  }
}

export const UserAdminService = {
  async list(actingUserId: string, query?: string): Promise<UserListItem[]> {
    await ensureSuperAdmin(actingUserId);
    const trimmed = (query ?? '').trim();
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(trimmed.length > 0 && {
          OR: [
            { email: { contains: trimmed, mode: 'insensitive' } },
            { name: { contains: trimmed, mode: 'insensitive' } },
          ],
        }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        _count: {
          select: { teamMemberships: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Count leagues created (not exposed via _count cleanly here because there's no relation
    // back from User to League by createdByUserId; query separately).
    const ids = users.map((u) => u.id);
    const leaguesByCreator = await prisma.league.groupBy({
      by: ['createdByUserId'],
      where: { createdByUserId: { in: ids } },
      _count: true,
    });
    const leaguesMap = new Map(leaguesByCreator.map((g) => [g.createdByUserId, g._count]));

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      teamCount: u._count.teamMemberships,
      leaguesCreatedCount: leaguesMap.get(u.id) ?? 0,
    }));
  },

  async getDetail(actingUserId: string, userId: string): Promise<UserDetail> {
    await ensureSuperAdmin(actingUserId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        teamMemberships: {
          select: {
            team: { select: { id: true, name: true, category: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado.');

    const leaguesCreated = await prisma.league.findMany({
      where: { createdByUserId: userId },
      select: { id: true, name: true, slug: true, status: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      teamCount: user.teamMemberships.length,
      leaguesCreatedCount: leaguesCreated.length,
      teams: user.teamMemberships.map((tm) => tm.team),
      leaguesCreated,
    };
  },

  async setRole(actingUserId: string, targetUserId: string, role: UserRole): Promise<void> {
    await ensureSuperAdmin(actingUserId);
    if (actingUserId === targetUserId) {
      throw new DomainError('CANNOT_CHANGE_OWN_ROLE', 'No puedes cambiar tu propio rol.');
    }
    if (role === 'SUPER_ADMIN') {
      // Promoting another user to SUPER_ADMIN is intentionally not supported here —
      // it should be done out-of-band (DB) to avoid escalation chains.
      throw new DomainError('NOT_SUPPORTED', 'No se puede promover a Super Admin desde la UI.');
    }
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado.');
    if (target.role === 'SUPER_ADMIN') {
      throw new DomainError('CANNOT_DEMOTE_SUPER_ADMIN', 'No se puede modificar el rol de un Super Admin.');
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: { role },
    });
  },
} as const;
