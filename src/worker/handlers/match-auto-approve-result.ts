import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import { queue } from '@/shared/queue/client';
import { env } from '@/shared/config/env';
import { NotificationService } from '@/modules/notifications';
import { formatSetScore } from '@/shared/format/match';
import { assertTwoTeamMatch } from '@/shared/match-guards';
import type { JobMap } from '@/shared/queue/jobs';

export async function matchAutoApproveResultHandler(
  data: JobMap['match-auto-approve-result'],
): Promise<void> {
  const { matchResultId } = data;
  const log = logger();

  const matchResult = await prisma.matchResult.findUnique({
    where: { id: matchResultId },
    include: {
      sets: { select: { setNumber: true, gamesA: true, gamesB: true } },
      match: {
        include: {
          league: { select: { slug: true } },
          teamA: { include: { members: { include: { user: { select: { email: true, name: true } } } } } },
          teamB: { include: { members: { include: { user: { select: { email: true, name: true } } } } } },
        },
      },
    },
  });

  if (!matchResult || matchResult.status !== 'PENDING') {
    log.info({ matchResultId }, 'auto-approve.skip');
    return;
  }

  let confirmed = false;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.matchResult.updateMany({
      where: { id: matchResultId, status: 'PENDING' },
      data: { status: 'CONFIRMED', autoApprovedAt: new Date() },
    });
    if (updated.count === 0) return;

    await tx.match.update({
      where: { id: matchResult.matchId },
      data: {
        status: 'CONFIRMED',
        confirmedResultId: matchResultId,
        winnerTeamId: matchResult.winnerTeamId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: null,
        action: 'match.result.auto_approved',
        targetType: 'Match',
        targetId: matchResult.matchId,
        metadata: { matchResultId, winnerTeamId: matchResult.winnerTeamId },
      },
    });

    confirmed = true;
  });

  if (!confirmed) {
    log.info({ matchResultId }, 'auto-approve.already-processed');
    return;
  }

  const match = matchResult.match;
  // El handler de auto-approve se encola solo para matches de Liga/Torneo/
  // Americana FIXED_PAIRS (los que pasan por submitResult clásico). Por tipos,
  // el match siempre tiene los dos equipos definidos.
  assertTwoTeamMatch(match);
  const allMembers = [
    ...match.teamA.members.map((m) => ({ userId: m.userId, email: m.user.email })),
    ...match.teamB.members.map((m) => ({ userId: m.userId, email: m.user.email })),
  ];

  const winnerTeamId = matchResult.winnerTeamId;
  const winnerTeamName = winnerTeamId
    ? winnerTeamId === match.teamAId
      ? match.teamA.name
      : match.teamB.name
    : null;

  const score = formatSetScore(matchResult.sets);
  const scoreFragment = score ? ` (${score})` : '';
  await NotificationService.createMany(
    allMembers.map(({ userId }) => ({
      userId,
      type: 'RESULT_CONFIRMED' as const,
      title: 'Resultado confirmado automáticamente',
      body: `Resultado confirmado automáticamente${scoreFragment}. ${winnerTeamName ? `Ganador: ${winnerTeamName}.` : 'Partido empatado.'}`,
      metadata: { matchId: match.id, autoApproved: true },
    })),
  );

  const matchUrl = `${env().APP_URL}/ligas/${match.league.slug}/partidos/${match.id}`;
  const q = queue();
  await q.start();
  for (const member of allMembers) {
    await q.publish('send-email', {
      template: 'result-confirmed',
      to: member.email,
      data: {
        matchTeamA: match.teamA.name,
        matchTeamB: match.teamB.name,
        winnerTeamName,
        matchUrl,
      },
      dedupKey: `auto-approved-${match.id}-${member.userId}`,
    });
  }

  await q.publish('generate-match-commentary', { matchId: match.id, type: 'RECAP' });

  log.info({ matchResultId, matchId: match.id }, 'auto-approve.done');
}
