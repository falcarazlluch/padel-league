import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/shared/db/client';
import { AuthenticationError } from '@/shared/errors';

export const SESSION_COOKIE = 'padel_session';
const SESSION_TTL_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export const SessionService = {
  generateToken(): string {
    return randomBytes(32).toString('base64url');
  },

  async create(userId: string, ipAddress?: string, userAgent?: string): Promise<string> {
    const sessionToken = SessionService.generateToken();
    const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: { userId, sessionToken, expires, ipAddress: ipAddress ?? null, userAgent: userAgent ?? null },
    });

    return sessionToken;
  },

  async validate(sessionToken: string): Promise<SessionUser> {
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: { select: { id: true, email: true, name: true, role: true, deletedAt: true } } },
    });

    if (!session || session.expires < new Date() || session.user.deletedAt) {
      throw new AuthenticationError('SESSION_INVALID', 'Sesión inválida o expirada.');
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
    };
  },

  async revoke(sessionToken: string): Promise<void> {
    await prisma.session.deleteMany({ where: { sessionToken } });
  },

  async revokeAll(userId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { userId } });
  },

  async setSessionCookie(token: string): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    });
  },

  async clearSessionCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
  },
} as const;
