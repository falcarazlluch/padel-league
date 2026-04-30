'use client';

import { useActionState } from 'react';
import { cancelMatchInvitation } from '../actions';

type ActionResult = { error: string } | { success: true } | null;

export function CancelInvitationButton({
  matchId,
  invitationId,
}: {
  matchId: string;
  invitationId: string;
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    cancelMatchInvitation,
    null,
  );

  return (
    <form action={action} className="inline">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
      >
        {pending ? 'Cancelando…' : 'Cancelar'}
      </button>
      {state && 'error' in state && (
        <span className="ml-1 text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}
