'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { SchedulingService } from '@/modules/leagues';
import { isUserFacingError } from '@/shared/errors';

const acceptSchema = z.object({
  matchId: z.string().cuid(),
});

type ActionResult = { error: string } | { success: true };

export async function acceptProposalFromList(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token).catch(() => redirect('/login' as Route));

  const parsed = acceptSchema.safeParse({ matchId: formData.get('matchId') });
  if (!parsed.success) return { error: 'Datos inválidos.' };

  try {
    await SchedulingService.acceptProposal(parsed.data.matchId, user.id);
    revalidatePath('/partidos');
    return { success: true };
  } catch (err: unknown) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
