import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NotificationService } from '@/modules/notifications';
import { getTenantId } from '@/shared/tenant/context';
import { errorToResponse } from '@/shared/errors/http';

export async function POST(): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

    const user = await getValidatedSession(token);
    await NotificationService.markAllRead(user.id, await getTenantId());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
