'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { materializeTournamentBracketAction } from '../../actions';

// Botón visible al admin de un torneo con fase de grupos terminada y bracket
// aún sin generar. Pulsando se calcula el cuadro Oro+Plata a partir de las
// standings de cada grupo.
export function MaterializeBracketButton({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (pending) return;
    if (
      !confirm(
        '¿Generar el bracket ahora? Se calculan los clasificados a partir de las standings de cada grupo. Esta acción es irreversible.',
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await materializeTournamentBracketAction(leagueId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
      <div>
        <p className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-1">Fase de grupos terminada</p>
        <p className="text-sm text-amber-900">
          Genera el bracket Oro + Plata con los clasificados de cada grupo.
        </p>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="px-4 py-2.5 bg-gradient-to-br from-amber-500 to-orange-600 text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {pending ? 'Generando…' : 'Generar bracket'}
      </button>
      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>
      )}
    </div>
  );
}
