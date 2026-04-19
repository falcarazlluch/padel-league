'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { SchedulingService } from '@/modules/leagues';

const proposeDateSchema = z.object({
  matchId: z.string().cuid(),
  slug: z.string().min(1),
  proposedAt: z
    .string()
    .min(1, 'Selecciona una fecha y hora.')
    .transform((v) => new Date(v)),
});

type ActionResult = { error: string } | { success: true };

export async function proposeDate(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };
  const user = await getValidatedSession(token).catch(() => null);
  if (!user) return { error: 'No autenticado.' };

  const parsed = proposeDateSchema.safeParse({
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
    proposedAt: formData.get('proposedAt'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await SchedulingService.proposeDate(parsed.data.matchId, user.id, parsed.data.proposedAt);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    revalidatePath('/partidos');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno.';
    return { error: message };
  }
}

const acceptSchema = z.object({
  matchId: z.string().cuid(),
  slug: z.string().min(1),
});

export async function acceptProposal(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };
  const user = await getValidatedSession(token).catch(() => null);
  if (!user) return { error: 'No autenticado.' };

  const parsed = acceptSchema.safeParse({
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
  });
  if (!parsed.success) return { error: 'Datos inválidos.' };

  try {
    await SchedulingService.acceptProposal(parsed.data.matchId, user.id);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    revalidatePath('/partidos');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno.';
    return { error: message };
  }
}

export async function cancelProposal(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };
  const user = await getValidatedSession(token).catch(() => null);
  if (!user) return { error: 'No autenticado.' };

  const parsed = acceptSchema.safeParse({
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
  });
  if (!parsed.success) return { error: 'Datos inválidos.' };

  try {
    await SchedulingService.cancelProposal(parsed.data.matchId, user.id);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    revalidatePath('/partidos');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno.';
    return { error: message };
  }
}
