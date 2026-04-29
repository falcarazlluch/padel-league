'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { TeamLogo } from '@/modules/teams/presentation/team-logo';

const MAX_BYTES = 200 * 1024;

export function LogoUploader({
  teamId,
  teamName,
  currentLogoUrl,
}: {
  teamId: string;
  teamName: string;
  currentLogoUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setError(`Imagen demasiado grande (máx ${Math.round(MAX_BYTES / 1024)} KB).`);
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
      await upload(`team-logos/${teamId}-${random}.${ext}`, file, {
        access: 'public',
        handleUploadUrl: '/api/team-logo/upload',
      });
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

  return (
    <div className="flex items-center gap-4">
      <TeamLogo url={currentLogoUrl} name={teamName} size="lg" />
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Logo</label>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onChange}
          disabled={pending}
          className="text-xs text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:bg-white file:border file:border-slate-200 file:text-slate-700 file:font-semibold file:rounded-lg file:hover:bg-slate-50 file:cursor-pointer file:transition-colors"
        />
        <p className="text-[11px] text-slate-400">PNG, JPG o WebP · máx 200&nbsp;KB</p>
        {pending && <p className="text-xs text-slate-500">Subiendo…</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
