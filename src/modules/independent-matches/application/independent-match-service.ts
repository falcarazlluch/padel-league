import { prisma } from '@/shared/db/client';
import {
  NotFoundError,
  AuthorizationError,
  DomainError,
  ConflictError,
} from '@/shared/errors';
import { NotificationService } from '@/modules/notifications';
import type {
  CreateOpenMatchInput,
  CreateChallengeInput,
  IndependentMatchDetail,
  IndependentMatchRow,
  TeamForChallenge,
} from '../domain/types';


const MATCH_DETAIL_INCLUDE = {
  organizer: { select: { id: true, name: true } },
  challengedTeam: { select: { id: true, name: true, leagueId: true } },
  league: { select: { id: true, name: true, slug: true } },
  participants: {
    where: { status: 'ACCEPTED' as const },
    include: { user: { select: { id: true, name: true } } },
  },
  joinRequests: {
    where: { status: 'PENDING' as const },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  invitations: {
    orderBy: { createdAt: 'asc' as const },
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
    if (organizerTeam.leagueId !== challengedTeam.leagueId)
      throw new DomainError('TEAMS_DIFF_LEAGUE', 'Los equipos deben pertenecer a la misma liga.');
    if (input.organizerTeamId === input.challengedTeamId)
      throw new DomainError('SAME_TEAM', 'No puedes retar a tu propio equipo.');
    if (input.leagueId !== organizerTeam.leagueId)
      throw new DomainError('LEAGUE_MISMATCH', 'leagueId no coincide con el equipo.');
    if (!organizerTeam.members.some((m) => m.userId === input.organizerId))
      throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro del equipo organizador.');

    const match = await prisma.independentMatch.create({
      data: {
        organizerId: input.organizerId,
        name: input.name,
        type: 'TEAM_CHALLENGE',
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
      where: { type: 'OPEN', status: 'OPEN' },
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
    const teams = await prisma.team.findMany({
      where: {
        members: { some: { userId } },
        league: { status: 'ACTIVE' },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    return teams;
  },

  async requestToJoin(matchId: string, userId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: {
        participants: { where: { status: 'ACCEPTED' } },
        joinRequests: { where: { userId, status: 'PENDING' } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.type !== 'OPEN') throw new DomainError('NOT_OPEN_MATCH', 'Solo puedes unirte a partidos abiertos.');
    if (match.status !== 'OPEN') throw new DomainError('MATCH_NOT_OPEN', 'Este partido ya no admite solicitudes.');
    if (match.organizerId === userId) throw new DomainError('IS_ORGANIZER', 'Eres el organizador de este partido.');
    if (match.participants.some((p) => p.userId === userId))
      throw new ConflictError('ALREADY_PARTICIPANT', 'Ya eres participante de este partido.');
    if (match.joinRequests.length > 0)
      throw new ConflictError('REQUEST_EXISTS', 'Ya tienes una solicitud pendiente.');
    if (calculateAvailableSlots(match.maxPlayers, match.participants.length) === 0)
      throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

    await prisma.independentMatchJoinRequest.create({
      data: { independentMatchId: matchId, userId },
    });

    NotificationService.create({
      userId: match.organizerId,
      type: 'INDEPENDENT_MATCH_JOIN_REQUEST',
      title: 'Nueva solicitud para tu partido',
      body: 'Alguien quiere unirse a tu partido.',
      metadata: { matchId },
    }).catch(() => undefined);
  },

  async approveJoinRequest(requestId: string, organizerId: string): Promise<void> {
    const request = await prisma.independentMatchJoinRequest.findUnique({
      where: { id: requestId },
      include: {
        match: {
          include: { participants: { where: { status: 'ACCEPTED' } } },
        },
      },
    });
    if (!request) throw new NotFoundError('REQUEST_NOT_FOUND', 'Solicitud no encontrada.');
    if (request.match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede aprobar solicitudes.');
    if (request.status !== 'PENDING')
      throw new DomainError('REQUEST_NOT_PENDING', 'Esta solicitud ya fue procesada.');

    const available = calculateAvailableSlots(request.match.maxPlayers, request.match.participants.length);
    if (available === 0) throw new DomainError('MATCH_FULL', 'El partido ya está completo.');

    const newCount = request.match.participants.length + 1;
    const isFull = newCount >= request.match.maxPlayers;

    await prisma.$transaction(async (tx) => {
      await tx.independentMatchJoinRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', respondedByUserId: organizerId, respondedAt: new Date() },
      });
      await tx.independentMatchParticipant.create({
        data: { independentMatchId: request.independentMatchId, userId: request.userId, status: 'ACCEPTED' },
      });
      if (isFull) {
        await tx.independentMatch.update({
          where: { id: request.independentMatchId },
          data: { status: 'CONFIRMED' },
        });
      }
    });

    NotificationService.create({
      userId: request.userId,
      type: 'INDEPENDENT_MATCH_CONFIRMED',
      title: 'Solicitud aprobada',
      body: `Te has unido al partido "${request.match.name}".`,
      metadata: { matchId: request.independentMatchId },
    }).catch(() => undefined);
  },

  async rejectJoinRequest(requestId: string, organizerId: string): Promise<void> {
    const request = await prisma.independentMatchJoinRequest.findUnique({
      where: { id: requestId },
      include: { match: { select: { organizerId: true } } },
    });
    if (!request) throw new NotFoundError('REQUEST_NOT_FOUND', 'Solicitud no encontrada.');
    if (request.match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede rechazar solicitudes.');
    if (request.status !== 'PENDING')
      throw new DomainError('REQUEST_NOT_PENDING', 'Esta solicitud ya fue procesada.');

    await prisma.independentMatchJoinRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', respondedByUserId: organizerId, respondedAt: new Date() },
    });
  },
} as const;
