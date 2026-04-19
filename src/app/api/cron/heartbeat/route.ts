import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/shared/config/env';
import { queue } from '@/shared/queue/client';
import { logger } from '@/shared/logger';
import { prisma } from '@/shared/db/client';

function unauthorized() {
  return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
}

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env().CRON_SECRET}`;
  const authBuf = Buffer.from(auth, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const valid =
    authBuf.length === expectedBuf.length && timingSafeEqual(authBuf, expectedBuf);
  if (!valid) {
    return unauthorized();
  }

  const q = queue();
  await q.start();
  const log = logger();

  const noopId = await q.publish('noop', { ping: `heartbeat-${Date.now()}` });
  log.info({ jobId: noopId }, 'cron.heartbeat.enqueued');

  // Finalize leagues whose endDate has passed — isolated so a DB error never fails the heartbeat
  const finalizeIds: string[] = [];
  try {
    const leaguesToFinalize = await prisma.league.findMany({
      where: { endDate: { lte: new Date() }, status: 'ACTIVE' },
      select: { id: true },
    });

    for (const league of leaguesToFinalize) {
      const jobId = await q.publish(
        'league-finalize',
        { leagueId: league.id },
        { singletonKey: `league-finalize-${league.id}` },
      );
      if (jobId) finalizeIds.push(league.id);
    }

    if (finalizeIds.length > 0) {
      log.info({ count: finalizeIds.length, leagueIds: finalizeIds }, 'cron.league-finalize.enqueued');
    }
  } catch (err) {
    log.warn({ err }, 'cron.league-finalize.error');
  }

  return NextResponse.json({ ok: true, jobId: noopId, leaguesToFinalize: finalizeIds.length });
}
