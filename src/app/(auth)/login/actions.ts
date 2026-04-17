'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { headers } from 'next/headers';
import { prisma } from '@/shared/db/client';
import { PasswordService } from '@/shared/auth/password';
import { SessionService } from '@/shared/auth/session';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { AuthenticationError } from '@/shared/errors';
import { logger } from '@/shared/logger';

export async function loginAction(formData: FormData): Promise<{ error?: string }> {
  const rawEmail = formData.get('email');
  const rawPassword = formData.get('password');
  const rawNext = formData.get('next');
  const email = (typeof rawEmail === 'string' ? rawEmail : '').toLowerCase().trim();
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  const next = typeof rawNext === 'string' ? rawNext : '/dashboard';

  const headerStore = await headers();
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = headerStore.get('user-agent') ?? undefined;

  try {
    await checkRateLimit(buildRateLimitKey('login', 'ip', ip), { limit: 10 });
    await checkRateLimit(buildRateLimitKey('login', 'email', email), { limit: 5 });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.emailVerifiedAt) {
      throw new AuthenticationError('CREDENTIALS_INVALID', 'Email o contraseña incorrectos.');
    }

    const valid = await PasswordService.verify(user.passwordHash, password);
    if (!valid) {
      await prisma.auditLog.create({
        data: { actorId: user.id, action: 'auth.login.failed', targetType: 'User', targetId: user.id, ipAddress: ip, userAgent },
      });
      throw new AuthenticationError('CREDENTIALS_INVALID', 'Email o contraseña incorrectos.');
    }

    if (PasswordService.needsRehash(user.passwordHash)) {
      const newHash = await PasswordService.hash(password);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
    }

    const sessionToken = await SessionService.create(user.id, ip, userAgent);
    await SessionService.setSessionCookie(sessionToken);

    await prisma.auditLog.create({
      data: { actorId: user.id, action: 'auth.login.success', targetType: 'User', targetId: user.id, ipAddress: ip, userAgent },
    });

    logger().info({ userId: user.id }, 'auth.login.success');
  } catch (err) {
    if (err instanceof AuthenticationError || (err as { code?: string }).code === 'RATE_LIMIT_EXCEEDED') {
      return { error: (err as Error).message };
    }
    logger().error({ err }, 'login.unexpected');
    return { error: 'Error inesperado. Inténtalo de nuevo.' };
  }

  redirect((next.startsWith('/') ? next : '/dashboard') as Route);
}
