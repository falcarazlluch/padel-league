'use client';
import { useActionState } from 'react';
import { requestToJoin } from '../actions';

type ActionResult = { error: string } | { success: true } | null;

export function JoinRequestButton({ matchId }: { matchId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(requestToJoin, null);
  if (state && 'success' in state) {
    return <p className="text-sm text-green-600 font-medium">Solicitud enviada. Espera a que el organizador la apruebe.</p>;
  }
  return (
    <form action={action}>
      <input type="hidden" name="matchId" value={matchId} />
      {state && 'error' in state && <p className="text-sm text-red-600 mb-2">{state.error}</p>}
      <button type="submit" disabled={pending}
        className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy/90 disabled:opacity-50 transition-colors">
        {pending ? 'Enviando...' : 'Unirme a este partido'}
      </button>
    </form>
  );
}
