'use client';

import { useActionState, useEffect, useRef } from 'react';
import { inviteToTeamAction } from '../actions';

export function InviteForm({ teamId }: { teamId: string }) {
  const [state, formAction, pending] = useActionState(inviteToTeamAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col sm:flex-row gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input
        name="invitedUserIdentifier"
        type="text"
        required
        placeholder="Email o nombre del jugador"
        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
      />
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {pending ? 'Enviando…' : 'Enviar invitación'}
      </button>
      {state?.error && <p className="text-xs text-red-600 mt-1 sm:ml-2">{state.error}</p>}
      {state?.success && <p className="text-xs text-emerald-700 mt-1 sm:ml-2">Invitación enviada.</p>}
    </form>
  );
}
