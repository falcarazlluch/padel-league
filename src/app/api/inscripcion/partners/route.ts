import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { UserSearchService } from '@/modules/users';
import { getTenantId } from '@/shared/tenant/context';
import { logger } from '@/shared/logger';

const querySchema = z.object({
  q: z.string().trim().min(2).max(60),
  leagueId: z.string().cuid(),
});

/**
 * Partner picker for the inscription wizard.
 *
 * Two guards make this safe to expose: the caller must have a live enrolment in
 * the competition they are searching against, and candidates are restricted to
 * members of the competition's own organization. Together they stop the
 * endpoint becoming a directory of the whole platform.
 */
export async function GET(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getValidatedSession(sessionToken).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q'),
    leagueId: url.searchParams.get('leagueId'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 400 },
    );
  }

  try {
    await checkRateLimit(buildRateLimitKey('inscripcion.partners', 'user', user.id), { limit: 60 });
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const enrollment = await prisma.tournamentEnrollment.findUnique({
    where: { leagueId_userId: { leagueId: parsed.data.leagueId, userId: user.id } },
    select: { status: true, league: { select: { organizationId: true } } },
  });
  if (!enrollment || enrollment.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Prefer the competition's own org over the request host: they should agree,
  // and if they ever don't, the competition is the authority.
  const organizationId = enrollment.league.organizationId ?? (await getTenantId());

  try {
    const rows = await UserSearchService.searchOrgPartners({
      q: parsed.data.q,
      callerId: user.id,
      organizationId,
      excludeRegisteredInLeagueId: parsed.data.leagueId,
    });
    return NextResponse.json(rows);
  } catch (err) {
    logger().error({ err, userId: user.id }, 'inscripcion.partners.search.failed');
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
