'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { leaveTeamAction } from '../actions';

export function LeaveTeamButton({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-semibold px-4 py-2 bg-white border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-50 transition-colors"
      >
        Salir del equipo
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-start sm:flex-row sm:items-center bg-rose-50 border border-rose-200 rounded-xl p-3">
      <p className="text-sm text-slate-700 flex-1">¿Salir del equipo? Se avisará a tu compañero.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await leaveTeamAction(teamId);
              if (res.error) {
                setError(res.error);
                return;
              }
              router.push('/equipos' as Route);
            });
          }}
          disabled={pending}
          className="text-sm font-bold px-3 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Saliendo…' : 'Sí, salir'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-sm font-semibold px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
      {error && (
        <p className="text-xs text-rose-700 mt-1 sm:mt-0 sm:ml-3 w-full sm:w-auto">{error}</p>
      )}
    </div>
  );
}
