'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { CategoryProposalService } from '@/modules/leagues';
import { isUserFacingError } from '@/shared/errors';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

const decisionSchema = z.object({
  proposalId: z.string().cuid(),
});

export async function acceptCategoryProposalAction(proposalId: string): Promise<{ error?: string }> {
  const user = await getSession();
  const parsed = decisionSchema.safeParse({ proposalId });
  if (!parsed.success) return { error: 'Datos inválidos.' };
  try {
    await CategoryProposalService.accept(parsed.data.proposalId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/dashboard');
  return {};
}

export async function rejectCategoryProposalAction(proposalId: string): Promise<{ error?: string }> {
  const user = await getSession();
  const parsed = decisionSchema.safeParse({ proposalId });
  if (!parsed.success) return { error: 'Datos inválidos.' };
  try {
    await CategoryProposalService.reject(parsed.data.proposalId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/dashboard');
  return {};
}
