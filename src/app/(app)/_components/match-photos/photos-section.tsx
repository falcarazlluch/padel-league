'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import type { MatchKind, PhotoSummary } from '@/modules/match-photos';
import {
  persistMatchPhotoAction,
  deleteMatchPhotoAction,
  toggleMatchPhotoLikeAction,
} from '@/app/(app)/_actions/match-photos';
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

  const onUpload = async (file: File) => {
    setError(null);
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
    // Optimistic update; server action returns the authoritative count.
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

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {photos.length === 0 ? (
        <p className="text-sm text-slate-400">
          Aún no hay fotos del partido. {canUpload && 'Sube la primera para empezar a comentar.'}
        </p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((p) => (
            <li
              key={p.id}
              className="relative group bg-slate-100 rounded-2xl overflow-hidden cursor-pointer"
              onClick={() => setOpenPhotoId(p.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- blob.vercel-storage.com is allowlisted in next.config */}
              <img src={p.blobUrl} alt={`Foto subida por ${p.uploaderName}`} className="w-full aspect-square object-cover" loading="lazy" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white p-2 text-xs flex items-center justify-between">
                <span className="truncate">{p.uploaderName}</span>
                <span className="flex items-center gap-2 text-[11px]">
                  <span className={p.viewerLiked ? 'text-brand-yellow font-bold' : ''}>♥ {p.likeCount}</span>
                  <span>💬 {p.commentCount}</span>
                </span>
              </div>
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
