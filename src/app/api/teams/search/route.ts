import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { TeamSearchService } from '@/modules/teams';
import { logger } from '@/shared/logger';

const querySchema = z.object({
  q: z.string().trim().min(1).max(60),
  matchId: z.string().cuid(),
});

export async function GET(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getValidatedSession(sessionToken).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q'),
    matchId: url.searchParams.get('matchId'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 400 },
    );
  }

  const match = await prisma.independentMatch.findUnique({
    where: { id: parsed.data.matchId },
    select: { organizerId: true },
  });
  if (!match || match.organizerId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await checkRateLimit(buildRateLimitKey('teams.search', 'user', user.id), { limit: 60 });
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const rows = await TeamSearchService.searchInvitableForMatch({
      q: parsed.data.q,
      matchId: parsed.data.matchId,
      callerId: user.id,
    });
    return NextResponse.json(rows);
  } catch (err) {
    logger().error({ err, userId: user.id, q: parsed.data.q }, 'teams.search.failed');
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
