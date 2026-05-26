'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteLeagueAction } from '../actions';

// Botón rojo "Eliminar" inline en la card de una competición. Solo se monta si
// el viewer es SUPER_ADMIN (control en el server). Abre un modal de confirmación
// para evitar borrados accidentales — la acción es destructiva (cascade a
// registrations, matches, results, etc.) e irreversible.

interface Props {
  leagueId: string;
  leagueName: string;
}

export function LeagueCardActions({ leagueId, leagueName }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteLeagueAction(leagueId);
      if (res && 'error' in res && res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // El botón vive sobre una <Link>: hay que cortar la navegación al
          // detalle al hacer click en "Eliminar".
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-white/90 text-rose-600 hover:bg-rose-50 border border-rose-200 shadow-sm transition-colors"
        aria-label={`Eliminar ${leagueName}`}
        title="Eliminar competición"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-brand-navy">¿Eliminar competición?</h3>
            <p className="text-sm text-slate-600">
              Vas a eliminar <strong>{leagueName}</strong> de forma permanente, junto con todos sus
              partidos, resultados, crónicas e inscripciones. Esta acción no se puede deshacer.
            </p>
            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="px-3 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="px-3 py-2 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 disabled:opacity-50"
              >
                {pending ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
