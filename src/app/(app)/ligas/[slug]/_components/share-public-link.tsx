'use client';

import { useState } from 'react';

// Botón "Compartir enlace público". Pone en el portapapeles la URL pública
// /p/{slug} de la competición. Si el navegador no permite acceso al
// clipboard (HTTP no-localhost, iOS old, etc.) se muestra el enlace listo
// para copiar manualmente.

interface Props {
  slug: string;
}

export function SharePublicLink({ slug }: Props) {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  async function handleClick() {
    const url = `${window.location.origin}/p/${slug}`;
    try {
      // navigator.share es la API "Web Share" nativa en móviles — abre el
      // sheet del SO, mucho más útil que solo copiar. En desktop suele estar
      // ausente, así que caemos al clipboard.
      const nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav && typeof nav.share === 'function') {
        await nav.share({ title: 'Competición Padel League', url });
      } else if (nav?.clipboard) {
        await nav.clipboard.writeText(url);
      } else {
        setFallbackUrl(url);
        return;
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFallbackUrl(url);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="text-sm px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors inline-flex items-center gap-1.5"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        {copied ? '¡Copiado!' : 'Compartir'}
      </button>
      {fallbackUrl && (
        <p className="text-xs text-slate-500 mt-1">
          Copia el enlace:{' '}
          <a href={fallbackUrl} className="underline text-brand-blue break-all">
            {fallbackUrl}
          </a>
        </p>
      )}
    </>
  );
}
