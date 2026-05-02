'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { queue } from '@/shared/queue/client';
import { prisma } from '@/shared/db/client';
import { MatchCommentaryService } from '@/modules/match-commentary';
import { drainPendingJobs } from '@/worker/drainer';

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard' as Route);
  return user;
}

export async function drainNowAction(): Promise<void> {
  await requireSuperAdmin();
  const q = queue();
  await q.start();
  await drainPendingJobs(q.raw(), { deadlineMs: 50_000 });
  revalidatePath('/admin/cola');
}

export async function clearDeadLettersAction(): Promise<void> {
  await requireSuperAdmin();
  await prisma.jobDeadLetter.deleteMany({});
  revalidatePath('/admin/cola');
}

export type CommentaryDebugResult =
  | { ok: true; created: boolean; existed: boolean }
  | { error: string };

export async function generateCommentaryNowAction(
  _prev: CommentaryDebugResult | null,
  formData: FormData,
): Promise<CommentaryDebugResult> {
  await requireSuperAdmin();
  const matchId = String(formData.get('matchId') ?? '').trim();
  const type = String(formData.get('type') ?? 'RECAP') as 'PREVIEW' | 'RECAP';
  if (!matchId) return { error: 'Falta matchId.' };

  const before = await prisma.matchCommentary.findUnique({
    where: { matchId_type: { matchId, type } },
    select: { id: true },
  });

  try {
    await MatchCommentaryService.generate(matchId, type, { regenerate: true });
  } catch (err) {
    return { error: (err as Error).message ?? String(err) };
  }

  const after = await prisma.matchCommentary.findUnique({
    where: { matchId_type: { matchId, type } },
    select: { id: true },
  });

  revalidatePath('/admin/cola');
  return { ok: true, created: !!after, existed: !!before };
}
