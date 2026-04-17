import { cookies } from 'next/headers';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';

export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      const session = await prisma.session.findUnique({
        where: { sessionToken: token },
        select: { userId: true },
      });
      await SessionService.revoke(token);
      if (session) {
        await prisma.auditLog.create({
          data: { actorId: session.userId, action: 'auth.logout', targetType: 'User', targetId: session.userId },
        });
      }
    } catch (err) {
      logger().warn({ err }, 'logout.session-not-found');
    }
    await SessionService.clearSessionCookie();
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/login' },
  });
}
