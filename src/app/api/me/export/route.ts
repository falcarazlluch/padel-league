import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { prisma } from '@/shared/db/client';
import { errorToResponse } from '@/shared/errors/http';
import { getValidatedSession } from '@/shared/auth/session-cache';

export async function GET(): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

    const sessionUser = await getValidatedSession(token);

    const [user, teamMemberships, notifications, auditLogs] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: sessionUser.id },
        select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
      }),
      prisma.teamMember.findMany({
        where: { userId: sessionUser.id },
        include: { team: { select: { name: true, league: { select: { name: true } } } } },
      }),
      prisma.notification.findMany({
        where: { userId: sessionUser.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.auditLog.findMany({
        where: { actorId: sessionUser.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      user,
      teamMemberships,
      notifications,
      auditLogs,
    });
  } catch (err) {
    return errorToResponse(err);
  }
}
