'use client';

import { useEffect, useState, useTransition } from 'react';
import type { PhotoCommentEntry, PhotoSummary } from '@/modules/match-photos';
import {
  addMatchPhotoCommentAction,
  deleteMatchPhotoCommentAction,
} from '@/app/(app)/_actions/match-photos';
import { UserAvatar } from '@/modules/users/presentation/user-avatar';

interface Props {
  /** All photos in the same match — used to compute prev/next navigation. */
  photos: PhotoSummary[];
  currentPhotoId: string;
  currentUserId: string;
  onClose: () => void;
  onNavigate: (photoId: string) => void;
  onLikeToggle: (photoId: string) => void;
  onDelete: ((photoId: string) => void) | null;
  onCommentChange: () => void;
}

const MAX_BODY = 500;

export function PhotoModal({
  photos,
  currentPhotoId,
  currentUserId,
  onClose,
  onNavigate,
  onLikeToggle,
  onDelete,
  onCommentChange,
}: Props) {
  const index = photos.findIndex((p) => p.id === currentPhotoId);
  const photo = index >= 0 ? photos[index] : null;
  const prev = index > 0 ? photos[index - 1] : null;
  const next = index >= 0 && index < photos.length - 1 ? photos[index + 1] : null;

  const [comments, setComments] = useState<PhotoCommentEntry[] | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  // Re-fetch comments whenever the focused photo changes (also covers the
  // initial open). Keep the previous comment list visible while loading to
  // avoid a flash of "Cargando…" on a fast carousel swipe.
  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    setError(null);
    setBody('');
    void fetch(`/api/match-photos/${photo.id}/detail`)
      .then(async (r) => {
        if (!r.ok) throw new Error('No se pudieron cargar los comentarios.');
        const data = (await r.json()) as { comments: PhotoCommentEntry[] };
        if (!cancelled) setComments(data.comments);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [photo?.id]);

  // Keyboard nav: Esc closes, ← and → step through the carousel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft' && prev) {
        e.preventDefault();
        onNavigate(prev.id);
        return;
      }
      if (e.key === 'ArrowRight' && next) {
        e.preventDefault();
        onNavigate(next.id);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onNavigate, prev, next]);

  if (!photo) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    if (trimmed.length > MAX_BODY) {
      setError(`Máximo ${MAX_BODY} caracteres.`);
      return;
    }
    startSubmit(async () => {
      const result = await addMatchPhotoCommentAction({ photoId: photo.id, body: trimmed });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setBody('');
      try {
        const r = await fetch(`/api/match-photos/${photo.id}/detail`);
        if (r.ok) {
          const reload = (await r.json()) as { comments?: PhotoCommentEntry[] };
          if (Array.isArray(reload.comments)) setComments(reload.comments);
        }
      } catch {
        // Comment was saved server-side; the modal can stay stale.
      }
      onCommentChange();
    });
  };

  const onDeleteComment = (commentId: string) => {
    if (!confirm('¿Borrar este comentario?')) return;
    void deleteMatchPhotoCommentAction(commentId).then((result) => {
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setComments((curr) => curr?.filter((c) => c.id !== commentId) ?? null);
      onCommentChange();
    });
  };

  const total = photos.length;
  const positionLabel = total > 1 ? `${index + 1} / ${total}` : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 bg-slate-900 flex items-center justify-center min-h-[280px] relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.blobUrl}
            alt={`Foto subida por ${photo.uploaderName}`}
            className="max-h-[90vh] w-full object-contain"
          />

          {prev && (
            <button
              type="button"
              onClick={() => onNavigate(prev.id)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white text-xl transition-colors"
              aria-label="Foto anterior"
            >
              ‹
            </button>
          )}
          {next && (
            <button
              type="button"
              onClick={() => onNavigate(next.id)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white text-xl transition-colors"
              aria-label="Foto siguiente"
            >
              ›
            </button>
          )}
          {positionLabel && (
            <span className="absolute top-2 left-1/2 -translate-x-1/2 text-xs text-white bg-black/50 rounded-full px-2 py-0.5">
              {positionLabel}
            </span>
          )}
        </div>

        <aside className="md:w-80 flex flex-col border-t md:border-t-0 md:border-l border-slate-200 max-h-[90vh]">
          <header className="flex items-center justify-between gap-2 p-3 border-b border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <UserAvatar url={photo.uploaderAvatarUrl} name={photo.uploaderName} size="sm" />
              <span className="text-sm font-semibold text-brand-navy truncate">{photo.uploaderName}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1"
              aria-label="Cerrar"
            >
              ×
            </button>
          </header>

          <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 text-sm">
            <button
              type="button"
              onClick={() => onLikeToggle(photo.id)}
              className={`flex items-center gap-1 font-semibold ${photo.viewerLiked ? 'text-rose-600' : 'text-slate-500 hover:text-rose-500'} transition-colors`}
            >
              {photo.viewerLiked ? '♥' : '♡'} {photo.likeCount}
            </button>
            <span className="text-slate-400 text-xs">{photo.commentCount} comentarios</span>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(photo.id)}
                className="ml-auto text-xs text-rose-500 hover:text-rose-700"
              >
                Borrar foto
              </button>
            )}
          </div>

          <ul className="flex-1 overflow-y-auto p-3 space-y-3">
            {comments === null && !error && <p className="text-xs text-slate-400">Cargando comentarios…</p>}
            {comments && comments.length === 0 && (
              <p className="text-xs text-slate-400">Aún no hay comentarios. Sé el primero.</p>
            )}
            {comments?.map((c) => (
              <li key={c.id} className="flex gap-2">
                <UserAvatar url={c.authorAvatarUrl} name={c.authorName} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold text-brand-navy truncate">{c.authorName}</p>
                    {(c.authorId === currentUserId || c.canDelete) && (
                      <button
                        type="button"
                        onClick={() => onDeleteComment(c.id)}
                        className="text-[11px] text-rose-500 hover:text-rose-700"
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-line break-words">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <form onSubmit={onSubmit} className="border-t border-slate-100 p-3 space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_BODY}
              rows={2}
              placeholder="Escribe un comentario… usa @nombre para mencionar a un compañero."
              className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white"
            />
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">{body.length}/{MAX_BODY}</span>
              <button
                type="submit"
                disabled={submitting || body.trim().length === 0}
                className="text-xs px-3 py-1.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {submitting ? 'Enviando…' : 'Comentar'}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
