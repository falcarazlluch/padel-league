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
    const isAdmin = await prisma.leagueMember.findFirst({
      where: {
        userId: user.id,
        role: 'LEAGUE_ADMIN',
        league: { matches: { some: { id: commentary.matchId } } },
      },
    });
    if (!isAdmin) return { error: 'Solo los admins pueden regenerar.' };

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
