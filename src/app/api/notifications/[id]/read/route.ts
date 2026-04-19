import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NotificationService } from '@/modules/notifications';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const user = await getValidatedSession(token);
    const { id } = await params;
    await NotificationService.markRead(id, user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
  }
}
