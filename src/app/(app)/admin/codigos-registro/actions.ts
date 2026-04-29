'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { RegistrationCodeService } from '@/modules/users';
import { isUserFacingError } from '@/shared/errors';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

const generateSchema = z.object({
  count: z.coerce.number().int().min(1).max(25),
  expiresInDays: z.coerce.number().int().min(0).max(365).optional(),
});

export async function generateCodesAction(
  _prev: { error?: string; codes?: string[] } | null,
  formData: FormData,
): Promise<{ error?: string; codes?: string[] }> {
  const user = await getSession();
  const parsed = generateSchema.safeParse({
    count: formData.get('count'),
    expiresInDays: formData.get('expiresInDays') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    const codes = await RegistrationCodeService.generate(user.id, {
      count: parsed.data.count,
      expiresInDays: parsed.data.expiresInDays && parsed.data.expiresInDays > 0
        ? parsed.data.expiresInDays
        : undefined,
    });
    revalidatePath('/admin/codigos-registro');
    return { codes };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function revokeCodeAction(codeId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await RegistrationCodeService.revoke(user.id, codeId);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/admin/codigos-registro');
  return {};
}
