'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchPhotoService, type MatchKind, MAX_COMMENT_BODY } from '@/modules/match-photos';
import { isUserFacingError } from '@/shared/errors';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { RateLimitError } from '@/shared/errors';

type ActionResult<T = unknown> = { error: string } | ({ ok: true } & T);

async function getViewer(): Promise<{ id: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getValidatedSession(token).catch(() => null);
}

function failure(err: unknown): { error: string } {
  if (err instanceof RateLimitError) return { error: err.message };
  if (isUserFacingError(err)) return { error: (err as Error).message };
  return { error: 'No se pudo completar la acción.' };
}

const matchKindSchema = z.enum(['league', 'independent']);

// Vercel Blob public URLs always live on `*.public.blob.vercel-storage.com`.
// Anchoring blobUrl to that hostname blocks a logged-in participant from
// passing a third-party URL (which would be rendered as <img src> to every
// other participant on view, leaking IP / referrer / serving hostile bytes).
const VERCEL_BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

const persistSchema = z.object({
  matchId: z.string().min(1),
  kind: matchKindSchema,
  /** League slug, only required (and used for revalidation) when kind === 'league'. */
  leagueSlug: z.string().min(1).optional(),
  blobUrl: z
    .string()
    .url()
    .refine((u) => {
      try {
        const url = new URL(u);
        return url.protocol === 'https:' && url.hostname.endsWith(VERCEL_BLOB_HOST_SUFFIX);
      } catch {
        return false;
      }
    }, { message: 'URL de imagen no válida.' }),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export async function persistMatchPhotoAction(
  raw: z.infer<typeof persistSchema>,
): Promise<ActionResult<{ id: string }>> {
  const user = await getViewer();
  if (!user) return { error: 'Sesión expirada.' };
  const parsed = persistSchema.safeParse(raw);
  if (!parsed.success) return { error: 'Datos inválidos.' };
  try {
    // 20 photo persists / 15 min — covers the realistic "upload a couple of
    // photos right after the match" use case while capping abuse.
    await checkRateLimit(buildRateLimitKey('match-photo-upload', 'user', user.id), { limit: 20 });
    const created = await MatchPhotoService.create({
      matchId: parsed.data.matchId,
      kind: parsed.data.kind,
      uploaderUserId: user.id,
      blobUrl: parsed.data.blobUrl,
      width: parsed.data.width ?? null,
      height: parsed.data.height ?? null,
    });
    // Revalidate the specific match page so the photo grid updates without
    // requiring a full navigation.
    if (parsed.data.kind === 'independent') {
      revalidatePath(`/jugar/${parsed.data.matchId}`);
    } else if (parsed.data.leagueSlug) {
      revalidatePath(`/ligas/${parsed.data.leagueSlug}/partidos/${parsed.data.matchId}`);
    }
    return { ok: true, id: created.id };
  } catch (err) {
    return failure(err);
  }
}

export async function deleteMatchPhotoAction(photoId: string): Promise<ActionResult> {
  const user = await getViewer();
  if (!user) return { error: 'Sesión expirada.' };
  try {
    await MatchPhotoService.delete(photoId, user.id);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

const commentSchema = z.object({
  photoId: z.string().min(1),
  body: z.string().trim().min(1).max(MAX_COMMENT_BODY),
});

export async function addMatchPhotoCommentAction(
  raw: z.infer<typeof commentSchema>,
): Promise<ActionResult<{ id: string }>> {
  const user = await getViewer();
  if (!user) return { error: 'Sesión expirada.' };
  const parsed = commentSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Comentario no válido.' };
  }
  try {
    // 30 comments / 15 min — generous for active matches, stops loops.
    await checkRateLimit(buildRateLimitKey('match-photo-comment', 'user', user.id), { limit: 30 });
    const created = await MatchPhotoService.addComment(parsed.data.photoId, user.id, parsed.data.body);
    return { ok: true, id: created.id };
  } catch (err) {
    return failure(err);
  }
}

export async function deleteMatchPhotoCommentAction(commentId: string): Promise<ActionResult> {
  const user = await getViewer();
  if (!user) return { error: 'Sesión expirada.' };
  try {
    await MatchPhotoService.deleteComment(commentId, user.id);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function toggleMatchPhotoLikeAction(
  photoId: string,
): Promise<ActionResult<{ liked: boolean; likeCount: number }>> {
  const user = await getViewer();
  if (!user) return { error: 'Sesión expirada.' };
  try {
    // 60 toggles / 15 min — like-spamming guard without hampering normal use.
    await checkRateLimit(buildRateLimitKey('match-photo-like', 'user', user.id), { limit: 60 });
    const result = await MatchPhotoService.toggleLike(photoId, user.id);
    return { ok: true, ...result };
  } catch (err) {
    return failure(err);
  }
}
