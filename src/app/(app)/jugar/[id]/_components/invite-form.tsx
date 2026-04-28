'use client';
import { useActionState } from 'react';
import { inviteByEmail } from '../actions';

type ActionResult = { error: string } | { success: true } | null;

export function InviteForm({ matchId }: { matchId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(inviteByEmail, null);
  return (
    <form action={action} className="flex gap-2 items-start">
      <input type="hidden" name="matchId" value={matchId} />
      <div className="flex-1">
        <input name="email" type="email" placeholder="email@ejemplo.com" required
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
        {state && 'error' in state && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
        {state && 'success' in state && <p className="text-xs text-green-600 mt-1">Invitación enviada.</p>}
      </div>
      <button type="submit" disabled={pending}
        className="px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 shrink-0">
        {pending ? '...' : 'Invitar'}
      </button>
    </form>
  );
}
