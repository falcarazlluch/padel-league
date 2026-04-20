import { prisma } from '@/shared/db/client';
import { NotFoundError, AuthorizationError, DomainError } from '@/shared/errors';
import { NotificationService } from '@/modules/notifications/application/notification-service';

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
} as const;
