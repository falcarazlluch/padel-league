import { del } from '@vercel/blob';
import { prisma } from '@/shared/db/client';
import {
  AuthorizationError,
  DomainError,
  NotFoundError,
} from '@/shared/errors';
import { logger } from '@/shared/logger';
import type { MatchKind, PhotoCommentEntry, PhotoDetail, PhotoSummary } from '../domain/types';
import { extractMentionCandidates, resolveMentionsToUserIds } from './mentions';

const MAX_PHOTOS_PER_MATCH = 30;
const MAX_COMMENT_BODY = 500;

/**
 * Unified ACL: a participant of a match (whether of a league fixture or
 * an independent match) is the only one allowed to upload, view, like or
 * comment on photos in v1. The "spectator" / "league-wide" expansion is
 * deferred to the future galería feature.
 */
async function getMatchParticipantIds(
  matchId: string,
  kind: MatchKind,
): Promise<{ ids: string[]; existed: true } | { existed: false }> {
  if (kind === 'league') {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        teamA: { select: { members: { select: { userId: true } } } },
        teamB: { select: { members: { select: { userId: true } } } },
      },
    });
    if (!match) return { existed: false };
    const ids = [
      ...match.teamA.members.map((m) => m.userId),
      ...match.teamB.members.map((m) => m.userId),
    ];
    return { ids, existed: true };
  }
  const match = await prisma.independentMatch.findUnique({
    where: { id: matchId },
    select: {
      organizerId: true,
      participants: {
        where: { status: 'ACCEPTED' },
        select: { userId: true },
      },
    },
  });
  if (!match) return { existed: false };
  const ids = new Set<string>([match.organizerId, ...match.participants.map((p) => p.userId)]);
  return { ids: Array.from(ids), existed: true };
}

async function assertParticipant(
  matchId: string,
  kind: MatchKind,
  userId: string,
): Promise<string[]> {
  const result = await getMatchParticipantIds(matchId, kind);
  if (!result.existed) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
  if (!result.ids.includes(userId)) {
    throw new AuthorizationError('NOT_PARTICIPANT', 'Solo los participantes pueden ver o editar fotos.');
  }
  return result.ids;
}

function whereMatch(matchId: string, kind: MatchKind) {
  return kind === 'league'
    ? { matchId, independentMatchId: null }
    : { matchId: null, independentMatchId: matchId };
}

function makePhotoSummary(
  row: {
    id: string;
    blobUrl: string;
    width: number | null;
    height: number | null;
    createdAt: Date;
    uploadedByUserId: string;
    uploader: { id: string; name: string; avatarUrl: string | null };
    _count: { likes: number; comments: number };
    likes: { userId: string }[];
  },
  viewerUserId: string,
  viewerIsSuperAdmin: boolean,
): PhotoSummary {
  return {
    id: row.id,
    blobUrl: row.blobUrl,
    width: row.width,
    height: row.height,
    uploaderId: row.uploader.id,
    uploaderName: row.uploader.name,
    uploaderAvatarUrl: row.uploader.avatarUrl,
    createdAt: row.createdAt,
    likeCount: row._count.likes,
    commentCount: row._count.comments,
    viewerLiked: row.likes.length > 0,
    canDelete: viewerIsSuperAdmin || row.uploadedByUserId === viewerUserId,
  };
}

