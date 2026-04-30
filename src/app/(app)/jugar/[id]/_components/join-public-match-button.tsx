'use client';

import { useActionState } from 'react';
import { joinPublicMatchAction } from '../actions';

type ActionResult = { error: string } | { success: true } | null;

export function JoinPublicMatchButton({ matchId }: { matchId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(joinPublicMatchAction, null);
  if (state && 'success' in state) {
    return <p className="text-sm text-green-600 font-medium">¡Estás dentro!</p>;
  }
  return (
    <form action={action}>
      <input type="hidden" name="matchId" value={matchId} />
      {state && 'error' in state && <p className="text-sm text-red-600 mb-2">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? 'Entrando…' : 'Unirme a este partido'}
      </button>
    </form>
  );
}

export function JoinPublicMatchInlineButton({ matchId }: { matchId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(joinPublicMatchAction, null);
  if (state && 'success' in state) {
    return <span className="text-xs text-green-600 font-bold">¡Dentro!</span>;
  }
  return (
    <form action={action}>
      <input type="hidden" name="matchId" value={matchId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs px-3 py-1.5 bg-brand-navy text-white font-bold rounded-full shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? '…' : 'Unirme'}
      </button>
      {state && 'error' in state && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
    </form>
  );
}
