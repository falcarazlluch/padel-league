'use client';

import { useActionState, useEffect, useRef } from 'react';
import { inviteToTeamAction } from '../actions';
import { UserSearchPicker } from './_components/user-search-picker';

export function InviteForm({ teamId }: { teamId: string }) {
  const [state, formAction, pending] = useActionState(inviteToTeamAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <UserSearchPicker teamId={teamId} />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {pending ? 'Enviando…' : 'Enviar invitación'}
        </button>
        {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
        {state?.success && <p className="text-xs text-emerald-700">Invitación enviada.</p>}
      </div>
    </form>
  );
}
