import { prisma } from '@/shared/db/client';
import { NotFoundError, AuthorizationError, DomainError } from '@/shared/errors';
import { NotificationService } from '@/modules/notifications';
import { queue } from '@/shared/queue/client';
import { logger } from '@/shared/logger';
import { assertTwoTeamMatch } from '@/shared/match-guards';

const NON_EXTENDABLE_STATUSES = [
  'EXPIRED_UNPLAYED',
  'CONFIRMED',
  'ADMIN_RESOLVED',
  'CANCELLED',
  'PENDING_VALIDATION',
  'DISPUTED',
] as const;

export const SchedulingService = {
  async proposeDate(matchId: string, proposingUserId: string, proposedAt: Date): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: { select: { userId: true } } } },
        teamB: { include: { members: { select: { userId: true } } } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    assertTwoTeamMatch(match);

    const teamAIds = match.teamA.members.map((m) => m.userId);
    const teamBIds = match.teamB.members.map((m) => m.userId);
    const isTeamMember = teamAIds.includes(proposingUserId) || teamBIds.includes(proposingUserId);
    if (!isTeamMember) throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro de este partido.');

    const proposableStatuses = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'];
    if (!proposableStatuses.includes(match.status))
      throw new DomainError('MATCH_NOT_SCHEDULABLE', 'Este partido no admite propuestas de fecha.');

    if (proposedAt <= new Date())
      throw new DomainError('DATE_IN_PAST', 'La fecha propuesta debe ser futura.');

    await prisma.$transaction(async (tx) => {
      // Supersede any existing active proposal (libre flow)
      await tx.matchSchedulingProposal.updateMany({
        where: { matchId, status: 'PROPOSED' },
        data: { status: 'SUPERSEDED' },
      });
      await tx.matchSchedulingProposal.create({
        data: { matchId, proposedByUserId: proposingUserId, proposedDate: proposedAt },
      });
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'DATE_PROPOSED', scheduledAt: proposedAt },
      });
    });

    // Notify rival team members (fire-and-forget, non-fatal)
    const isProposerTeamA = teamAIds.includes(proposingUserId);
    const rivalIds = isProposerTeamA ? teamBIds : teamAIds;
    const proposerTeamName = isProposerTeamA ? match.teamA.name : match.teamB.name;
    const dateStr = proposedAt.toLocaleDateString('es-ES', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

    NotificationService.createMany(
      rivalIds.map((userId) => ({
        userId,
        type: 'DATE_PROPOSED' as const,
        title: 'Nueva propuesta de fecha',
        body: `${proposerTeamName} propone jugar el ${dateStr}`,
        metadata: { matchId },
      })),
      { excludeActorId: proposingUserId, scope: { matchId } },
    ).catch(() => undefined);
  },

  async acceptProposal(matchId: string, acceptingUserId: string): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: { select: { userId: true } } } },
        teamB: { include: { members: { select: { userId: true } } } },
        schedulingProposals: {
          where: { status: 'PROPOSED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    assertTwoTeamMatch(match);
    if (match.status !== 'DATE_PROPOSED')
      throw new DomainError('NO_ACTIVE_PROPOSAL', 'No hay propuesta activa para este partido.');

    const teamAIds = match.teamA.members.map((m) => m.userId);
    const teamBIds = match.teamB.members.map((m) => m.userId);
    const isTeamMember = teamAIds.includes(acceptingUserId) || teamBIds.includes(acceptingUserId);
    if (!isTeamMember) throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro de este partido.');

    const proposal = match.schedulingProposals[0];
    if (!proposal) throw new DomainError('NO_ACTIVE_PROPOSAL', 'No hay propuesta activa.');

    // Acceptor must be from the rival team (not the proposer's team)
    const proposerOnTeamA = teamAIds.includes(proposal.proposedByUserId);
    const acceptorOnTeamA = teamAIds.includes(acceptingUserId);
    if (proposerOnTeamA === acceptorOnTeamA)
      throw new DomainError('CANNOT_ACCEPT_OWN_PROPOSAL', 'No puedes aceptar tu propia propuesta.');

    await prisma.$transaction(async (tx) => {
      const updated = await tx.matchSchedulingProposal.updateMany({
        where: { id: proposal.id, status: 'PROPOSED' },
        data: { status: 'ACCEPTED', respondedByUserId: acceptingUserId, respondedAt: new Date() },
      });
      if (updated.count === 0)
        throw new DomainError('PROPOSAL_ALREADY_PROCESSED', 'La propuesta ya fue procesada.');
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'DATE_CONFIRMED', scheduledAt: proposal.proposedDate },
      });
    });

    // Fire-and-forget: enqueue commentary preview generation.
    void queue()
      .start()
      .then(() => queue().publish('generate-match-commentary', { matchId, type: 'PREVIEW' }))
      .catch((err) => logger().warn({ err, matchId }, 'commentary.enqueue.failed'));

    // Notify the proposing team
    const proposerIds = proposerOnTeamA ? teamAIds : teamBIds;
    const acceptorTeamName = acceptorOnTeamA ? match.teamA.name : match.teamB.name;
    const dateStr = proposal.proposedDate.toLocaleDateString('es-ES', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

    NotificationService.createMany(
      proposerIds.map((userId) => ({
        userId,
        type: 'DATE_ACCEPTED' as const,
        title: 'Fecha confirmada',
        body: `${acceptorTeamName} ha aceptado jugar el ${dateStr}`,
        metadata: { matchId },
      })),
      { excludeActorId: acceptingUserId, scope: { matchId } },
    ).catch(() => undefined);
  },

  async cancelProposal(matchId: string, cancelingUserId: string): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: { select: { userId: true } } } },
        teamB: { include: { members: { select: { userId: true } } } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    assertTwoTeamMatch(match);

    const teamAIds = match.teamA.members.map((m) => m.userId);
    const teamBIds = match.teamB.members.map((m) => m.userId);
    const isTeamMember = teamAIds.includes(cancelingUserId) || teamBIds.includes(cancelingUserId);
    if (!isTeamMember) throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro de este partido.');

    const cancellableStatuses = ['DATE_PROPOSED', 'DATE_CONFIRMED'] as const;
    if (!(cancellableStatuses as readonly string[]).includes(match.status))
      throw new DomainError('MATCH_NOT_CANCELLABLE', 'Este partido no tiene propuesta activa que cancelar.');

    await prisma.$transaction(async (tx) => {
      await tx.matchSchedulingProposal.updateMany({
        where: { matchId, status: 'PROPOSED' },
        data: { status: 'SUPERSEDED' },
      });
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'SCHEDULED', scheduledAt: null },
      });
    });
  },

  async proposeDeadlineExtension(
    matchId: string,
    userId: string,
    newDeadlineAt: Date,
  ): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        league: { select: { endDate: true } },
        teamA: { select: { members: { select: { userId: true } } } },
        teamB: { select: { members: { select: { userId: true } } } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    assertTwoTeamMatch(match);

    const teamAIds = match.teamA.members.map((m) => m.userId);
    const teamBIds = match.teamB.members.map((m) => m.userId);
    if (!teamAIds.includes(userId) && !teamBIds.includes(userId)) {
      throw new AuthorizationError('NOT_TEAM_MEMBER', 'Solo los miembros del partido pueden proponer extensión.');
    }

    if ((NON_EXTENDABLE_STATUSES as readonly string[]).includes(match.status)) {
      throw new DomainError('MATCH_NOT_EXTENDABLE', 'Este partido ya no admite extensiones de plazo.');
    }

    if (newDeadlineAt.getTime() <= match.deadlineAt.getTime()) {
      throw new DomainError('DEADLINE_NOT_LATER', 'La nueva fecha debe ser posterior al deadline actual.');
    }

    if (newDeadlineAt.getTime() <= Date.now()) {
      throw new DomainError('DEADLINE_IN_PAST', 'La nueva fecha debe ser futura.');
    }

    if (newDeadlineAt.getTime() >= match.league.endDate.getTime()) {
      throw new DomainError('DEADLINE_AFTER_LEAGUE_END', 'La nueva fecha debe ser anterior al fin de la liga.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.deadlineExtensionProposal.updateMany({
        where: { matchId, status: 'PROPOSED' },
        data: { status: 'SUPERSEDED' },
      });
      await tx.deadlineExtensionProposal.create({
        data: { matchId, proposedByUserId: userId, proposedDeadlineAt: newDeadlineAt },
      });
    });

    // Notify rival team (fire-and-forget)
    const proposerOnA = teamAIds.includes(userId);
    const rivalIds = proposerOnA ? teamBIds : teamAIds;
    if (rivalIds.length > 0) {
      NotificationService.createMany(
        rivalIds.map((uid) => ({
          userId: uid,
          type: 'EXTENSION_PROPOSED' as const,
          title: 'Propuesta de extensión de plazo',
          body: `Te proponen extender el plazo de un partido hasta el ${newDeadlineAt.toLocaleDateString('es-ES')}.`,
          metadata: { matchId },
        })),
        { excludeActorId: userId, scope: { matchId } },
      ).catch(() => undefined);
    }
  },

  async acceptDeadlineExtension(proposalId: string, userId: string): Promise<void> {
    const proposal = await prisma.deadlineExtensionProposal.findUnique({
      where: { id: proposalId },
      include: {
        match: {
          include: {
            teamA: { select: { members: { select: { userId: true } } } },
            teamB: { select: { members: { select: { userId: true } } } },
          },
        },
      },
    });
    if (!proposal) throw new NotFoundError('PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');
    if (proposal.status !== 'PROPOSED') {
      throw new DomainError('PROPOSAL_NOT_PROPOSED', 'Esta propuesta ya fue procesada.');
    }
    assertTwoTeamMatch(proposal.match);

    const teamAIds = proposal.match.teamA.members.map((m) => m.userId);
    const teamBIds = proposal.match.teamB.members.map((m) => m.userId);
    if (!teamAIds.includes(userId) && !teamBIds.includes(userId)) {
      throw new AuthorizationError('NOT_TEAM_MEMBER', 'Solo los miembros del partido pueden responder.');
    }

    const proposerOnA = teamAIds.includes(proposal.proposedByUserId);
    const userOnA = teamAIds.includes(userId);
    if (proposerOnA === userOnA) {
      throw new AuthorizationError('SAME_TEAM', 'No puedes aceptar tu propia propuesta.');
    }

    if ((NON_EXTENDABLE_STATUSES as readonly string[]).includes(proposal.match.status)) {
      throw new DomainError('MATCH_NOT_EXTENDABLE', 'Este partido ya no admite extensiones.');
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.deadlineExtensionProposal.updateMany({
        where: { id: proposalId, status: 'PROPOSED' },
        data: { status: 'ACCEPTED', respondedByUserId: userId, respondedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new DomainError('PROPOSAL_RACE', 'La propuesta fue procesada por otra operación.');
      }
      await tx.match.update({
        where: { id: proposal.matchId },
        data: { deadlineAt: proposal.proposedDeadlineAt },
      });
    });

    // Notify proposer (fire-and-forget)
    NotificationService.create(
      {
        userId: proposal.proposedByUserId,
        type: 'EXTENSION_ACCEPTED',
        title: 'Tu propuesta de extensión fue aceptada',
        body: `El nuevo plazo es el ${proposal.proposedDeadlineAt.toLocaleDateString('es-ES')}.`,
        metadata: { matchId: proposal.matchId },
      },
      { excludeActorId: userId, scope: { matchId: proposal.matchId } },
    ).catch(() => undefined);
  },

  async rejectDeadlineExtension(proposalId: string, userId: string): Promise<void> {
    const proposal = await prisma.deadlineExtensionProposal.findUnique({
      where: { id: proposalId },
      include: {
        match: {
          include: {
            teamA: { select: { members: { select: { userId: true } } } },
            teamB: { select: { members: { select: { userId: true } } } },
          },
        },
      },
    });
    if (!proposal) throw new NotFoundError('PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');
    if (proposal.status !== 'PROPOSED') {
      throw new DomainError('PROPOSAL_NOT_PROPOSED', 'Esta propuesta ya fue procesada.');
    }
    assertTwoTeamMatch(proposal.match);

    const teamAIds = proposal.match.teamA.members.map((m) => m.userId);
    const teamBIds = proposal.match.teamB.members.map((m) => m.userId);
    if (!teamAIds.includes(userId) && !teamBIds.includes(userId)) {
      throw new AuthorizationError('NOT_TEAM_MEMBER', 'Solo los miembros del partido pueden responder.');
    }

    const proposerOnA = teamAIds.includes(proposal.proposedByUserId);
    const userOnA = teamAIds.includes(userId);
    if (proposerOnA === userOnA) {
      throw new AuthorizationError('SAME_TEAM', 'No puedes rechazar tu propia propuesta.');
    }

    await prisma.deadlineExtensionProposal.update({
      where: { id: proposalId },
      data: { status: 'REJECTED', respondedByUserId: userId, respondedAt: new Date() },
    });

    NotificationService.create(
      {
        userId: proposal.proposedByUserId,
        type: 'EXTENSION_REJECTED',
        title: 'Tu propuesta de extensión fue rechazada',
        body: 'El equipo rival no ha aceptado la nueva fecha.',
        metadata: { matchId: proposal.matchId },
      },
      { excludeActorId: userId, scope: { matchId: proposal.matchId } },
    ).catch(() => undefined);
  },
} as const;
