import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NotificationService } from '@/modules/notifications';

export async function GET(): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const user = await getValidatedSession(token);
    const result = await NotificationService.getUnread(user.id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
  }
}
