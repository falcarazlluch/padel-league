'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/shared/db/client';
import { SignedTokenService } from '@/shared/auth/signed-tokens';
import { PasswordService } from '@/shared/auth/password';
import { SessionService } from '@/shared/auth/session';
import { SignedTokenPurpose } from '@prisma/client';
import { InvalidTokenError } from '@/shared/errors';
import { logger } from '@/shared/logger';
import type { Route } from 'next';

export async function acceptInvitationAction(
  token: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const nameRaw = formData.get('name');
  const passwordRaw = formData.get('password');
  const confirmPasswordRaw = formData.get('confirmPassword');
  const name = (typeof nameRaw === 'string' ? nameRaw : '').trim();
  const password = typeof passwordRaw === 'string' ? passwordRaw : '';
  const confirmPassword = typeof confirmPasswordRaw === 'string' ? confirmPasswordRaw : '';

  if (!name) return { error: 'El nombre es obligatorio.' };
  if (password.length < 10) return { error: 'La contraseña debe tener al menos 10 caracteres.' };
  if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    return { error: 'La contraseña debe contener al menos un número y una letra.' };
  }
  if (password !== confirmPassword) return { error: 'Las contraseñas no coinciden.' };

  try {
    const { subjectId: userId } = await SignedTokenService.consume(
      token,
      SignedTokenPurpose.USER_INVITATION,
    );

    const passwordHash = await PasswordService.hash(password);

    await prisma.user.update({
      where: { id: userId },
      data: { name, passwordHash, emailVerifiedAt: new Date() },
    });

    const sessionToken = await SessionService.create(userId);
    await SessionService.setSessionCookie(sessionToken);

    await prisma.auditLog.create({
      data: { actorId: userId, action: 'user.invitation.accepted', targetType: 'User', targetId: userId },
    });

    logger().info({ userId }, 'user.invitation.accepted');
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      return { error: (err as Error).message };
    }
    logger().error({ err }, 'accept-invitation.unexpected');
    return { error: 'Error inesperado.' };
  }

  redirect('/dashboard' as Route);
}
