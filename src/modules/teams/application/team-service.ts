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
} as const;
