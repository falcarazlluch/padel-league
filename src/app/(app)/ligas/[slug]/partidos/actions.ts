'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchService } from '@/modules/leagues';
import { isUserFacingError } from '@/shared/errors';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

const submitResultSchema = z.object({
  matchId: z.string().cuid(),
  setsCount: z.coerce.number().int().min(2).max(5),
});

export async function submitResultAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();

  const base = submitResultSchema.safeParse(Object.fromEntries(formData));
  if (!base.success) return { error: base.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { matchId, setsCount } = base.data;
  const sets = Array.from({ length: setsCount }, (_, i) => ({
    gamesA: Number(formData.get(`gamesA_${i}`) ?? ''),
    gamesB: Number(formData.get(`gamesB_${i}`) ?? ''),
  }));

  const setsValid = sets.every(
    (s) =>
      Number.isInteger(s.gamesA) &&
      Number.isInteger(s.gamesB) &&
      s.gamesA >= 0 &&
      s.gamesB >= 0,
  );
  if (!setsValid) return { error: 'Los marcadores de los sets son inválidos.' };

  try {
    await MatchService.submitResult(matchId, user.id, { sets });
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function confirmResultAction(matchId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await MatchService.confirmResult(matchId, user.id);
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const disputeSchema = z.object({
  matchId: z.string().cuid(),
  reason: z.string().min(10, 'El motivo debe tener al menos 10 caracteres.').max(1000),
});

export async function disputeResultAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();
  const parsed = disputeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await MatchService.disputeResult(parsed.data.matchId, user.id, parsed.data.reason);
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
