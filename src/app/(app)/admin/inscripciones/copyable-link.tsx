'use client';

import { useState } from 'react';

/** Read-only URL field with a copy button. Falls back to select-on-focus when
 *  the clipboard API is unavailable (insecure origin, in-app browsers). */
export function CopyableLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the input stays selectable as the fallback */
    }
  };

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={label}
        className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-600"
      />
      <button
        type="button"
        onClick={() => void copy()}
        className="px-3 py-2 bg-brand-navy text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity shrink-0"
      >
        {copied ? '¡Copiado!' : 'Copiar'}
      </button>
    </div>
  );
}
