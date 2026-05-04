'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/shared/db/client';
import { PasswordService } from '@/shared/auth/password';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';
import { AuthenticationError, RateLimitError } from '@/shared/errors';
import { logger } from '@/shared/logger';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
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
    // Same brute-force cap as deleteAccount: a stolen session must not allow
    // unbounded password guesses against the current-password input.
    await checkRateLimit(buildRateLimitKey('change-password', 'user', sessionUser.id), {
      limit: 10,
    });
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
    if (err instanceof RateLimitError) return { error: err.message };
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

export async function removeAvatarAction(): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };
  const user = await getValidatedSession(token).catch(() => null);
  if (!user) return { error: 'No autenticado.' };
  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
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

const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, 'Confirma tu contraseña actual.'),
  /** Case-insensitive "ELIMINAR" required to avoid mis-clicks. */
  confirmation: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => v === 'ELIMINAR', { message: 'Escribe ELIMINAR para confirmar.' }),
});

/**
 * GDPR-style account deletion. Anonymises the user inline (we cannot rely on
 * the queue worker for an action the user just clicked + expects the session
 * to drop), revokes all sessions, clears the cookie and redirects to /login.
 *
 * The User row stays in DB so historical Match/Team/Result references remain
 * valid (FK Restrict on creator/result-submitter). Email becomes
 * "anonymized-<id>@deleted.local"; password is replaced by an unusable hash.
 */
export async function deleteAccountAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };

  const parsed = deleteAccountSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    confirmation: formData.get('confirmation'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Confirma para continuar.' };
  }

  let userId: string;
  try {
    const sessionUser = await getValidatedSession(token);
    // Cap brute-force attempts: an attacker on a stolen session shouldn't be
    // able to grind through password guesses. 5 attempts / 15 min per user.
    await checkRateLimit(buildRateLimitKey('account-delete', 'user', sessionUser.id), {
      limit: 5,
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });

    // Hard block: SUPER_ADMIN must not be able to self-delete via the UI.
    // Removing the only system administrator would leave the platform with
    // no operator account; promotion is intentionally a manual DB action.
    if (user.role === 'SUPER_ADMIN') {
      return {
        error:
          'Las cuentas de administrador no pueden eliminarse desde aquí. Pide a otro administrador que lo gestione.',
      };
    }

    // Soft block: a user who is the sole `createdByUserId` of an ACTIVE league
    // must not vanish silently — that league would keep its FK pointing at an
    // anonymised user and lose its admin. Force the user to archive/transfer
    // first.
    const adminLeagues = await prisma.league.findMany({
      where: {
        createdByUserId: sessionUser.id,
        status: { in: ['DRAFT', 'ACTIVE'] },
      },
      select: { id: true, name: true },
    });
    if (adminLeagues.length > 0) {
      const names = adminLeagues.map((l) => l.name).join(', ');
      return {
        error: `Eres administrador de ligas activas (${names}). Archívalas o pídele al super-admin que te las transfiera antes de eliminar la cuenta.`,
      };
    }

    const valid = await PasswordService.verify(user.passwordHash, parsed.data.currentPassword);
    if (!valid) return { error: 'Contraseña incorrecta.' };
    userId = user.id;

    // Cryptographically random seed so the disabled hash cannot be predicted
    // even if an attacker knows the deletion timestamp. The user can never
    // log in to this row anyway (email is rewritten), so the seed value
    // doesn't really matter — but Math.random() is the wrong primitive here.
    const invalidHash = await PasswordService.hash(
      `__deleted__${Date.now()}__${randomBytes(16).toString('hex')}`,
    );

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          email: `anonymized-${userId}@deleted.local`,
          name: 'Jugador anónimo',
          passwordHash: invalidHash,
          avatarUrl: null,
          phone: null,
          deletedAt: new Date(),
          anonymizedAt: new Date(),
        },
      }),
      prisma.session.deleteMany({ where: { userId } }),
      prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.account.deleted-self',
          targetType: 'User',
          targetId: userId,
        },
      }),
    ]);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    logger().error({ err }, 'delete-account.unexpected');
    return { error: 'No se pudo eliminar la cuenta.' };
  }

  await SessionService.clearSessionCookie();
  redirect('/login?deleted=1' as Route);
}
