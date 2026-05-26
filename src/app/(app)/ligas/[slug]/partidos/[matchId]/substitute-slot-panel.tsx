'use client';

import { useActionState } from 'react';
import { substituteBracketSlotAction } from '../../../actions';

type AvailableTeam = { id: string; name: string };

// Panel admin: aparece solo en match detail page cuando el match es bracket
// R0 y aún no se ha jugado. Permite reemplazar teamA o teamB por otra pareja
// inscrita pero que no está ya en el bracket.
export function SubstituteSlotPanel({
  matchId,
  teamAName,
  teamBName,
  availableTeams,
}: {
  matchId: string;
  teamAName: string | null;
  teamBName: string | null;
  availableTeams: AvailableTeam[];
}) {
  const [state, formAction, pending] = useActionState<{ error?: string; success?: true } | null, FormData>(
    substituteBracketSlotAction,
    null,
  );

  if (availableTeams.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">Sustituir pareja (admin)</p>
        <p>No hay parejas inscritas disponibles para sustituir (todas están ya en el bracket).</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-1">Sustituir pareja (admin)</p>
        <p className="text-xs text-amber-900">
          Cambia uno de los slots iniciales del bracket por otra pareja inscrita. Solo permitido si el partido aún no se ha jugado.
        </p>
      </div>
      <input type="hidden" name="matchId" value={matchId} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label htmlFor="slot" className="block text-xs font-medium text-slate-600 mb-1">Slot</label>
          <select
            id="slot"
            name="slot"
            defaultValue="A"
            className="w-full px-2 py-1.5 bg-white border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="A">A — {teamAName ?? '—'}</option>
            <option value="B">B — {teamBName ?? '—'}</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="newTeamId" className="block text-xs font-medium text-slate-600 mb-1">Pareja nueva</label>
          <select
            id="newTeamId"
            name="newTeamId"
            required
            defaultValue=""
            className="w-full px-2 py-1.5 bg-white border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="" disabled>Elige una pareja…</option>
            {availableTeams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="px-3 py-1.5 bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs font-bold rounded-lg shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {pending ? 'Sustituyendo…' : 'Sustituir'}
      </button>
      {state?.error && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
          Sustitución hecha. Recarga la página para ver el cambio.
        </p>
      )}
    </form>
  );
}
