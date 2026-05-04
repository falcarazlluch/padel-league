'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import type { MatchKind, PhotoSummary } from '@/modules/match-photos';
import {
  persistMatchPhotoAction,
  deleteMatchPhotoAction,
  toggleMatchPhotoLikeAction,
} from '@/app/(app)/_actions/match-photos';
import { UserAvatar } from '@/modules/users/presentation/user-avatar';
import { PhotoModal } from './photo-modal';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

interface Props {
  matchId: string;
  kind: MatchKind;
  /** Required when kind === 'league' — used to revalidate the right page after persist. */
  leagueSlug?: string;
  photos: PhotoSummary[];
  /** Only participants can upload — drives the upload button visibility. */
  canUpload: boolean;
  currentUserId: string;
}

export function PhotosSection({ matchId, kind, leagueSlug, photos: initial, canUpload, currentUserId }: Props) {
  const router = useRouter();
  const [photos, setPhotos] = useState<PhotoSummary[]>(initial);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Re-sync local state when the parent re-renders with fresh data (e.g.
  // after `router.refresh()` post-upload). Without this the photos prop
  // updates but the state stays at the original snapshot, so the new photo
  // never appears until a hard navigation.
  useEffect(() => {
    setPhotos(initial);
  }, [initial]);

  // Auto-dismiss the success banner so it doesn't stick around.
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [success]);

  const onUpload = async (file: File) => {
    setError(null);
    setSuccess(null);
    if (file.size > MAX_BYTES) {
      setError(`Imagen demasiado grande (máx ${Math.round(MAX_BYTES / (1024 * 1024))} MB).`);
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      setError('Formato no soportado (PNG, JPG o WebP).');
      return;
    }
    setPending(true);
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const random = Math.random().toString(36).slice(2, 12);
      const blob = await upload(`match-photos/${kind}/${matchId}/${random}.${ext}`, file, {
        access: 'public',
        handleUploadUrl: '/api/match-photos/upload',
      });
      const persist = await persistMatchPhotoAction({
        matchId,
        kind,
        leagueSlug,
        blobUrl: blob.url,
      });
      if ('error' in persist) {
        setError(persist.error);
        return;
      }
      setSuccess('Foto subida con éxito.');
      // Trigger a server re-render so the new row is fetched with full
      // metadata (uploader, counts, latestComment). The useEffect above
      // syncs `photos` from the refreshed `initial` prop.
      router.refresh();
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo subir la foto.');
    } finally {
      setPending(false);
    }
  };

  const onLike = async (photoId: string) => {
    const previous = photos.find((p) => p.id === photoId);
    if (!previous) return;
    setPhotos((curr) =>
      curr.map((p) =>
        p.id === photoId
          ? { ...p, viewerLiked: !p.viewerLiked, likeCount: p.likeCount + (p.viewerLiked ? -1 : 1) }
          : p,
      ),
    );
    const result = await toggleMatchPhotoLikeAction(photoId);
    if ('error' in result) {
      setPhotos((curr) =>
        curr.map((p) =>
          p.id === photoId ? { ...p, viewerLiked: previous.viewerLiked, likeCount: previous.likeCount } : p,
        ),
      );
      setError(result.error);
      return;
    }
    setPhotos((curr) =>
      curr.map((p) => (p.id === photoId ? { ...p, viewerLiked: result.liked, likeCount: result.likeCount } : p)),
    );
  };

  const onDelete = async (photoId: string) => {
    if (!confirm('¿Borrar esta foto? Esta acción es irreversible.')) return;
    const result = await deleteMatchPhotoAction(photoId);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setPhotos((curr) => curr.filter((p) => p.id !== photoId));
    setOpenPhotoId(null);
    router.refresh();
  };

  const openPhoto = openPhotoId ? photos.find((p) => p.id === openPhotoId) ?? null : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-brand-navy">Fotos del partido</h2>
        {canUpload && (
          <label className="text-xs px-3 py-1.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity cursor-pointer">
            {pending ? 'Subiendo…' : '+ Subir foto'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={pending}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.currentTarget.value = '';
              }}
            />
          </label>
        )}
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-3 py-2">
          {success}
        </div>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {photos.length === 0 ? (
        <p className="text-sm text-slate-400">
          Aún no hay fotos del partido. {canUpload && 'Sube la primera para empezar a comentar.'}
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {photos.map((p) => (
            <li
              key={p.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col"
            >
              <button
                type="button"
                onClick={() => setOpenPhotoId(p.id)}
                className="block w-full text-left"
                aria-label="Abrir foto"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.blobUrl}
                  alt={`Foto subida por ${p.uploaderName}`}
                  className="w-full aspect-square object-cover hover:opacity-95 transition-opacity"
                  loading="lazy"
                />
              </button>

              <div className="px-3 pt-2 pb-1 flex items-center gap-2 text-xs text-slate-500">
                <UserAvatar url={p.uploaderAvatarUrl} name={p.uploaderName} size="sm" />
                <span className="font-semibold text-brand-navy truncate">{p.uploaderName}</span>
                <span className="ml-auto text-[11px] text-slate-400">
                  {p.createdAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </span>
              </div>

              <div className="px-3 py-2 flex items-center gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => void onLike(p.id)}
                  aria-pressed={p.viewerLiked}
                  className={`flex items-center gap-1 text-sm font-semibold transition-colors ${p.viewerLiked ? 'text-rose-600' : 'text-slate-500 hover:text-rose-500'}`}
                >
                  {p.viewerLiked ? '♥' : '♡'} {p.likeCount}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenPhotoId(p.id)}
                  className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  💬 {p.commentCount}
                </button>
              </div>

              {p.latestComment && (
                <button
                  type="button"
                  onClick={() => setOpenPhotoId(p.id)}
                  className="text-left px-3 pb-2 -mt-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <span className="font-semibold text-brand-navy">{p.latestComment.authorName}: </span>
                  <span className="line-clamp-2">{p.latestComment.body}</span>
                  {p.commentCount > 1 && (
                    <span className="block mt-0.5 text-[11px] text-slate-400">
                      Ver los {p.commentCount} comentarios
                    </span>
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {openPhoto && (
        <PhotoModal
          photo={openPhoto}
          currentUserId={currentUserId}
          onClose={() => setOpenPhotoId(null)}
          onLikeToggle={() => onLike(openPhoto.id)}
          onDelete={openPhoto.canDelete ? () => onDelete(openPhoto.id) : null}
          onCommentChange={() => router.refresh()}
        />
      )}
    </section>
  );
}
