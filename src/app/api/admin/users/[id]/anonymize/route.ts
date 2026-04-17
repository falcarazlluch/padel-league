import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { assertSuperAdmin } from '@/shared/auth/rbac';
import { queue } from '@/shared/queue/client';
import { errorToResponse } from '@/shared/errors/http';
import { logger } from '@/shared/logger';
import { getValidatedSession } from '@/shared/auth/session-cache';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

    const actor = await getValidatedSession(token);
    assertSuperAdmin(actor);

    const { id: userId } = await params;

    const q = queue();
    await q.start();
    await q.publish('anonymize-user', { userId });

    logger().info({ actorId: actor.id, targetUserId: userId }, 'user.anonymize.enqueued');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
