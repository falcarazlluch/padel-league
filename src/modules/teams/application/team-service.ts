import { prisma } from '@/shared/db/client';
import {
  AuthorizationError,
  ConflictError,
  DomainError,
  NotFoundError,
} from '@/shared/errors';
import type {
  CreateTeamInput,
  IncomingInvitation,
  InviteInput,
  TeamDetail,
  TeamMatchHistoryEntry,
  TeamPublicProfile,
  TeamStats,
  TeamSummary,
} from '../domain/types';

const MAX_TEAM_SIZE = 2;

async function ensureMember(teamId: string, userId: string): Promise<void> {
  const member = await prisma.teamMember.findFirst({
    where: { teamId, userId },
    select: { id: true },
  });
  if (!member) {
    throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro de este equipo.');
  }
}


export const TeamService = {
  async create(input: CreateTeamInput): Promise<{ id: string }> {
    const name = input.name.trim();
    if (name.length < 2) {
      throw new DomainError('INVALID_NAME', 'El nombre debe tener al menos 2 caracteres.');
    }

    const existing = await prisma.team.findFirst({
      where: { createdByUserId: input.createdByUserId, name },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError('TEAM_EXISTS', 'Ya tienes un equipo con ese nombre.');
    }

    const team = await prisma.team.create({
      data: {
        name,
        category: input.category,
        createdByUserId: input.createdByUserId,
        members: { create: { userId: input.createdByUserId } },
      },
      select: { id: true },
    });
    return team;
  },

  async listForUser(userId: string): Promise<TeamSummary[]> {
    const teams = await prisma.team.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        },
        _count: { select: { invitations: { where: { status: 'PENDING' } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      logoUrl: t.logoUrl,
      createdByUserId: t.createdByUserId,
      createdAt: t.createdAt,
      members: t.members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
      })),
      pendingInvitationCount: t._count.invitations,
    }));
  },

  async getDetail(teamId: string, viewerUserId: string): Promise<TeamDetail> {
    await ensureMember(teamId, viewerUserId);

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
        invitations: {
          where: { status: 'PENDING' },
          include: { invitedUser: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        },
        registrations: {
          include: {
            league: { select: { id: true, name: true, slug: true, status: true } },
          },
          orderBy: { registeredAt: 'desc' },
        },
      },
    });
    if (!team) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');

    return {
      id: team.id,
      name: team.name,
      category: team.category,
      logoUrl: team.logoUrl,
      createdByUserId: team.createdByUserId,
      createdAt: team.createdAt,
      members: team.members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
      })),
      pendingInvitationCount: team.invitations.length,
      invitations: team.invitations.map((i) => ({
        id: i.id,
        invitedUser: i.invitedUser,
        invitedByUserId: i.invitedByUserId,
        status: i.status,
        createdAt: i.createdAt,
      })),
      registrations: team.registrations.map((r) => ({
        id: r.id,
        leagueId: r.leagueId,
        leagueName: r.league.name,
        leagueSlug: r.league.slug,
        leagueStatus: r.league.status,
        registeredAt: r.registeredAt,
        withdrawnAt: r.withdrawnAt,
      })),
    };
  },

  /**
   * Lightweight invitation listing for member-only management UI. Avoids the
   * full `getDetail` round-trip when the team profile page only needs the
   * list of pending invitations (the rest is already in `getPublicProfile`).
   */
  async listPendingInvitations(
    teamId: string,
    viewerUserId: string,
  ): Promise<Array<{ id: string; invitedUserName: string }>> {
    await ensureMember(teamId, viewerUserId);
    const invitations = await prisma.teamInvitation.findMany({
      where: { teamId, status: 'PENDING' },
      include: { invitedUser: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((i) => ({ id: i.id, invitedUserName: i.invitedUser.name }));
  },

  /**
   * Public-ish team profile: viewable by any authenticated user. Strips PII
   * (member emails, pending invitations) for non-members; only members see
   * the management surface from the page.
   */
  async getPublicProfile(teamId: string, viewerUserId: string): Promise<TeamPublicProfile> {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          select: {
            userId: true,
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        registrations: {
          where: {
            // DRAFT leagues are not yet publicly announced; hide them from
            // strangers who can find a team by guessing its id.
            league: { status: { not: 'DRAFT' } },
          },
          include: {
            league: { select: { id: true, name: true, slug: true, status: true } },
          },
          orderBy: { registeredAt: 'desc' },
        },
      },
    });
    if (!team) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');

    const viewerIsMember = team.members.some((m) => m.userId === viewerUserId);

    // Played league matches — used for both stats and the recent history list.
    // EXPIRED_UNPLAYED is excluded; only matches with a final outcome count.
    // `take` is a safety ceiling: a normal season is < 50 matches per team, so
    // 200 covers many seasons while preventing unbounded scans if the predicate
    // ever drifts.
    const playedMatches = await prisma.match.findMany({
      where: {
        OR: [{ teamAId: teamId }, { teamBId: teamId }],
        status: { in: ['CONFIRMED', 'ADMIN_RESOLVED'] },
      },
      select: {
        id: true,
        scheduledAt: true,
        teamAId: true,
        teamBId: true,
        winnerTeamId: true,
        league: { select: { id: true, name: true, slug: true } },
        teamA: { select: { id: true, name: true, logoUrl: true } },
        teamB: { select: { id: true, name: true, logoUrl: true } },
        confirmedResult: { select: { sets: { orderBy: { setNumber: 'asc' } } } },
      },
      orderBy: [{ scheduledAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: 200,
    });

    const stats: TeamStats = {
      played: playedMatches.length,
      won: playedMatches.filter((m) => m.winnerTeamId === teamId).length,
      drawn: playedMatches.filter((m) => m.winnerTeamId === null).length,
      lost: 0,
    };
    stats.lost = stats.played - stats.won - stats.drawn;

    const history: TeamMatchHistoryEntry[] = playedMatches
      .slice(0, 10)
      // Solo matches con dos equipos. Los partidos de Americana ROTATING_INDIVIDUAL
      // nunca llegan aquí (filtramos por teamId), pero por seguridad de tipos
      // descartamos también filas con teamA/teamB null.
      .filter((m) => m.teamA != null && m.teamB != null)
      .map((m) => {
        const isTeamA = m.teamAId === teamId;
        const rival = (isTeamA ? m.teamB : m.teamA)!;
        const sets = m.confirmedResult?.sets ?? [];
        const setsDisplay = sets
          .map((s) => (isTeamA ? `${s.gamesA}-${s.gamesB}` : `${s.gamesB}-${s.gamesA}`))
          .join(' / ');
        const outcome: TeamMatchHistoryEntry['outcome'] =
          m.winnerTeamId === null ? 'drawn' : m.winnerTeamId === teamId ? 'won' : 'lost';
        return {
          matchId: m.id,
          leagueSlug: m.league.slug,
          leagueName: m.league.name,
          scheduledAt: m.scheduledAt,
          rivalTeamId: rival.id,
          rivalTeamName: rival.name,
          rivalLogoUrl: rival.logoUrl,
          outcome,
          setsDisplay,
        };
      });

    return {
      id: team.id,
      name: team.name,
      category: team.category,
      logoUrl: team.logoUrl,
      createdAt: team.createdAt,
      members: team.members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
      })),
      registrations: team.registrations.map((r) => ({
        id: r.id,
        leagueId: r.leagueId,
        leagueName: r.league.name,
        leagueSlug: r.league.slug,
        leagueStatus: r.league.status,
        registeredAt: r.registeredAt,
        isWithdrawn: r.withdrawnAt !== null,
      })),
      history,
      stats,
      viewerIsMember,
    };
  },

  async invite(input: InviteInput): Promise<{ id: string }> {
    await ensureMember(input.teamId, input.invitedByUserId);

    if (input.invitedUserId === input.invitedByUserId) {
      throw new DomainError('CANNOT_INVITE_SELF', 'No puedes invitarte a ti mismo.');
    }

    const team = await prisma.team.findUnique({
      where: { id: input.teamId },
      include: {
        members: { select: { userId: true } },
        invitations: { where: { status: 'PENDING' }, select: { invitedUserId: true } },
      },
    });
    if (!team) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');

    // Specific conflicts checked before capacity — clearer errors for the inviter.
    if (team.members.some((m) => m.userId === input.invitedUserId)) {
      throw new ConflictError('ALREADY_MEMBER', 'Ese usuario ya es miembro del equipo.');
    }
    if (team.invitations.some((i) => i.invitedUserId === input.invitedUserId)) {
      throw new ConflictError('INVITATION_EXISTS', 'Ya hay una invitación pendiente para ese usuario.');
    }

    if (team.members.length >= MAX_TEAM_SIZE) {
      throw new DomainError('TEAM_FULL', 'El equipo ya está completo.');
    }
    const slotsAvailable = MAX_TEAM_SIZE - team.members.length;
    if (team.invitations.length >= slotsAvailable) {
      throw new DomainError('INVITATION_LIMIT', 'Ya hay una invitación pendiente para este equipo.');
    }

    const invitee = await prisma.user.findUnique({
      where: { id: input.invitedUserId },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!invitee || invitee.deletedAt !== null) {
      throw new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado.');
    }

    const invitation = await prisma.$transaction(async (tx) => {
      const inv = await tx.teamInvitation.create({
        data: {
          teamId: input.teamId,
          invitedUserId: invitee.id,
          invitedByUserId: input.invitedByUserId,
        },
      });
      const inviter = await tx.user.findUnique({
        where: { id: input.invitedByUserId },
        select: { name: true },
      });
      await tx.notification.create({
        data: {
          userId: invitee.id,
          type: 'TEAM_INVITATION',
          title: 'Invitación a un equipo',
          body: `${inviter?.name ?? 'Alguien'} te ha invitado a unirte al equipo "${team.name}".`,
          metadata: { invitationId: inv.id, teamId: team.id },
        },
      });
      return inv;
    });
    return { id: invitation.id };
  },

  async cancelInvitation(invitationId: string, userId: string): Promise<void> {
    const invitation = await prisma.teamInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, teamId: true, status: true },
    });
    if (!invitation) throw new NotFoundError('INVITATION_NOT_FOUND', 'Invitación no encontrada.');
    if (invitation.status !== 'PENDING') {
      throw new DomainError('INVITATION_RESOLVED', 'La invitación ya fue resuelta.');
    }
    await ensureMember(invitation.teamId, userId);

    await prisma.teamInvitation.update({
      where: { id: invitationId },
      data: { status: 'CANCELLED', resolvedAt: new Date() },
    });
  },

  async listIncomingInvitations(userId: string): Promise<IncomingInvitation[]> {
    const invitations = await prisma.teamInvitation.findMany({
      where: { invitedUserId: userId, status: 'PENDING' },
      include: {
        team: { select: { id: true, name: true, category: true } },
        invitedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((i) => ({
      id: i.id,
      team: i.team,
      invitedBy: i.invitedBy,
      createdAt: i.createdAt,
    }));
  },

  async acceptInvitation(invitationId: string, userId: string): Promise<void> {
    const invitation = await prisma.teamInvitation.findUnique({
      where: { id: invitationId },
      include: {
        team: {
          include: { members: { select: { userId: true } } },
        },
      },
    });
    if (!invitation) throw new NotFoundError('INVITATION_NOT_FOUND', 'Invitación no encontrada.');
    if (invitation.invitedUserId !== userId) {
      throw new AuthorizationError('NOT_INVITEE', 'Esta invitación no es para ti.');
    }
    if (invitation.status !== 'PENDING') {
      throw new DomainError('INVITATION_RESOLVED', 'La invitación ya fue resuelta.');
    }
    if (invitation.team.members.length >= MAX_TEAM_SIZE) {
      throw new DomainError('TEAM_FULL', 'El equipo ya está completo.');
    }
    if (invitation.team.members.some((m) => m.userId === userId)) {
      throw new ConflictError('ALREADY_MEMBER', 'Ya eres miembro del equipo.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.teamInvitation.update({
        where: { id: invitationId },
        data: { status: 'ACCEPTED', resolvedAt: new Date() },
      });
      await tx.teamMember.create({
        data: { teamId: invitation.teamId, userId },
      });
      const accepter = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      await tx.notification.create({
        data: {
          userId: invitation.invitedByUserId,
          type: 'TEAM_INVITATION_ACCEPTED',
          title: 'Invitación aceptada',
          body: `${accepter?.name ?? 'El jugador'} ha aceptado unirse al equipo.`,
          metadata: { invitationId, teamId: invitation.teamId },
        },
      });
    });
  },

  async leaveTeam(teamId: string, userId: string): Promise<void> {
    await ensureMember(teamId, userId);

    // Pre-fetch only what we need OUTSIDE the transaction: team name + leaver
    // identity for the notification payload. Membership snapshot itself is
    // re-read inside the TX to close the TOCTOU window where a concurrent
    // join/leave could change the count between our read and the delete.
    const teamPreview = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        name: true,
        members: {
          where: { userId },
          select: { user: { select: { name: true } } },
        },
      },
    });
    if (!teamPreview) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');
    const leaverName = teamPreview.members[0]?.user.name ?? 'Tu compañero';
    const teamName = teamPreview.name;

    type RemainingMember = { userId: string };
    const remainingMembers = await prisma.$transaction<RemainingMember[]>(async (tx) => {
      const activeRegistrations = await tx.leagueRegistration.findMany({
        where: { teamId, withdrawnAt: null },
        select: { league: { select: { name: true } } },
      });
      if (activeRegistrations.length > 0) {
        const names = activeRegistrations.map((r) => r.league.name).join(', ');
        throw new DomainError(
          'TEAM_HAS_ACTIVE_REGISTRATIONS',
          `No puedes salir mientras el equipo siga inscrito en: ${names}. Pide al admin que os desinscriba primero.`,
        );
      }

      await tx.teamMember.deleteMany({ where: { teamId, userId } });

      // Re-read inside the TX so we observe the post-delete state — closes
      // the race where a concurrent join could lead us to incorrectly delete
      // the team thinking it was empty.
      const remaining = await tx.teamMember.findMany({
        where: { teamId },
        select: { userId: true },
      });

      if (remaining.length === 0) {
        // Match.teamA/teamB use onDelete: Restrict so historical results stay
        // readable. If the team has ANY match attached (scheduled, played or
        // expired) we can't physically delete it; leave it as a 0-member
        // archived team instead. Note: MatchResult.winnerTeamId is also
        // Restrict, but every MatchResult cascades from a Match, so the
        // match-count check covers it.
        const matchCount = await tx.match.count({
          where: { OR: [{ teamAId: teamId }, { teamBId: teamId }] },
        });
        if (matchCount === 0) {
          await tx.team.delete({ where: { id: teamId } });
        }
      }

      return remaining;
    });

    if (remainingMembers.length > 0) {
      await prisma.notification.createMany({
        data: remainingMembers.map((m) => ({
          userId: m.userId,
          type: 'TEAM_MEMBER_LEFT' as const,
          title: 'Tu compañero ha salido del equipo',
          body: `${leaverName} ha salido del equipo "${teamName}".`,
          metadata: { teamId },
        })),
      });
    }
  },

  async rejectInvitation(invitationId: string, userId: string): Promise<void> {
    const invitation = await prisma.teamInvitation.findUnique({
      where: { id: invitationId },
      select: {
        id: true, teamId: true, invitedUserId: true, invitedByUserId: true, status: true,
      },
    });
    if (!invitation) throw new NotFoundError('INVITATION_NOT_FOUND', 'Invitación no encontrada.');
    if (invitation.invitedUserId !== userId) {
      throw new AuthorizationError('NOT_INVITEE', 'Esta invitación no es para ti.');
    }
    if (invitation.status !== 'PENDING') {
      throw new DomainError('INVITATION_RESOLVED', 'La invitación ya fue resuelta.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.teamInvitation.update({
        where: { id: invitationId },
        data: { status: 'REJECTED', resolvedAt: new Date() },
      });
      const rejecter = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      await tx.notification.create({
        data: {
          userId: invitation.invitedByUserId,
          type: 'TEAM_INVITATION_REJECTED',
          title: 'Invitación rechazada',
          body: `${rejecter?.name ?? 'El jugador'} ha rechazado tu invitación.`,
          metadata: { invitationId, teamId: invitation.teamId },
        },
      });
    });
  },

  // ─── Admin (SUPER_ADMIN) ────────────────────────────────────────────────
  // Listado completo de equipos para `/admin/equipos`. Incluye contadores de
  // miembros, ligas activas y partidos para que el admin pueda valorar si un
  // equipo "viejo y vacío" se puede borrar limpiamente.
  async adminList(
    requestingUserId: string,
    search: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      category: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
      logoUrl: string | null;
      createdAt: Date;
      memberCount: number;
      activeRegistrationsCount: number;
      matchCount: number;
      memberNames: string[];
    }>
  > {
    const requester = await prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { role: true },
    });
    if (requester?.role !== 'SUPER_ADMIN') {
      throw new AuthorizationError('FORBIDDEN', 'Solo Super Admin.');
    }

    const trimmed = search.trim();
    const teams = await prisma.team.findMany({
      where: trimmed.length > 0
        ? { name: { contains: trimmed, mode: 'insensitive' } }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        _count: {
          select: {
            members: true,
            homeMatches: true,
            awayMatches: true,
          },
        },
        members: { select: { user: { select: { name: true } } } },
        registrations: {
          where: { withdrawnAt: null },
          select: { id: true },
        },
      },
    });

    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      logoUrl: t.logoUrl,
      createdAt: t.createdAt,
      memberCount: t._count.members,
      activeRegistrationsCount: t.registrations.length,
      matchCount: t._count.homeMatches + t._count.awayMatches,
      memberNames: t.members.map((m) => m.user.name),
    }));
  },

  // Borrado admin de un equipo. Bloquea si tiene matches (FK Restrict de
  // Match.teamAId/teamBId) — el admin debe borrar las ligas asociadas
  // primero, lo cual cascade-elimina los matches y libera el equipo.
  async adminDelete(teamId: string, requestingUserId: string): Promise<void> {
    const requester = await prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { role: true },
    });
    if (requester?.role !== 'SUPER_ADMIN') {
      throw new AuthorizationError('FORBIDDEN', 'Solo Super Admin.');
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        _count: { select: { homeMatches: true, awayMatches: true } },
      },
    });
    if (!team) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');

    const totalMatches = team._count.homeMatches + team._count.awayMatches;
    if (totalMatches > 0) {
      throw new DomainError(
        'TEAM_HAS_MATCHES',
        `No se puede eliminar "${team.name}": tiene ${totalMatches} partido(s) asociado(s). Borra primero las competiciones donde participe.`,
      );
    }

    // Cascade limpia: TeamMember, TeamInvitation, LeagueRegistration y
    // TeamCategoryChangeProposal tienen onDelete: Cascade hacia Team.
    await prisma.team.delete({ where: { id: teamId } });
  },
} as const;
