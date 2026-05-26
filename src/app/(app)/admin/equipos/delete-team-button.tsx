'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteTeamAction } from './actions';

// Borrar equipo desde el admin listado. El backend rechaza la operación si el
// equipo tiene matches asociados (FK Restrict) — la modal muestra el error
// para que el admin entienda qué tiene que limpiar antes.

interface Props {
  teamId: string;
  teamName: string;
  hasMatches: boolean;
  hasActiveRegistrations: boolean;
}

export function DeleteTeamButton({
  teamId,
  teamName,
  hasMatches,
  hasActiveRegistrations,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteTeamAction(teamId);
      if (res.error) {
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
        onClick={() => setOpen(true)}
        disabled={hasMatches}
        title={
          hasMatches
            ? 'No puedes eliminar un equipo con partidos asociados.'
            : 'Eliminar equipo'
        }
        className="text-xs px-3 py-1.5 bg-white border border-rose-200 text-rose-600 font-semibold rounded-lg hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Eliminar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-brand-navy">¿Eliminar equipo?</h3>
            <p className="text-sm text-slate-600">
              Vas a eliminar <strong>{teamName}</strong>. Se borrarán también sus miembros,
              invitaciones e inscripciones (en estado borrador o retiradas).
            </p>
            {hasActiveRegistrations && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                ⚠️ Este equipo tiene inscripciones activas. Se eliminarán todas.
              </p>
            )}
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
