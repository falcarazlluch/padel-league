import { prisma } from '@/shared/db/client';
import { NotFoundError, AuthorizationError, DomainError } from '@/shared/errors';
import { queue } from '@/shared/queue/client';
import { logger } from '@/shared/logger';
import { assertTwoTeamMatch, assertMatchTeamIds } from '@/shared/match-guards';
import { determineWinner, getSubmitterSide, resolveSubmitterSide } from './match-result-logic';
import type { SubmitResultInput, MatchDetailRow } from '../domain/types';
import type { DisputeResolution } from '@prisma/client';

const SUBMITTABLE_STATUSES = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'] as const;
type SubmittableStatus = (typeof SUBMITTABLE_STATUSES)[number];

export const MatchService = {
  async getMatch(matchId: string): Promise<MatchDetailRow> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        league: { select: { id: true, slug: true } },
        teamA: { include: { members: { include: { user: { select: { name: true } } } } } },
        teamB: { include: { members: { include: { user: { select: { name: true } } } } } },
        schedulingProposals: {
          where: { status: 'PROPOSED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        results: {
          where: { status: 'PENDING' },
          include: { sets: { orderBy: { setNumber: 'asc' } } },
          take: 1,
        },
        confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    // El getMatch (vista detalle clásica) está pensado para enfrentamientos de
    // dos equipos. Para Americana ROTATING_INDIVIDUAL hay un fetch específico
    // que se añadirá en su sub-fase con la vista de rondas.
    assertTwoTeamMatch(match);
    assertMatchTeamIds(match);

    const pendingResult = match.results[0] ?? null;
    const submitterSide = pendingResult
      ? resolveSubmitterSide(
          pendingResult,
          match,
          match.teamA.members.map((m) => m.userId),
          match.teamB.members.map((m) => m.userId),
        )
      : null;

    return {
      id: match.id,
      leagueId: match.leagueId,
      leagueSlug: match.league.slug,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      teamA: {
        id: match.teamA.id,
        name: match.teamA.name,
        members: match.teamA.members.map((m) => ({
          userId: m.userId,
          user: { name: m.user.name },
        })),
      },
      teamB: {
        id: match.teamB.id,
        name: match.teamB.name,
        members: match.teamB.members.map((m) => ({
          userId: m.userId,
          user: { name: m.user.name },
        })),
      },
      status: match.status,
      scheduledAt: match.scheduledAt,
      deadlineAt: match.deadlineAt,
      round: match.round,
      activeProposal: match.schedulingProposals[0]
        ? {
            id: match.schedulingProposals[0].id,
            proposedByUserId: match.schedulingProposals[0].proposedByUserId,
            proposedDate: match.schedulingProposals[0].proposedDate,
          }
        : null,
      pendingResult: pendingResult
        ? {
            id: pendingResult.id,
            submittedByUserId: pendingResult.submittedByUserId,
            submitterSide,
            sets: pendingResult.sets,
            winnerTeamId: pendingResult.winnerTeamId,
          }
        : null,
      confirmedResult: match.confirmedResult
        ? {
            sets: match.confirmedResult.sets,
            winnerTeamId: match.confirmedResult.winnerTeamId,
          }
        : null,
    };
  },

  async submitResult(
    matchId: string,
    submittingUserId: string,
    input: SubmitResultInput,
  ): Promise<void> {
    if (input.sets.length < 2)
      throw new DomainError('INVALID_SETS', 'Debe registrar al menos 2 sets.');
    if (input.sets.length > 5)
      throw new DomainError('INVALID_SETS', 'No puede registrar más de 5 sets.');

    if (input.sets.some((s) => !Number.isInteger(s.gamesA) || s.gamesA < 0 || !Number.isInteger(s.gamesB) || s.gamesB < 0))
      throw new DomainError('INVALID_SETS', 'Los juegos deben ser enteros no negativos.');

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: true } },
        teamB: { include: { members: true } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    assertTwoTeamMatch(match);
    assertMatchTeamIds(match);
    if (!SUBMITTABLE_STATUSES.includes(match.status as SubmittableStatus)) {
      throw new DomainError(
        'MATCH_NOT_SUBMITTABLE',
        'Este partido no admite resultados en su estado actual.',
      );
    }

    const side = getSubmitterSide(
      submittingUserId,
      match.teamA.members.map((m) => m.userId),
      match.teamB.members.map((m) => m.userId),
    );
    if (!side)
      throw new AuthorizationError(
        'NOT_TEAM_MEMBER',
        'Solo los jugadores de este partido pueden enviar resultados.',
      );

    const winnerTeamId = determineWinner(match.teamAId, match.teamBId, input.sets);

    const submitterTeamId = side === 'A' ? match.teamAId : match.teamBId;

    const newResult = await prisma.$transaction(async (tx) => {
      await tx.matchResult.updateMany({
        where: { matchId, status: 'PENDING' },
        data: { status: 'SUPERSEDED' },
      });

      const created = await tx.matchResult.create({
        data: {
          matchId,
          submittedByUserId: submittingUserId,
          submitterTeamId,
          winnerTeamId,
          sets: {
            create: input.sets.map((s, i) => ({
              setNumber: i + 1,
              gamesA: s.gamesA,
              gamesB: s.gamesB,
            })),
          },
        },
      });

      await tx.match.update({
        where: { id: matchId },
        data: { status: 'PENDING_VALIDATION' },
      });

      return created;
    });

    // Enqueue auto-approve job: fires in 7 days if rival doesn't confirm
    const startAfter = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const q = queue();
    await q.start();
    await q.publish(
      'match-auto-approve-result',
      { matchResultId: newResult.id },
      { startAfter, singletonKey: `auto-approve-${newResult.id}` },
    );
  },

  async confirmResult(matchId: string, confirmingUserId: string): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: true } },
        teamB: { include: { members: true } },
        results: { where: { status: 'PENDING' }, take: 1 },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    assertTwoTeamMatch(match);
    assertMatchTeamIds(match);
    if (match.status !== 'PENDING_VALIDATION')
      throw new DomainError(
        'MATCH_NOT_PENDING',
        'Este partido no tiene un resultado pendiente de validación.',
      );

    const pendingResult = match.results[0];
    if (!pendingResult)
      throw new DomainError('NO_PENDING_RESULT', 'No hay resultado pendiente.');

    const teamAIds = match.teamA.members.map((m) => m.userId);
    const teamBIds = match.teamB.members.map((m) => m.userId);
    const submitterSide = resolveSubmitterSide(pendingResult, match, teamAIds, teamBIds);
    const confirmerSide = getSubmitterSide(confirmingUserId, teamAIds, teamBIds);

    if (!confirmerSide)
      throw new AuthorizationError(
        'NOT_TEAM_MEMBER',
        'Solo los jugadores de este partido pueden confirmar resultados.',
      );
    // submitterSide can only be null on legacy rows (pre-snapshot column)
    // whose submitter has since left both rosters. In that degenerate case
    // we accept confirmation from either team — without this fallback the
    // match would deadlock until the T+7d auto-approve job fires. The UI
    // surfaces an explicit warning before letting either side act.
    if (submitterSide !== null && confirmerSide === submitterSide)
      throw new DomainError(
        'SAME_TEAM_CONFIRM',
        'No puedes confirmar el resultado enviado por tu propio equipo.',
      );

    await prisma.$transaction(async (tx) => {
      const updated = await tx.matchResult.updateMany({
        where: { id: pendingResult.id, status: 'PENDING' },
        data: {
          status: 'CONFIRMED',
          validatedByUserId: confirmingUserId,
          validatedAt: new Date(),
        },
      });
      if (updated.count === 0)
        throw new DomainError('RESULT_ALREADY_PROCESSED', 'El resultado ya fue procesado por otra operación concurrente.');

      await tx.match.update({
        where: { id: matchId },
        data: {
          status: 'CONFIRMED',
          confirmedResultId: pendingResult.id,
          winnerTeamId: pendingResult.winnerTeamId,
        },
      });
    });

    // Fire-and-forget: enqueue commentary recap generation.
    void queue()
      .start()
      .then(() => queue().publish('generate-match-commentary', { matchId, type: 'RECAP' }))
      .catch((err) => logger().warn({ err, matchId }, 'commentary.enqueue.failed'));

    // NOTE: The match-auto-approve-result job (singletonKey auto-approve-{resultId}) is not cancelled here.
    // It will execute at T+7d but the handler's PENDING guard will safely no-op. A full fix
    // requires storing the job ID on MatchResult (schema change tracked as future work).
  },

  async disputeResult(
    matchId: string,
    disputingUserId: string,
    reason: string,
  ): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: true } },
        teamB: { include: { members: true } },
        results: {
          where: { status: 'PENDING' },
          include: { sets: true },
          take: 1,
        },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    assertTwoTeamMatch(match);
    assertMatchTeamIds(match);
    if (match.status !== 'PENDING_VALIDATION')
      throw new DomainError(
        'MATCH_NOT_PENDING',
        'Este partido no tiene un resultado pendiente de validación.',
      );

    const pendingResult = match.results[0];
    if (!pendingResult)
      throw new DomainError('NO_PENDING_RESULT', 'No hay resultado pendiente.');

    const teamAIds = match.teamA.members.map((m) => m.userId);
    const teamBIds = match.teamB.members.map((m) => m.userId);
    const submitterSide = resolveSubmitterSide(pendingResult, match, teamAIds, teamBIds);
    const disputerSide = getSubmitterSide(disputingUserId, teamAIds, teamBIds);

    if (!disputerSide)
      throw new AuthorizationError(
        'NOT_TEAM_MEMBER',
        'Solo los jugadores de este partido pueden disputar resultados.',
      );
    // See note in confirmResult: when submitterSide is null we accept either
    // team to dispute, mirroring the same anti-deadlock fallback.
    if (submitterSide !== null && disputerSide === submitterSide)
      throw new DomainError(
        'SAME_TEAM_DISPUTE',
        'No puedes disputar el resultado enviado por tu propio equipo.',
      );

    await prisma.$transaction(async (tx) => {
      const updated = await tx.matchResult.updateMany({
        where: { id: pendingResult.id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          rejectedAt: new Date(),
        },
      });
      if (updated.count === 0)
        throw new DomainError('RESULT_ALREADY_PROCESSED', 'El resultado ya fue procesado por otra operación concurrente.');

      await tx.match.update({
        where: { id: matchId },
        data: { status: 'DISPUTED' },
      });

      await tx.dispute.create({
        data: {
          matchId,
          openedByUserId: disputingUserId,
          reason,
          evidenceSnapshot: {
            submittedByUserId: pendingResult.submittedByUserId,
            winnerTeamId: pendingResult.winnerTeamId,
            sets: pendingResult.sets.map((s) => ({
              setNumber: s.setNumber,
              gamesA: s.gamesA,
              gamesB: s.gamesB,
            })),
          },
        },
      });
    });
    // NOTE: The match-auto-approve-result job (singletonKey auto-approve-{resultId}) is not cancelled here.
    // It will execute at T+7d but the handler's PENDING guard will safely no-op. A full fix
    // requires storing the job ID on MatchResult (schema change tracked as future work).
  },

  async resolveDispute(
    disputeId: string,
    adminUserId: string,
    resolution: DisputeResolution,
    adminNote?: string,
    newDeadlineAt?: Date,
  ): Promise<void> {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        match: {
          include: {
            teamA: { include: { members: true } },
            teamB: { include: { members: true } },
          },
        },
      },
    });

    if (!dispute) throw new NotFoundError('DISPUTE_NOT_FOUND', 'Disputa no encontrada.');
    if (dispute.status === 'RESOLVED')
      throw new DomainError('DISPUTE_ALREADY_RESOLVED', 'Esta disputa ya fue resuelta.');

    const match = dispute.match;
    assertTwoTeamMatch(match);
    assertMatchTeamIds(match);

    // Determine proponent's team (team of the user who opened the dispute)
    const teamAIds = match.teamA.members.map((m) => m.userId);
    const proponentSide = getSubmitterSide(dispute.openedByUserId, teamAIds, match.teamB.members.map((m) => m.userId));
    if (!proponentSide) {
      throw new DomainError('DISPUTE_OPENER_NOT_FOUND', 'No se puede determinar el equipo del denunciante.');
    }
    const proponentTeamId = proponentSide === 'A' ? match.teamAId : match.teamBId;
    const opponentTeamId = proponentSide === 'A' ? match.teamBId : match.teamAId;

    await prisma.$transaction(async (tx) => {
      // Resolve the dispute record
      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'RESOLVED',
          resolution,
          adminNote: adminNote ?? null,
          newDeadlineAt: resolution === 'EXTEND_DEADLINE' ? newDeadlineAt : null,
          resolvedByUserId: adminUserId,
          resolvedAt: new Date(),
        },
      });

      // Find the disputed result to preserve set data in standings
      const rejectedResult = await tx.matchResult.findFirst({
        where: { matchId: match.id, status: 'REJECTED' },
        orderBy: { submittedAt: 'desc' },
      });

      // Update the match based on resolution
      if (resolution === 'AWARD_PROPONENT') {
        await tx.match.update({
          where: { id: match.id },
          data: { status: 'ADMIN_RESOLVED', winnerTeamId: proponentTeamId, confirmedResultId: rejectedResult?.id ?? null },
        });
      } else if (resolution === 'AWARD_OPPONENT') {
        await tx.match.update({
          where: { id: match.id },
          data: { status: 'ADMIN_RESOLVED', winnerTeamId: opponentTeamId, confirmedResultId: rejectedResult?.id ?? null },
        });
      } else if (resolution === 'BOTH_LOST') {
        await tx.match.update({
          where: { id: match.id },
          data: { status: 'EXPIRED_UNPLAYED', winnerTeamId: null },
        });
      } else if (resolution === 'EXTEND_DEADLINE') {
        if (!newDeadlineAt) throw new DomainError('MISSING_DEADLINE', 'Se requiere nueva fecha límite para extender.');
        await tx.match.update({
          where: { id: match.id },
          data: { status: 'SCHEDULED', deadlineAt: newDeadlineAt },
        });
      } else {
        // DISMISS: close dispute, treat as draw (winnerTeamId = null)
        await tx.match.update({
          where: { id: match.id },
          data: { status: 'ADMIN_RESOLVED', winnerTeamId: null, confirmedResultId: rejectedResult?.id ?? null },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: adminUserId,
          action: 'dispute.resolved',
          targetType: 'Dispute',
          targetId: disputeId,
          metadata: { resolution, matchId: match.id, adminNote: adminNote ?? null },
        },
      });
    });

    // Fire-and-forget: enqueue commentary recap generation for ADMIN_RESOLVED outcomes.
    if (resolution === 'AWARD_PROPONENT' || resolution === 'AWARD_OPPONENT' || resolution === 'DISMISS') {
      const updatedMatch = await prisma.match.findUnique({
        where: { id: match.id },
        select: { confirmedResultId: true },
      });
      if (updatedMatch?.confirmedResultId) {
        void queue()
          .start()
          .then(() => queue().publish('generate-match-commentary', { matchId: match.id, type: 'RECAP' }))
          .catch((err) => logger().warn({ err, matchId: match.id }, 'commentary.enqueue.failed'));
      }
    }
  },
} as const;
