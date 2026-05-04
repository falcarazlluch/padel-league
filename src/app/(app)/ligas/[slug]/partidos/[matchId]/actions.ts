'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { SchedulingService } from '@/modules/leagues';
import { isUserFacingError } from '@/shared/errors';
import { parseMadridLocal } from '@/shared/datetime/madrid-local';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

const proposeDateSchema = z.object({
  matchId: z.string().cuid(),
  slug: z.string().min(1),
  proposedAt: z
    .string()
    .min(1, 'Selecciona una fecha y hora.')
    .transform((v) => parseMadridLocal(v))
    .refine((d) => !isNaN(d.getTime()), { message: 'Fecha no válida.' }),
});

type ActionResult = { error: string } | { success: true };

export async function proposeDate(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getSession();

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
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const acceptSchema = z.object({
  matchId: z.string().cuid(),
  slug: z.string().min(1),
});

export async function acceptProposal(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getSession();

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
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

// cancelProposal is intentionally not exposed as a UI action.
// The "Cambiar propuesta" flow calls proposeDate directly, which supersedes any prior proposal atomically.
// SchedulingService.cancelProposal remains available for admin use or future flows.

const proposeExtensionSchema = z.object({
  matchId: z.string().cuid(),
  slug: z.string().min(1),
  newDeadlineAt: z
    .string()
    .min(1, 'Selecciona una fecha.')
    .transform((v) => new Date(v))
    .refine((d) => !isNaN(d.getTime()), { message: 'Fecha no válida.' }),
});

export async function proposeDeadlineExtensionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();

  const parsed = proposeExtensionSchema.safeParse({
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
    newDeadlineAt: formData.get('newDeadlineAt'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await SchedulingService.proposeDeadlineExtension(
      parsed.data.matchId,
      user.id,
      parsed.data.newDeadlineAt,
    );
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    revalidatePath('/partidos');
    return { success: true };
  } catch (err: unknown) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const respondExtensionSchema = z.object({
  proposalId: z.string().cuid(),
  matchId: z.string().cuid(),
  slug: z.string().min(1),
});

export async function acceptDeadlineExtensionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = respondExtensionSchema.safeParse({
    proposalId: formData.get('proposalId'),
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
  });
  if (!parsed.success) return { error: 'Datos inválidos.' };

  try {
    await SchedulingService.acceptDeadlineExtension(parsed.data.proposalId, user.id);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    revalidatePath('/partidos');
    return { success: true };
  } catch (err: unknown) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function rejectDeadlineExtensionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = respondExtensionSchema.safeParse({
    proposalId: formData.get('proposalId'),
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
  });
  if (!parsed.success) return { error: 'Datos inválidos.' };

  try {
    await SchedulingService.rejectDeadlineExtension(parsed.data.proposalId, user.id);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    return { success: true };
  } catch (err: unknown) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
