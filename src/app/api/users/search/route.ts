import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { UserSearchService } from '@/modules/users';
import { logger } from '@/shared/logger';

const querySchema = z.object({
  q: z.string().trim().min(1).max(60),
  teamId: z.string().cuid(),
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
    teamId: url.searchParams.get('teamId'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 400 },
    );
  }

  // Caller must be a member of the team they search candidates for.
  const member = await prisma.teamMember.findFirst({
    where: { teamId: parsed.data.teamId, userId: user.id },
    select: { id: true },
  });
  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rate limit: 60 hits per 15-min window, scoped per user.
  try {
    await checkRateLimit(buildRateLimitKey('users.search', 'user', user.id), { limit: 60 });
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const rows = await UserSearchService.searchCandidates({
      q: parsed.data.q,
      teamId: parsed.data.teamId,
      callerId: user.id,
    });
    return NextResponse.json(rows);
  } catch (err) {
    logger().error({ err, userId: user.id, q: parsed.data.q }, 'users.search.failed');
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
