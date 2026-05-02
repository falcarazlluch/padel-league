import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { buildIndependentMatchEvent } from '@/shared/calendar/match-event-builder';
import { buildIcsString } from '@/shared/calendar/ics-builder';
import { logger } from '@/shared/logger';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getValidatedSession(sessionToken).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const built = await buildIndependentMatchEvent(id, user.id);
    if (built.kind === 'not-found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (built.kind === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (built.kind === 'no-date') return NextResponse.json({ error: 'No scheduled date' }, { status: 400 });

    const ics = buildIcsString(built.event);
    return new NextResponse(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${built.filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    logger().error({ err, matchId: id, userId: user.id }, 'calendar.ind-match.failed');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
