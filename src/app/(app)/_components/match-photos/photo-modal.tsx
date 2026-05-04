'use client';

import { useEffect, useState, useTransition } from 'react';
import type { PhotoCommentEntry, PhotoSummary } from '@/modules/match-photos';
import {
  addMatchPhotoCommentAction,
  deleteMatchPhotoCommentAction,
} from '@/app/(app)/_actions/match-photos';
import { UserAvatar } from '@/modules/users/presentation/user-avatar';

interface Props {
  photo: PhotoSummary;
  currentUserId: string;
  onClose: () => void;
  onLikeToggle: () => void;
  onDelete: (() => void) | null;
  onCommentChange: () => void;
}

const MAX_BODY = 500;

export function PhotoModal({ photo, currentUserId, onClose, onLikeToggle, onDelete, onCommentChange }: Props) {
  const [comments, setComments] = useState<PhotoCommentEntry[] | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    let cancelled = false;
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
  }, [photo.id]);

  // Close on Escape — keeps the lightbox keyboard-friendly.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
      // Re-fetch comments inline so the modal reflects the new entry. Guard
      // against the endpoint returning a non-2xx (e.g. session expired
      // mid-flow): in that case the optimistic refresh upstream will pick
      // it up — we just don't blow away the existing list.
      try {
        const r = await fetch(`/api/match-photos/${photo.id}/detail`);
        if (r.ok) {
          const reload = (await r.json()) as { comments?: PhotoCommentEntry[] };
          if (Array.isArray(reload.comments)) setComments(reload.comments);
        }
      } catch {
        // Swallow — comment was saved server-side; the modal can stay stale.
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 bg-slate-900 flex items-center justify-center min-h-[280px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.blobUrl}
            alt={`Foto subida por ${photo.uploaderName}`}
            className="max-h-[90vh] w-full object-contain"
          />
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
              onClick={onLikeToggle}
              className={`flex items-center gap-1 font-semibold ${photo.viewerLiked ? 'text-rose-600' : 'text-slate-500 hover:text-rose-500'} transition-colors`}
            >
              {photo.viewerLiked ? '♥' : '♡'} {photo.likeCount}
            </button>
            <span className="text-slate-400 text-xs">{photo.commentCount} comentarios</span>
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
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
