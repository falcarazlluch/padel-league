import { prisma } from '@/shared/db/client';
import {
  NotFoundError,
  AuthorizationError,
  DomainError,
  ConflictError,
} from '@/shared/errors';
import { NotificationService } from '@/modules/notifications';
import { SignedTokenService, SignedTokenPurpose } from '@/shared/auth/signed-tokens';
import type {
  CreateOpenMatchInput,
  CreateChallengeInput,
  IndependentMatchDetail,
  IndependentMatchRow,
  TeamForChallenge,
} from '../domain/types';


const MATCH_DETAIL_INCLUDE = {
  organizer: { select: { id: true, name: true } },
  challengedTeam: { select: { id: true, name: true } },
  league: { select: { id: true, name: true, slug: true } },
  participants: {
    where: { status: 'ACCEPTED' as const },
    include: { user: { select: { id: true, name: true } } },
  },
  invitations: {
    orderBy: { createdAt: 'asc' as const },
    include: { invitedUser: { select: { id: true, name: true } } },
  },
} as const;

export function calculateAvailableSlots(maxPlayers: number, confirmedCount: number): number {
  return Math.max(0, maxPlayers - confirmedCount);
}

export const IndependentMatchService = {
  async createOpen(input: CreateOpenMatchInput): Promise<IndependentMatchRow> {
    const match = await prisma.$transaction(async (tx) => {
      const m = await tx.independentMatch.create({
        data: {
          organizerId: input.organizerId,
          name: input.name,
          type: 'OPEN',
          visibility: input.visibility,
          scheduledAt: input.scheduledAt ?? null,
          location: input.location ?? null,
          description: input.description ?? null,
          maxPlayers: input.maxPlayers,
        },
      });
      await tx.independentMatchParticipant.create({
        data: { independentMatchId: m.id, userId: input.organizerId, status: 'ACCEPTED' },
      });
      return m;
    });
    return match;
  },

  async createChallenge(input: CreateChallengeInput): Promise<IndependentMatchRow> {
    const [organizerTeam, challengedTeam] = await Promise.all([
      prisma.team.findUnique({
        where: { id: input.organizerTeamId },
        include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
      }),
      prisma.team.findUnique({
        where: { id: input.challengedTeamId },
        include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
      }),
    ]);

    if (!organizerTeam) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo organizador no encontrado.');
    if (!challengedTeam) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo retado no encontrado.');
    if (input.organizerTeamId === input.challengedTeamId)
      throw new DomainError('SAME_TEAM', 'No puedes retar a tu propio equipo.');
    if (!organizerTeam.members.some((m) => m.userId === input.organizerId))
      throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro del equipo organizador.');

    // Both teams must be actively registered in the same league.
    const [organizerReg, challengedReg] = await Promise.all([
      prisma.leagueRegistration.findUnique({
        where: { leagueId_teamId: { leagueId: input.leagueId, teamId: input.organizerTeamId } },
      }),
      prisma.leagueRegistration.findUnique({
        where: { leagueId_teamId: { leagueId: input.leagueId, teamId: input.challengedTeamId } },
      }),
    ]);
    if (!organizerReg || organizerReg.withdrawnAt !== null)
      throw new DomainError('ORGANIZER_NOT_REGISTERED', 'Tu equipo no está apuntado a la liga.');
    if (!challengedReg || challengedReg.withdrawnAt !== null)
      throw new DomainError('CHALLENGED_NOT_REGISTERED', 'El equipo retado no está apuntado a la liga.');

    const match = await prisma.independentMatch.create({
      data: {
        organizerId: input.organizerId,
        name: input.name,
        type: 'TEAM_CHALLENGE',
        organizerTeamId: input.organizerTeamId,
        challengedTeamId: input.challengedTeamId,
        leagueId: input.leagueId,
        scheduledAt: input.scheduledAt ?? null,
        location: input.location ?? null,
        description: input.description ?? null,
        maxPlayers: 4,
        status: 'PENDING_APPROVAL',
      },
    });

    NotificationService.createMany(
      challengedTeam.members.map((m) => ({
        userId: m.userId,
        type: 'INDEPENDENT_MATCH_INVITE' as const,
        title: 'Reto de pádel recibido',
        body: `${organizerTeam.name} os reta a un partido amistoso.`,
        metadata: { matchId: match.id },
      })),
    ).catch(() => undefined);

    return match;
  },

  async listOpen(): Promise<(IndependentMatchRow & { confirmedCount: number })[]> {
    const matches = await prisma.independentMatch.findMany({
      where: { type: 'OPEN', status: 'OPEN', visibility: 'PUBLIC' },
      include: { _count: { select: { participants: { where: { status: 'ACCEPTED' } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return matches.map((m) => ({
      ...m,
      confirmedCount: m._count.participants,
    }));
  },

  async getForUser(userId: string): Promise<IndependentMatchRow[]> {
    return prisma.independentMatch.findMany({
      where: {
        status: { notIn: ['CANCELLED', 'REJECTED'] },
        OR: [
          { organizerId: userId },
          { participants: { some: { userId, status: 'ACCEPTED' } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getById(id: string): Promise<IndependentMatchDetail> {
    const match = await prisma.independentMatch.findUnique({
      where: { id },
      include: MATCH_DETAIL_INCLUDE,
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    return match as IndependentMatchDetail;
  },

  async getTeamsForUser(userId: string): Promise<TeamForChallenge[]> {
    // Teams the user belongs to that are actively registered in some ACTIVE league.
    const teams = await prisma.team.findMany({
      where: {
        members: { some: { userId } },
        registrations: {
          some: { withdrawnAt: null, league: { status: 'ACTIVE' } },
        },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    return teams;
  },

  async inviteByEmail(
    matchId: string,
    organizerId: string,
    email: string,
  ): Promise<{ invitationId: string; isNew: boolean }> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: { participants: { where: { status: 'ACCEPTED' } } },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede invitar.');
    if (!['OPEN', 'PENDING_APPROVAL'].includes(match.status))
      throw new DomainError('MATCH_NOT_INVITABLE', 'No se puede invitar a este partido.');
    if (calculateAvailableSlots(match.maxPlayers, match.participants.length) === 0)
      throw new DomainError('MATCH_FULL', 'El partido ya está completo.');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const existing = await prisma.independentMatchInvitation.findUnique({
      where: { matchId_email: { matchId, email } },
    });

    if (existing && !existing.acceptedAt && existing.expiresAt > new Date()) {
      return { invitationId: existing.id, isNew: false };
    }

    const invitation = existing
      ? await prisma.independentMatchInvitation.update({
          where: { id: existing.id },
          data: { expiresAt, acceptedAt: null },
        })
      : await prisma.independentMatchInvitation.create({
          data: { matchId, email, expiresAt },
        });

    return { invitationId: invitation.id, isNew: true };
  },

  async inviteUser(
    matchId: string,
    organizerId: string,
    invitedUserId: string,
  ): Promise<{ invitationId: string; isNew: boolean }> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: { participants: { where: { status: 'ACCEPTED' } } },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede invitar.');
    if (!['OPEN', 'PENDING_APPROVAL'].includes(match.status))
      throw new DomainError('MATCH_NOT_INVITABLE', 'No se puede invitar a este partido.');
    if (calculateAvailableSlots(match.maxPlayers, match.participants.length) === 0)
      throw new DomainError('MATCH_FULL', 'El partido ya está completo.');
    if (invitedUserId === organizerId)
      throw new DomainError('CANNOT_INVITE_SELF', 'No puedes invitarte a ti mismo.');
    if (match.participants.some((p) => p.userId === invitedUserId))
      throw new ConflictError('ALREADY_PARTICIPANT', 'Esa persona ya está en el partido.');

    const invitee = await prisma.user.findUnique({
      where: { id: invitedUserId },
      select: { id: true, deletedAt: true },
    });
    if (!invitee || invitee.deletedAt !== null)
      throw new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado.');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const existing = await prisma.independentMatchInvitation.findUnique({
      where: { matchId_invitedUserId: { matchId, invitedUserId } },
    });

    if (existing && !existing.acceptedAt && existing.expiresAt > new Date()) {
      return { invitationId: existing.id, isNew: false };
    }

    const invitation = existing
      ? await prisma.independentMatchInvitation.update({
          where: { id: existing.id },
          data: { expiresAt, acceptedAt: null },
        })
      : await prisma.independentMatchInvitation.create({
          data: { matchId, invitedUserId, expiresAt },
        });

    return { invitationId: invitation.id, isNew: true };
  },

  async cancelInvitation(matchId: string, invitationId: string, organizerId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      select: { organizerId: true },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede cancelar invitaciones.');

    const invitation = await prisma.independentMatchInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, matchId: true, acceptedAt: true },
    });
    if (!invitation) throw new NotFoundError('INVITATION_NOT_FOUND', 'Invitación no encontrada.');
    if (invitation.matchId !== matchId)
      throw new DomainError('INVITATION_MISMATCH', 'La invitación no pertenece a este partido.');
    if (invitation.acceptedAt)
      throw new DomainError('INVITATION_ALREADY_ACCEPTED', 'Esta invitación ya fue aceptada.');

    await prisma.independentMatchInvitation.delete({ where: { id: invitationId } });
  },

  async acceptInvitation(token: string, userId: string): Promise<string> {
    const { subjectId } = await SignedTokenService.consume(token, SignedTokenPurpose.INDEPENDENT_MATCH_INVITE);

    const invitation = await prisma.independentMatchInvitation.findUnique({
      where: { id: subjectId },
      include: { match: { include: { participants: { where: { status: 'ACCEPTED' } } } } },
    });
    if (!invitation) throw new NotFoundError('INVITATION_NOT_FOUND', 'Invitación no encontrada.');
    if (invitation.acceptedAt) throw new DomainError('ALREADY_ACCEPTED', 'Esta invitación ya fue usada.');

    // For user-targeted invitations, only the targeted user can accept.
    if (invitation.invitedUserId !== null && invitation.invitedUserId !== userId) {
      throw new AuthorizationError('NOT_INVITEE', 'Esta invitación no es para ti.');
    }

    const { match } = invitation;
    if (match.status === 'CANCELLED') throw new DomainError('MATCH_CANCELLED', 'Este partido fue cancelado.');
    if (calculateAvailableSlots(match.maxPlayers, match.participants.length) === 0)
      throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

    const alreadyParticipant = match.participants.some((p) => p.userId === userId);
    if (alreadyParticipant) {
      await prisma.independentMatchInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return match.id;
    }

    await prisma.$transaction(async (tx) => {
      const confirmedCount = await tx.independentMatchParticipant.count({
        where: { independentMatchId: match.id, status: 'ACCEPTED' },
      });
      if (confirmedCount >= match.maxPlayers)
        throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

      const isFull = confirmedCount + 1 >= match.maxPlayers;

      await tx.independentMatchInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      await tx.independentMatchParticipant.upsert({
        where: { independentMatchId_userId: { independentMatchId: match.id, userId } },
        create: { independentMatchId: match.id, userId, status: 'ACCEPTED' },
        update: { status: 'ACCEPTED' },
      });
      if (isFull) {
        await tx.independentMatch.update({ where: { id: match.id }, data: { status: 'CONFIRMED' } });
      }
    });

    NotificationService.create({
      userId: match.organizerId,
      type: 'INDEPENDENT_MATCH_CONFIRMED',
      title: 'Alguien aceptó tu invitación',
      body: `Un jugador se unió a "${match.name}".`,
      metadata: { matchId: match.id },
    }).catch(() => undefined);

    return match.id;
  },

  async joinPublicMatch(matchId: string, userId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: { participants: { where: { status: 'ACCEPTED' } } },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.visibility !== 'PUBLIC')
      throw new DomainError('NOT_PUBLIC', 'Este partido no es público.');
    if (match.status === 'CANCELLED')
      throw new DomainError('MATCH_CANCELLED', 'Este partido fue cancelado.');

    if (match.participants.some((p) => p.userId === userId)) return; // idempotent

    await prisma.$transaction(async (tx) => {
      const confirmedCount = await tx.independentMatchParticipant.count({
        where: { independentMatchId: match.id, status: 'ACCEPTED' },
      });
      if (confirmedCount >= match.maxPlayers)
        throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

      const isFull = confirmedCount + 1 >= match.maxPlayers;

      await tx.independentMatchParticipant.upsert({
        where: { independentMatchId_userId: { independentMatchId: match.id, userId } },
        create: { independentMatchId: match.id, userId, status: 'ACCEPTED' },
        update: { status: 'ACCEPTED' },
      });
      if (isFull) {
        await tx.independentMatch.update({ where: { id: match.id }, data: { status: 'CONFIRMED' } });
      }
    });

    NotificationService.create({
      userId: match.organizerId,
      type: 'INDEPENDENT_MATCH_CONFIRMED',
      title: 'Alguien se unió a tu partido',
      body: `Un jugador se unió a "${match.name}".`,
      metadata: { matchId: match.id },
    }).catch(() => undefined);
  },

  async acceptChallenge(matchId: string, userId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: {
        challengedTeam: { include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } } },
        organizer: { select: { id: true, name: true } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.type !== 'TEAM_CHALLENGE') throw new DomainError('NOT_CHALLENGE', 'Este partido no es un reto.');
    if (match.status !== 'PENDING_APPROVAL')
      throw new ConflictError('CHALLENGE_ALREADY_RESOLVED', 'Este reto ya fue respondido.');
    if (!match.challengedTeam)
      throw new DomainError('NO_CHALLENGED_TEAM', 'Equipo retado no encontrado.');

    const isChallengedMember = match.challengedTeam.members.some((m) => m.userId === userId);
    if (!isChallengedMember)
      throw new AuthorizationError('NOT_CHALLENGED_MEMBER', 'Solo un miembro del equipo retado puede aceptar.');

    // Get organizer team members — deterministic via stored organizerTeamId
    if (!match.organizerTeamId)
      throw new DomainError('ORGANIZER_TEAM_NOT_FOUND', 'No se encontró el equipo organizador.');

    const organizerTeam = await prisma.team.findUnique({
      where: { id: match.organizerTeamId },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
    if (!organizerTeam)
      throw new DomainError('ORGANIZER_TEAM_NOT_FOUND', 'No se encontró el equipo organizador.');

    const allParticipantUserIds = [
      ...match.challengedTeam.members.map((m) => m.userId),
      ...organizerTeam.members.map((m) => m.userId),
    ];

    await prisma.$transaction(async (tx) => {
      const updated = await tx.independentMatch.updateMany({
        where: { id: matchId, status: 'PENDING_APPROVAL' },
        data: { status: 'CONFIRMED' },
      });
      if (updated.count === 0)
        throw new ConflictError('CHALLENGE_ALREADY_RESOLVED', 'Este reto ya fue respondido.');
      await tx.independentMatchParticipant.createMany({
        data: allParticipantUserIds.map((uid) => ({
          independentMatchId: matchId,
          userId: uid,
          status: 'ACCEPTED' as const,
        })),
        skipDuplicates: true,
      });
    });

    // Notify organizer
    NotificationService.create({
      userId: match.organizerId,
      type: 'INDEPENDENT_MATCH_CONFIRMED',
      title: 'Reto aceptado',
      body: `${match.challengedTeam.name} aceptó tu reto "${match.name}".`,
      metadata: { matchId },
    }).catch(() => undefined);
  },

  async rejectChallenge(matchId: string, userId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: {
        challengedTeam: { include: { members: { select: { userId: true } } } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.type !== 'TEAM_CHALLENGE') throw new DomainError('NOT_CHALLENGE', 'Este partido no es un reto.');
    if (match.status !== 'PENDING_APPROVAL')
      throw new ConflictError('CHALLENGE_ALREADY_RESOLVED', 'Este reto ya fue respondido.');

    const isChallengedMember = match.challengedTeam?.members.some((m) => m.userId === userId);
    if (!isChallengedMember)
      throw new AuthorizationError('NOT_CHALLENGED_MEMBER', 'Solo un miembro del equipo retado puede rechazar.');

    await prisma.independentMatch.update({
      where: { id: matchId },
      data: { status: 'REJECTED' },
    });

    NotificationService.create({
      userId: match.organizerId,
      type: 'INDEPENDENT_MATCH_CANCELLED',
      title: 'Reto rechazado',
      body: `Tu reto "${match.name}" fue rechazado.`,
      metadata: { matchId },
    }).catch(() => undefined);
  },

  async cancelMatch(matchId: string, organizerId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: { participants: { where: { status: 'ACCEPTED' }, select: { userId: true } } },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede cancelar el partido.');
    if (match.status === 'CANCELLED')
      throw new DomainError('ALREADY_CANCELLED', 'El partido ya está cancelado.');

    await prisma.independentMatch.update({
      where: { id: matchId },
      data: { status: 'CANCELLED' },
    });

    const otherParticipantIds = match.participants
      .map((p) => p.userId)
      .filter((id) => id !== organizerId);

    if (otherParticipantIds.length > 0) {
      NotificationService.createMany(
        otherParticipantIds.map((userId) => ({
          userId,
          type: 'INDEPENDENT_MATCH_CANCELLED' as const,
          title: 'Partido cancelado',
          body: `El partido "${match.name}" ha sido cancelado.`,
          metadata: { matchId },
        })),
      ).catch(() => undefined);
    }
  },
} as const;
