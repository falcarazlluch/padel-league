'use client';
import { useActionState } from 'react';
import { respondToChallenge } from '../actions';

type ActionResult = { error: string } | { success: true } | null;

export function ChallengePanel({ matchId, challengerTeamName }: { matchId: string; challengerTeamName: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(respondToChallenge, null);
  if (state && 'success' in state) return <p className="text-sm text-green-600 font-medium">Respuesta enviada.</p>;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <p className="text-sm text-blue-800 mb-3"><strong>{challengerTeamName}</strong> os reta a un partido amistoso.</p>
      {state && 'error' in state && <p className="text-sm text-red-600 mb-2">{state.error}</p>}
      <div className="flex gap-2">
        <form action={action}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="response" value="accept" />
          <button type="submit" disabled={pending}
            className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">Aceptar reto</button>
        </form>
        <form action={action}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="response" value="reject" />
          <button type="submit" disabled={pending}
            className="px-3 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50">Rechazar</button>
        </form>
      </div>
    </div>
  );
}
