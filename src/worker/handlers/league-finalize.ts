import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import type { JobMap } from '@/shared/queue/jobs';

const NON_FINAL_STATUSES = [
  'SCHEDULED',
  'DATE_PROPOSED',
  'DATE_CONFIRMED',
  'PENDING_VALIDATION',
  'DISPUTED',
] as const;

export async function leagueFinalizeHandler(data: JobMap['league-finalize']): Promise<void> {
  const { leagueId } = data;
  const log = logger();

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) {
    log.warn({ leagueId }, 'league-finalize.not-found');
    return;
  }
  if (league.status === 'FINISHED') {
    log.info({ leagueId }, 'league-finalize.already-finished');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const expired = await tx.match.updateMany({
      where: { leagueId, status: { in: [...NON_FINAL_STATUSES] } },
      data: { status: 'EXPIRED_UNPLAYED' },
    });

    await tx.league.update({
      where: { id: leagueId },
      data: { status: 'FINISHED', finalizedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorId: null,
        action: 'league.finalized',
        targetType: 'League',
        targetId: leagueId,
        metadata: { expiredMatchCount: expired.count },
      },
    });
  });

  log.info({ leagueId }, 'league-finalize.done');
}
