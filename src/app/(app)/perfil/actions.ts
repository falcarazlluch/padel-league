'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/shared/db/client';
import { PasswordService } from '@/shared/auth/password';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';
import { AuthenticationError } from '@/shared/errors';
import { logger } from '@/shared/logger';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { CATEGORY_VALUES } from '@/modules/leagues/presentation/category';
import type { Route } from 'next';

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'El nombre no puede estar vacío.').max(100),
  category: z.enum(CATEGORY_VALUES),
});

export async function updateProfileAction(
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const parsed = updateProfileSchema.safeParse({
    name: typeof formData.get('name') === 'string' ? formData.get('name') : '',
    category: formData.get('category'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };

  try {
    const user = await getValidatedSession(token);
    await prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name, category: parsed.data.category },
    });
    revalidatePath('/perfil');
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

const setAvatarSchema = z.object({
  blobUrl: z.string().url().regex(/^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//, 'URL inválida.'),
});

export async function setAvatarAction(blobUrl: string): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };

  const user = await getValidatedSession(token).catch(() => null);
  if (!user) return { error: 'No autenticado.' };

  const parsed = setAvatarSchema.safeParse({ blobUrl });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'URL inválida.' };

  // Defensive: confirm the blob URL path references this user.
  if (!parsed.data.blobUrl.includes(`avatars/${user.id}-`)) {
    return { error: 'La URL del avatar no corresponde a tu cuenta.' };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl: parsed.data.blobUrl },
  });
  revalidatePath('/perfil');
  return {};
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
