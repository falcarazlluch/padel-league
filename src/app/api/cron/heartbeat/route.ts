import { timingSafeEqual, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/shared/config/env';
import { queue } from '@/shared/queue/client';
import { logger } from '@/shared/logger';
import { prisma } from '@/shared/db/client';
import { LeagueNotificationService } from '@/modules/leagues';
import { runPushOutboxTick } from '@/modules/push';
import { drainPendingJobs } from '@/worker/drainer';

// Cron has up to 60s on Vercel Hobby and 800s on Pro; cap at 60s for safety.
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
}

async function runHeartbeat(req: Request): Promise<Response> {
  // Trim defensively: paste-into-Vercel-UI sometimes adds trailing newlines.
  const expectedSecret = env().CRON_SECRET.trim();
  const expectedBearer = `Bearer ${expectedSecret}`;

  // Accept either an Authorization: Bearer <secret> header OR a `?key=<secret>`
  // query param. The header is preferred, but some intermediaries strip it
  // (cross-host redirects, certain CDN configs), so the query param is a
  // robust fallback. Both compares use timing-safe equality.
  const auth = (req.headers.get('authorization') ?? '').trim();
  const url = new URL(req.url);
  const queryKey = (url.searchParams.get('key') ?? '').trim();

  let valid = false;
  let usedSource: 'header' | 'query' | 'none' = 'none';
  if (auth.length > 0) {
    const a = Buffer.from(auth, 'utf8');
    const e = Buffer.from(expectedBearer, 'utf8');
    if (a.length === e.length && timingSafeEqual(a, e)) {
      valid = true;
      usedSource = 'header';
    }
  }
  if (!valid && queryKey.length > 0) {
    const a = Buffer.from(queryKey, 'utf8');
    const e = Buffer.from(expectedSecret, 'utf8');
    if (a.length === e.length && timingSafeEqual(a, e)) {
      valid = true;
      usedSource = 'query';
    }
  }

  if (!valid) {
    const authHash = createHash('sha256').update(auth).digest('hex').slice(0, 12);
    const expectedHash = createHash('sha256').update(expectedBearer).digest('hex').slice(0, 12);
    logger().warn(
      {
        authLen: auth.length,
        expectedLen: expectedBearer.length,
        authHash,
        expectedHash,
        hasHeader: auth.length > 0,
        hasQueryKey: queryKey.length > 0,
      },
      'cron.heartbeat.unauthorized',
    );
    return unauthorized();
  }
  logger().info({ usedSource }, 'cron.heartbeat.authorized');

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

  // Notify level-matching users when a league enters its registration window.
  // Idempotent: LeagueNotificationService gates on registrationOpenNotifiedAt.
  const notifiedLeagueIds: string[] = [];
  try {
    const dueLeagues = await prisma.league.findMany({
      where: {
        registrationStart: { lte: new Date() },
        registrationOpenNotifiedAt: null,
      },
      select: { id: true },
    });
    for (const l of dueLeagues) {
      const { recipients } = await LeagueNotificationService.notifyRegistrationOpen(l.id);
      notifiedLeagueIds.push(l.id);
      log.info({ leagueId: l.id, recipients }, 'cron.league-registration-open.notified');
    }
  } catch (err) {
    log.warn({ err }, 'cron.league-registration-open.error');
  }

  // Web Push outbox: enqueue `send-push` jobs for any fresh notifications.
  // Done BEFORE the drain so the same heartbeat can both enqueue and deliver.
  let pushOutboxStats: Awaited<ReturnType<typeof runPushOutboxTick>> | null = null;
  try {
    pushOutboxStats = await runPushOutboxTick();
    if (pushOutboxStats.enqueued > 0 || pushOutboxStats.skipped > 0) {
      log.info({ ...pushOutboxStats }, 'cron.push-outbox.done');
    }
  } catch (err) {
    log.warn({ err }, 'cron.push-outbox.error');
  }

  // Drain queued jobs synchronously. Vercel does not run a long-lived worker,
  // so this cron is the only consumer for pg-boss. Budget 50s of work, leaving
  // ~10s headroom for the rest of the response under maxDuration=60.
  let drainStats: Awaited<ReturnType<typeof drainPendingJobs>> | null = null;
  try {
    drainStats = await drainPendingJobs(q.raw(), { deadlineMs: 50_000 });
  } catch (err) {
    log.error({ err }, 'cron.drain.error');
  }

  return NextResponse.json({
    ok: true,
    jobId: noopId,
    leaguesToFinalize: finalizeIds.length,
    registrationOpenNotified: notifiedLeagueIds.length,
    pushOutbox: pushOutboxStats,
    drain: drainStats,
  });
}

// Vercel Cron sends GET by default; we expose both verbs so manual curl
// (POST with Bearer) and the platform invocation work the same way.
export async function GET(req: Request): Promise<Response> {
  return runHeartbeat(req);
}

export async function POST(req: Request): Promise<Response> {
  return runHeartbeat(req);
}
