'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { UserRole } from '@prisma/client';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { UserAdminService } from '@/modules/users';
import { isUserFacingError } from '@/shared/errors';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

const setRoleSchema = z.object({
  userId: z.string().cuid(),
  role: z.enum(['LEAGUE_ADMIN', 'PLAYER']),
});

export async function setUserRoleAction(
  _prev: { error?: string; success?: true } | null,
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const acting = await getSession();
  const parsed = setRoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await UserAdminService.setRole(acting.id, parsed.data.userId, parsed.data.role as UserRole);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/admin/usuarios');
  revalidatePath(`/admin/usuarios/${parsed.data.userId}`);
  return { success: true };
}
