'use client';

import { useActionState } from 'react';
import { skipCompetitionAction } from '../[token]/actions';

/**
 * The escape hatch on the competition picker: join the club now, choose a
 * tournament whenever. Kept as its own client island so the picker itself stays
 * a server component.
 */
export function SkipCompetitionForm({
  token,
  organizationName,
}: {
  token: string;
  organizationName: string;
}) {
  const [state, formAction, pending] = useActionState(skipCompetitionAction, null);

  return (
    <form action={formAction} className="pt-3 border-t border-slate-100 space-y-2">
      <input type="hidden" name="inviteToken" value={token} />
      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-60 transition-colors"
      >
        {pending ? 'Guardando...' : 'Omitir: elegiré torneo más tarde'}
      </button>
      <p className="text-xs text-slate-400">
        Quedarás dado de alta en {organizationName} y podrás apuntarte a cualquier torneo desde la
        app, sin volver a usar este enlace.
      </p>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
