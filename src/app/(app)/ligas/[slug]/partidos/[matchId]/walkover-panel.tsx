'use client';

import { useActionState, useState } from 'react';
import { adminForfeitMatchAction } from '../actions';

// Panel admin: declara un ganador por walkover (no presentado / decisión
// admin). Disponible en match detail solo si el match no está finalizado,
// caller es admin de la liga y ambas parejas están asignadas.
export function WalkoverPanel({
  matchId,
  teamA,
  teamB,
}: {
  matchId: string;
  teamA: { id: string; name: string };
  teamB: { id: string; name: string };
}) {
  const [state, formAction, pending] = useActionState<{ error?: string; success?: true } | null, FormData>(
    adminForfeitMatchAction,
    null,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors"
      >
        Declarar walkover (admin)
      </button>
    );
  }

  return (
    <form action={formAction} className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-xs font-bold text-rose-800 uppercase tracking-widest mb-1">Walkover / no presentado</p>
        <p className="text-xs text-rose-900">
          Declara un ganador sin jugar. Queda registrado en el audit log. Si es match de bracket,
          el ganador avanza automáticamente al siguiente cruce.
        </p>
      </div>
      <input type="hidden" name="matchId" value={matchId} />
      <div>
        <label htmlFor="winnerTeamId" className="block text-xs font-medium text-slate-700 mb-1">
          Pareja ganadora
        </label>
        <select
          id="winnerTeamId"
          name="winnerTeamId"
          required
          defaultValue=""
          className="w-full px-2 py-1.5 bg-white border border-rose-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
        >
          <option value="" disabled>Elige la pareja que se lleva el partido…</option>
          <option value={teamA.id}>{teamA.name}</option>
          <option value={teamB.id}>{teamB.name}</option>
        </select>
      </div>
      <div>
        <label htmlFor="reason" className="block text-xs font-medium text-slate-700 mb-1">Motivo</label>
        <textarea
          id="reason"
          name="reason"
          rows={2}
          required
          minLength={5}
          placeholder="Ej: La pareja rival no se presentó a la hora acordada."
          className="w-full px-2 py-1.5 bg-white border border-rose-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 bg-gradient-to-br from-rose-500 to-red-600 text-white text-xs font-bold rounded-lg shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {pending ? 'Guardando…' : 'Confirmar walkover'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
      {state?.error && (
        <p className="text-xs text-rose-700 bg-white border border-rose-200 rounded-lg px-2 py-1">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
          Walkover declarado. Recarga para ver el cambio.
        </p>
      )}
    </form>
  );
}
