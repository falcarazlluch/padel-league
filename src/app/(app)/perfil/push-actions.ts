'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { PreferencesService, type PreferenceFlags } from '@/modules/push';
import { logger } from '@/shared/logger';

const patchSchema = z.object({
  pushInvitations: z.boolean().optional(),
  pushMatchDates: z.boolean().optional(),
  pushResults: z.boolean().optional(),
  pushPhotos: z.boolean().optional(),
  pushChat: z.boolean().optional(),
  pushLeagueEvents: z.boolean().optional(),
});

export async function updatePushPreferencesAction(
  patch: Partial<PreferenceFlags>,
): Promise<{ error?: string; success?: string; prefs?: PreferenceFlags }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };

  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return { error: 'Datos inválidos.' };

  try {
    const user = await getValidatedSession(token);
    const prefs = await PreferencesService.upsert(user.id, parsed.data);
    revalidatePath('/perfil');
    return { success: 'Preferencias guardadas.', prefs };
  } catch (err) {
    logger().error({ err }, 'update-push-prefs.unexpected');
    return { error: 'Error inesperado.' };
  }
}
