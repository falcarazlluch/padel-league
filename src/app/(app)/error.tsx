'use client';

import { useEffect, useState } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Visible in browser console — easier to copy/paste than the on-screen detail.
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl border border-red-200 shadow-sm p-6 space-y-4">
      <div>
        <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-1">Error</p>
        <h1 className="text-xl font-extrabold text-brand-navy">Algo ha fallado al cargar esta página.</h1>
        <p className="text-sm text-slate-500 mt-1">
          Vuelve a intentarlo. Si el error persiste, revisa el detalle técnico para reportarlo.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 bg-brand-navy text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
        >
          Reintentar
        </button>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
        >
          {showDetails ? 'Ocultar detalle' : 'Ver detalle'}
        </button>
      </div>

      {showDetails && (
        <pre className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          {error.stack ? `\n\n${error.stack}` : ''}
        </pre>
      )}
    </div>
  );
}
