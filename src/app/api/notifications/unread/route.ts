import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NotificationService } from '@/modules/notifications';
import { errorToResponse } from '@/shared/errors/http';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

    const user = await getValidatedSession(token);
    const result = await NotificationService.getUnread(user.id);
    return NextResponse.json(result);
  } catch (err) {
    return errorToResponse(err);
  }
}
