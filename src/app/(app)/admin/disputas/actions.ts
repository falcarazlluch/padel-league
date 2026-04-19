'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchService } from '@/modules/leagues';
import { isUserFacingError } from '@/shared/errors';
import type { DisputeResolution } from '@prisma/client';

async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard' as Route);
  return user;
}

const resolveSchema = z.object({
  disputeId: z.string().cuid(),
  resolution: z.enum(['AWARD_PROPONENT', 'AWARD_OPPONENT', 'BOTH_LOST', 'EXTEND_DEADLINE', 'DISMISS']),
  adminNote: z.string().max(2000).optional(),
  // datetime-local inputs don't include timezone offset, so we accept ISO strings without offset
  newDeadlineAt: z.string().datetime({ offset: false }).optional(),
});

export async function resolveDisputeAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const admin = await getAdminSession();

  const parsed = resolveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { disputeId, resolution, adminNote, newDeadlineAt } = parsed.data;

  try {
    await MatchService.resolveDispute(
      disputeId,
      admin.id,
      resolution as DisputeResolution,
      adminNote,
      newDeadlineAt ? new Date(newDeadlineAt) : undefined,
    );
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
