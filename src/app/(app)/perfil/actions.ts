'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/shared/db/client';
import { PasswordService } from '@/shared/auth/password';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';
import { AuthenticationError } from '@/shared/errors';
import { logger } from '@/shared/logger';
import { getValidatedSession } from '@/shared/auth/session-cache';
import type { Route } from 'next';

export async function updateProfileAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  const nameRaw = formData.get('name');
  const name = (typeof nameRaw === 'string' ? nameRaw : '').trim();
  if (!name) return { error: 'El nombre no puede estar vacío.' };

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };

  try {
    const user = await getValidatedSession(token);
    await prisma.user.update({ where: { id: user.id }, data: { name } });
    return { success: 'Perfil actualizado.' };
  } catch (err) {
    logger().error({ err }, 'update-profile.unexpected');
    return { error: 'Error inesperado.' };
  }
}

export async function changePasswordAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  const currentPasswordRaw = formData.get('currentPassword');
  const newPasswordRaw = formData.get('newPassword');
  const currentPassword = typeof currentPasswordRaw === 'string' ? currentPasswordRaw : '';
  const newPassword = typeof newPasswordRaw === 'string' ? newPasswordRaw : '';

  if (newPassword.length < 10) return { error: 'La contraseña debe tener al menos 10 caracteres.' };
  if (!/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) {
    return { error: 'La contraseña debe contener al menos un número y una letra.' };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };

  try {
    const sessionUser = await getValidatedSession(token);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });

    const valid = await PasswordService.verify(user.passwordHash, currentPassword);
    if (!valid) throw new AuthenticationError('WRONG_PASSWORD', 'Contraseña actual incorrecta.');

    const newHash = await PasswordService.hash(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

    await prisma.auditLog.create({
      data: { actorId: user.id, action: 'auth.password.changed', targetType: 'User', targetId: user.id },
    });

    return { success: 'Contraseña actualizada.' };
  } catch (err) {
    if (err instanceof AuthenticationError) return { error: (err as Error).message };
    logger().error({ err }, 'change-password.unexpected');
    return { error: 'Error inesperado.' };
  }
}

export async function revokeAllSessionsAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);

  const user = await getValidatedSession(token);
  await SessionService.revokeAll(user.id);
  await SessionService.clearSessionCookie();

  redirect('/login' as Route);
}
