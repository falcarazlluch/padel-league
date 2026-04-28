'use client';
import { useActionState } from 'react';
import { respondToChallenge } from '../actions';

type ActionResult = { error: string } | { success: true } | null;

export function ChallengePanel({ matchId, challengerTeamName }: { matchId: string; challengerTeamName: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(respondToChallenge, null);
  if (state && 'success' in state) return <p className="text-sm text-green-600 font-medium">Respuesta enviada.</p>;
  return (
    <div className="bg-gradient-to-r from-blue-50 to-sky-100 border border-sky-200 rounded-2xl p-4">
      <p className="text-sm text-brand-navy mb-3"><strong>{challengerTeamName}</strong> os reta a un partido amistoso.</p>
      {state && 'error' in state && <p className="text-sm text-red-600 mb-2">{state.error}</p>}
      <div className="flex gap-2">
        <form action={action}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="response" value="accept" />
          <button type="submit" disabled={pending}
            className="px-4 py-2 bg-gradient-to-br from-emerald-500 to-green-600 text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity">Aceptar reto</button>
        </form>
        <form action={action}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="response" value="reject" />
          <button type="submit" disabled={pending}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors">Rechazar</button>
        </form>
      </div>
    </div>
  );
}