export const MatchPhotoService = {
  async list(matchId: string, kind: MatchKind, viewerUserId: string): Promise<PhotoSummary[]> {
    await assertParticipant(matchId, kind, viewerUserId);
    const viewer = await prisma.user.findUnique({
      where: { id: viewerUserId },
      select: { role: true },
    });
    const viewerIsSuperAdmin = viewer?.role === 'SUPER_ADMIN';

    const rows = await prisma.matchPhoto.findMany({
      where: whereMatch(matchId, kind),
      include: {
        uploader: { select: { id: true, name: true, avatarUrl: true } },
        // Only the viewer's own like row is fetched — keeps the payload tiny.
        likes: { where: { userId: viewerUserId }, select: { userId: true } },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => makePhotoSummary(r, viewerUserId, viewerIsSuperAdmin));
  },

  async getDetail(photoId: string, viewerUserId: string): Promise<PhotoDetail> {
    const photo = await prisma.matchPhoto.findUnique({
      where: { id: photoId },
      select: {
        id: true,
        matchId: true,
        independentMatchId: true,
        blobUrl: true,
        width: true,
        height: true,
        uploadedByUserId: true,
        createdAt: true,
        uploader: { select: { id: true, name: true, avatarUrl: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        likes: { where: { userId: viewerUserId }, select: { userId: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    if (!photo) throw new NotFoundError('PHOTO_NOT_FOUND', 'Foto no encontrada.');

    const matchId = photo.matchId ?? photo.independentMatchId;
    const kind: MatchKind = photo.matchId !== null ? 'league' : 'independent';
    if (!matchId) throw new DomainError('PHOTO_ORPHAN', 'Foto sin partido asociado.');
    await assertParticipant(matchId, kind, viewerUserId);

    const viewer = await prisma.user.findUnique({
      where: { id: viewerUserId },
      select: { role: true },
    });
    const viewerIsSuperAdmin = viewer?.role === 'SUPER_ADMIN';

    const summary = makePhotoSummary(photo, viewerUserId, viewerIsSuperAdmin);
    const comments: PhotoCommentEntry[] = photo.comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      authorId: c.user.id,
      authorName: c.user.name,
      authorAvatarUrl: c.user.avatarUrl,
      canDelete: viewerIsSuperAdmin || c.user.id === viewerUserId,
    }));
    return { ...summary, comments };
  },

  async create(input: {
    matchId: string;
    kind: MatchKind;
    uploaderUserId: string;
    blobUrl: string;
    width?: number | null;
    height?: number | null;
  }): Promise<{ id: string }> {
    const participantIds = await assertParticipant(input.matchId, input.kind, input.uploaderUserId);

    // Cap the per-match photo count atomically: count + insert run in a
    // Serializable transaction so two concurrent uploads cannot both pass
    // the guard at MAX_PHOTOS_PER_MATCH - 1 and end up with MAX + 1 rows.
    const created = await prisma.$transaction(
      async (tx) => {
        const existingCount = await tx.matchPhoto.count({
          where: whereMatch(input.matchId, input.kind),
        });
        if (existingCount >= MAX_PHOTOS_PER_MATCH) {
          throw new DomainError(
            'PHOTO_LIMIT_REACHED',
            `Este partido ya tiene el máximo de ${MAX_PHOTOS_PER_MATCH} fotos.`,
          );
        }
        return tx.matchPhoto.create({
          data: {
            matchId: input.kind === 'league' ? input.matchId : null,
            independentMatchId: input.kind === 'independent' ? input.matchId : null,
            uploadedByUserId: input.uploaderUserId,
            blobUrl: input.blobUrl,
            width: input.width ?? null,
            height: input.height ?? null,
          },
          select: { id: true },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    // Notify the other participants. Best-effort: log + swallow errors so a
    // notification glitch does not prevent the photo row from being created.
    const recipients = participantIds.filter((id) => id !== input.uploaderUserId);
    if (recipients.length > 0) {
      const uploader = await prisma.user.findUnique({
        where: { id: input.uploaderUserId },
        select: { name: true },
      });
      const uploaderName = uploader?.name ?? 'Un compañero';
      await prisma.notification
        .createMany({
          data: recipients.map((userId) => ({
            userId,
            type: 'MATCH_PHOTO_UPLOADED' as const,
            title: 'Nueva foto del partido',
            body: `${uploaderName} ha subido una foto.`,
            metadata: {
              photoId: created.id,
              matchKind: input.kind,
              matchId: input.matchId,
            },
          })),
        })
        .catch((err) => {
          logger().warn({ err, photoId: created.id }, 'match-photo.upload-notify-failed');
        });
    }

    return created;
  },

  async delete(photoId: string, userId: string): Promise<void> {
    const photo = await prisma.matchPhoto.findUnique({
      where: { id: photoId },
      select: {
        id: true,
        uploadedByUserId: true,
        blobUrl: true,
        matchId: true,
        independentMatchId: true,
      },
    });
    if (!photo) throw new NotFoundError('PHOTO_NOT_FOUND', 'Foto no encontrada.');
    const viewer = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const isOwner = photo.uploadedByUserId === userId;
    const isSuperAdmin = viewer?.role === 'SUPER_ADMIN';
    if (!isOwner && !isSuperAdmin) {
      throw new AuthorizationError(
        'NOT_PHOTO_OWNER',
        'Solo el autor o un administrador pueden borrar la foto.',
      );
    }

    // Drop the DB row first (commits the delete intent + cascades the
    // comments/likes via FK), then best-effort delete the underlying blob
    // so the public URL can no longer be accessed by anyone who saved it.
    // If the blob delete fails (e.g. Vercel Blob outage) we log and move
    // on — the row is already gone and re-trying with a periodic janitor
    // is the future-work option.
    await prisma.matchPhoto.delete({ where: { id: photoId } });
    await del(photo.blobUrl).catch((err) => {
      logger().warn({ err, photoId, blobUrl: photo.blobUrl }, 'match-photo.blob-delete-failed');
    });
  },

  async addComment(photoId: string, userId: string, body: string): Promise<{ id: string }> {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new DomainError('EMPTY_COMMENT', 'El comentario no puede estar vacío.');
    }
    if (trimmed.length > MAX_COMMENT_BODY) {
      throw new DomainError(
        'COMMENT_TOO_LONG',
        `El comentario no puede superar ${MAX_COMMENT_BODY} caracteres.`,
      );
    }

    const photo = await prisma.matchPhoto.findUnique({
      where: { id: photoId },
      select: {
        id: true,
        uploadedByUserId: true,
        matchId: true,
        independentMatchId: true,
      },
    });
    if (!photo) throw new NotFoundError('PHOTO_NOT_FOUND', 'Foto no encontrada.');
    const matchId = photo.matchId ?? photo.independentMatchId;
    const kind: MatchKind = photo.matchId !== null ? 'league' : 'independent';
    if (!matchId) throw new DomainError('PHOTO_ORPHAN', 'Foto sin partido asociado.');
    const participantIds = await assertParticipant(matchId, kind, userId);

    const created = await prisma.matchPhotoComment.create({
      data: { photoId, userId, body: trimmed },
      select: { id: true },
    });

    // Resolve mentions against the participant roster only — we never notify
    // a user outside the match. The participant list is also the upper bound
    // on who could legitimately be tagged.
    const candidates = extractMentionCandidates(trimmed);
    const mentionedIds = new Set<string>();
    if (candidates.length > 0 && participantIds.length > 0) {
      const participants = await prisma.user.findMany({
        where: { id: { in: participantIds } },
        select: { id: true, name: true },
      });
      for (const id of resolveMentionsToUserIds(candidates, participants)) {
        if (id !== userId) mentionedIds.add(id);
      }
    }

    const author = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const authorName = author?.name ?? 'Un compañero';

    // Two notification kinds:
    //  - MATCH_PHOTO_COMMENT: only to the photo's uploader if they are not
    //    the author themselves and not already mentioned (to avoid double).
    //  - MATCH_PHOTO_MENTION: one per mentioned participant.
    const baseMetadata = { photoId, commentId: created.id, matchKind: kind, matchId };
    const notifyUploader =
      photo.uploadedByUserId !== userId && !mentionedIds.has(photo.uploadedByUserId);

    await prisma.notification
      .createMany({
        data: [
          ...(notifyUploader
            ? [
                {
                  userId: photo.uploadedByUserId,
                  type: 'MATCH_PHOTO_COMMENT' as const,
                  title: 'Nuevo comentario en tu foto',
                  body: `${authorName} ha comentado tu foto.`,
                  metadata: baseMetadata,
                },
              ]
            : []),
          ...Array.from(mentionedIds).map((id) => ({
            userId: id,
            type: 'MATCH_PHOTO_MENTION' as const,
            title: 'Te han mencionado en una foto',
            body: `${authorName} te ha mencionado en un comentario.`,
            metadata: baseMetadata,
          })),
        ],
      })
      .catch((err) => {
        logger().warn({ err, photoId, commentId: created.id }, 'match-photo.comment-notify-failed');
      });

    return created;
  },

  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await prisma.matchPhotoComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        userId: true,
        photo: {
          select: { matchId: true, independentMatchId: true },
        },
      },
    });
    if (!comment) throw new NotFoundError('COMMENT_NOT_FOUND', 'Comentario no encontrado.');

    // Re-assert participant of the parent match. A user who left their
    // team after authoring a comment should not still be able to mutate
    // the photo conversation. SUPER_ADMIN bypasses this since they are
    // the moderation channel.
    const viewer = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const isSuperAdmin = viewer?.role === 'SUPER_ADMIN';
    if (!isSuperAdmin) {
      const matchId = comment.photo.matchId ?? comment.photo.independentMatchId;
      const kind: MatchKind = comment.photo.matchId !== null ? 'league' : 'independent';
      if (!matchId) throw new DomainError('PHOTO_ORPHAN', 'Foto sin partido asociado.');
      await assertParticipant(matchId, kind, userId);
    }

    const isAuthor = comment.userId === userId;
    if (!isAuthor && !isSuperAdmin) {
      throw new AuthorizationError(
        'NOT_COMMENT_AUTHOR',
        'Solo el autor o un administrador pueden borrar el comentario.',
      );
    }
    await prisma.matchPhotoComment.delete({ where: { id: commentId } });
  },

  async toggleLike(photoId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const photo = await prisma.matchPhoto.findUnique({
      where: { id: photoId },
      select: { id: true, matchId: true, independentMatchId: true },
    });
    if (!photo) throw new NotFoundError('PHOTO_NOT_FOUND', 'Foto no encontrada.');
    const matchId = photo.matchId ?? photo.independentMatchId;
    const kind: MatchKind = photo.matchId !== null ? 'league' : 'independent';
    if (!matchId) throw new DomainError('PHOTO_ORPHAN', 'Foto sin partido asociado.');
    await assertParticipant(matchId, kind, userId);

    // Toggle is idempotent: deleteMany + count check tells us which way the
    // toggle went (deleted = had a like; created = didn't). The follow-up
    // count is read INSIDE the transaction so concurrent toggles by other
    // users can't race this read against the write we just performed —
    // the returned `likeCount` matches the post-write state of THIS toggle.
    return prisma.$transaction(async (tx) => {
      const removed = await tx.matchPhotoLike.deleteMany({
        where: { photoId, userId },
      });
      if (removed.count > 0) {
        const likeCount = await tx.matchPhotoLike.count({ where: { photoId } });
        return { liked: false, likeCount };
      }
      await tx.matchPhotoLike.create({ data: { photoId, userId } });
      const likeCount = await tx.matchPhotoLike.count({ where: { photoId } });
      return { liked: true, likeCount };
    });
  },

  /** Exposed for the upload route to authorise direct-to-Blob uploads. */
  assertParticipantForUpload(matchId: string, kind: MatchKind, userId: string): Promise<string[]> {
    return assertParticipant(matchId, kind, userId);
  },
} as const;

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_PHOTO_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
export { MAX_PHOTOS_PER_MATCH, MAX_COMMENT_BODY };
