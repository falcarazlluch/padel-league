'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { UserAvatar } from '@/modules/users/presentation/user-avatar';
import { setAvatarAction, removeAvatarAction } from './actions';

const MAX_BYTES = 2 * 1024 * 1024;

interface Props {
  userId: string;
  userName: string;
  currentAvatarUrl: string | null;
}

export function AvatarUploader({ userId, userName, currentAvatarUrl }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setError(`Imagen demasiado grande (máx ${Math.round(MAX_BYTES / (1024 * 1024))} MB).`);
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Formato no soportado (usa PNG, JPG o WebP).');
      return;
    }
    setPending(true);
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const random = Math.random().toString(36).slice(2, 10);
      const result = await upload(`avatars/${userId}-${random}.${ext}`, file, {
        access: 'public',
        handleUploadUrl: '/api/avatar/upload',
      });
      const persist = await setAvatarAction(result.url);
      if (persist.error) {
        setError(persist.error);
        return;
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo subir la imagen.');
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    void handleUpload(file);
  };

  const handleRemove = async () => {
    if (!confirm('¿Quitar la foto de perfil?')) return;
    setError(null);
    setPending(true);
    try {
      const res = await removeAvatarAction();
      if (res.error) setError(res.error);
      else router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <UserAvatar url={currentAvatarUrl} name={userName} size="lg" />
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Foto de perfil</label>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onChange}
          disabled={pending}
          className="text-xs text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:bg-white file:border file:border-slate-200 file:text-slate-700 file:font-semibold file:rounded-lg file:hover:bg-slate-50 file:cursor-pointer file:transition-colors"
        />
        <p className="text-[11px] text-slate-400">PNG, JPG o WebP · máx 2&nbsp;MB</p>
        {currentAvatarUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="self-start text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50 transition-colors"
          >
            Quitar foto
          </button>
        )}
        {pending && <p className="text-xs text-slate-500">Procesando…</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
