'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Route } from 'next';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchCommentaryService } from '@/modules/match-commentary';
import { isUserFacingError } from '@/shared/errors';
import { queue } from '@/shared/queue/client';
import { prisma } from '@/shared/db/client';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

type ActionResult = { error: string } | { success: true };

export async function regenerateCommentaryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const commentaryId = formData.get('commentaryId');
  const slug = formData.get('slug');
  const matchId = formData.get('matchId');
  if (
    typeof commentaryId !== 'string' ||
    typeof slug !== 'string' ||
    typeof matchId !== 'string'
  ) {
    return { error: 'Datos inválidos.' };
  }

  try {
    const commentary = await prisma.matchCommentary.findUnique({
      where: { id: commentaryId },
      select: { matchId: true, type: true },
    });
    if (!commentary) return { error: 'Crónica no encontrada.' };

    // Authorization check: queue is trusted, so we only gate auth here at the action boundary
    const match = await prisma.match.findUnique({
      where: { id: commentary.matchId },
      select: { league: { select: { createdByUserId: true } } },
    });
    const isAdmin =
      user.role === 'SUPER_ADMIN' ||
      (user.role === 'LEAGUE_ADMIN' && match?.league.createdByUserId === user.id);
    if (!isAdmin) return { error: 'Solo el admin de la liga puede regenerar.' };

    const q = queue();
    await q.start();
    await q.publish('generate-match-commentary', {
      matchId: commentary.matchId,
      type: commentary.type,
      regenerate: true,
    });

    revalidatePath(`/ligas/${slug}/partidos/${matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const editSchema = z.object({
  commentaryId: z.string().cuid(),
  slug: z.string().min(1),
  matchId: z.string().cuid(),
  content: z.string().trim().min(1, 'El contenido no puede estar vacío.').max(1000, 'Máximo 1000 caracteres.'),
});

export async function editCommentaryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = editSchema.safeParse({
    commentaryId: formData.get('commentaryId'),
    slug: formData.get('slug'),
    matchId: formData.get('matchId'),
    content: formData.get('content'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await MatchCommentaryService.edit(parsed.data.commentaryId, user.id, parsed.data.content);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function deleteCommentaryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const commentaryId = formData.get('commentaryId');
  const slug = formData.get('slug');
  const matchId = formData.get('matchId');
  if (
    typeof commentaryId !== 'string' ||
    typeof slug !== 'string' ||
    typeof matchId !== 'string'
  ) {
    return { error: 'Datos inválidos.' };
  }

  try {
    await MatchCommentaryService.delete(commentaryId, user.id);
    revalidatePath(`/ligas/${slug}/partidos/${matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const forceGenerateSchema = z.object({
  matchId: z.string().cuid(),
  slug: z.string().min(1),
  type: z.enum(['PREVIEW', 'RECAP']),
});

export async function forceGenerateCommentaryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();

  const parsed = forceGenerateSchema.safeParse({
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
    type: formData.get('type'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  // Authorize: must be league admin (SUPER_ADMIN counts as league admin everywhere)
  const match = await prisma.match.findUnique({
    where: { id: parsed.data.matchId },
    select: { league: { select: { createdByUserId: true } } },
  });
  const isAdmin =
    user.role === 'SUPER_ADMIN' ||
    (user.role === 'LEAGUE_ADMIN' && match?.league.createdByUserId === user.id);
  if (!isAdmin) return { error: 'Solo el admin de la liga puede generar crónicas.' };

  try {
    // Bypass the queue: call the service synchronously so the admin sees the result immediately.
    await MatchCommentaryService.generate(parsed.data.matchId, parsed.data.type);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
