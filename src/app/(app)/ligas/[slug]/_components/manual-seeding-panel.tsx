'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reorderSeedAction } from '../../actions';

type SeedRow = { registrationId: string; teamId: string; teamName: string };

// Panel admin para reordenar la siembra manual del bracket en un torneo
// MANUAL en estado DRAFT. Render: lista de parejas inscritas en su orden
// actual con un ↑↓ por fila. La acción reasigna seedOrder a todas para
// mantener una numeración contigua.
export function ManualSeedingPanel({ rows }: { rows: SeedRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const move = (registrationId: string, direction: 'UP' | 'DOWN') => {
    if (pending) return;
    setError(null);
    setPendingId(registrationId);
    startTransition(async () => {
      const res = await reorderSeedAction(registrationId, direction);
      setPendingId(null);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 text-sm text-slate-500">
        Aún no hay parejas inscritas. Cuando lo estén podrás ordenarlas aquí.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 space-y-3">
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Siembra del bracket (manual)</p>
        <p className="text-xs text-slate-500 mt-1">
          Ordena las parejas como quieras que entren al cuadro. La pareja en la posición 1 es la
          mejor seed. Solo se puede modificar antes de activar el torneo.
        </p>
      </div>
      <ol className="space-y-1.5">
        {rows.map((r, i) => {
          const busy = pendingId === r.registrationId;
          return (
            <li
              key={r.registrationId}
              className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2"
            >
              <span className="w-6 text-center text-xs font-bold text-slate-500">{i + 1}</span>
              <span className="flex-1 text-sm text-slate-800 truncate">{r.teamName}</span>
              <button
                type="button"
                onClick={() => move(r.registrationId, 'UP')}
                disabled={i === 0 || busy}
                aria-label="Subir"
                className="text-sm text-slate-500 hover:text-slate-800 disabled:opacity-30 px-1"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(r.registrationId, 'DOWN')}
                disabled={i === rows.length - 1 || busy}
                aria-label="Bajar"
                className="text-sm text-slate-500 hover:text-slate-800 disabled:opacity-30 px-1"
              >
                ↓
              </button>
            </li>
          );
        })}
      </ol>
      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>
      )}
    </div>
  );
}
