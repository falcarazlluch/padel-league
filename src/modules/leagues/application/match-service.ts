import { prisma } from '@/shared/db/client';
import { NotFoundError, AuthorizationError, DomainError } from '@/shared/errors';
import { determineWinner, getSubmitterSide } from './match-result-logic';
import type { SubmitResultInput, MatchDetailRow } from '../domain/types';

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
        results: {
          where: { status: 'PENDING' },
          include: { sets: { orderBy: { setNumber: 'asc' } } },
          take: 1,
        },
        confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');

    const pendingResult = match.results[0] ?? null;
    const submitterSide = pendingResult
      ? (getSubmitterSide(
          pendingResult.submittedByUserId,
          match.teamA.members.map((m) => m.userId),
          match.teamB.members.map((m) => m.userId),
        ) ?? 'A')
      : 'A';

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

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: true } },
        teamB: { include: { members: true } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
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

    await prisma.$transaction(async (tx) => {
      await tx.matchResult.updateMany({
        where: { matchId, status: 'PENDING' },
        data: { status: 'SUPERSEDED' },
      });

      await tx.matchResult.create({
        data: {
          matchId,
          submittedByUserId: submittingUserId,
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
    });
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
    const submitterSide = getSubmitterSide(pendingResult.submittedByUserId, teamAIds, teamBIds);
    const confirmerSide = getSubmitterSide(confirmingUserId, teamAIds, teamBIds);

    if (!confirmerSide)
      throw new AuthorizationError(
        'NOT_TEAM_MEMBER',
        'Solo los jugadores de este partido pueden confirmar resultados.',
      );
    if (confirmerSide === submitterSide)
      throw new DomainError(
        'SAME_TEAM_CONFIRM',
        'No puedes confirmar el resultado enviado por tu propio equipo.',
      );

    await prisma.$transaction(async (tx) => {
      await tx.matchResult.update({
        where: { id: pendingResult.id },
        data: {
          status: 'CONFIRMED',
          validatedByUserId: confirmingUserId,
          validatedAt: new Date(),
        },
      });

      await tx.match.update({
        where: { id: matchId },
        data: {
          status: 'CONFIRMED',
          confirmedResultId: pendingResult.id,
          winnerTeamId: pendingResult.winnerTeamId,
        },
      });
    });
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
    const submitterSide = getSubmitterSide(pendingResult.submittedByUserId, teamAIds, teamBIds);
    const disputerSide = getSubmitterSide(disputingUserId, teamAIds, teamBIds);

    if (!disputerSide)
      throw new AuthorizationError(
        'NOT_TEAM_MEMBER',
        'Solo los jugadores de este partido pueden disputar resultados.',
      );
    if (disputerSide === submitterSide)
      throw new DomainError(
        'SAME_TEAM_DISPUTE',
        'No puedes disputar el resultado enviado por tu propio equipo.',
      );

    await prisma.$transaction(async (tx) => {
      await tx.matchResult.update({
        where: { id: pendingResult.id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          rejectedAt: new Date(),
        },
      });

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
  },
} as const;
