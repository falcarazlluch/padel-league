import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import { queue } from '@/shared/queue/client';
import { env } from '@/shared/config/env';
import { NotificationService } from '@/modules/notifications';
import type { JobMap } from '@/shared/queue/jobs';

export async function matchAutoApproveResultHandler(
  data: JobMap['match-auto-approve-result'],
): Promise<void> {
  const { matchResultId } = data;
  const log = logger();

  const matchResult = await prisma.matchResult.findUnique({
    where: { id: matchResultId },
    include: {
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

  await NotificationService.createMany(
    allMembers.map(({ userId }) => ({
      userId,
      type: 'RESULT_CONFIRMED' as const,
      title: 'Resultado confirmado automáticamente',
      body: `El resultado del partido ha sido confirmado automáticamente por el sistema. ${winnerTeamName ? `Ganador: ${winnerTeamName}.` : 'Partido empatado.'}`,
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

  log.info({ matchResultId, matchId: match.id }, 'auto-approve.done');
}
