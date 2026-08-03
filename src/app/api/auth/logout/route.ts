import { cookies } from 'next/headers';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';

/**
 * Where to land after logging out. Only same-origin absolute paths are honoured,
 * so a crafted `next` cannot bounce the user off-site. Used by the inscription
 * wizard, which logs you out *back into* its own step 2 rather than dumping you
 * on /login and losing the invite context.
 */
function safeNext(raw: FormDataEntryValue | null): string {
  if (typeof raw !== 'string') return '/login';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/login';
  return raw;
}

export async function POST(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  let next = '/login';
  // Only form posts carry a destination; the plain logout buttons send nothing.
  try {
    const form = await request.formData();
    next = safeNext(form.get('next'));
  } catch {
    /* no body — keep the default */
  }

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
    headers: { Location: next },
  });
}
