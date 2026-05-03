'use client';

import { useActionState, useState } from 'react';
import { leaveMatchAction } from '../actions';

type ActionResult = { error: string } | { success: true };

export function LeaveMatchButton({ matchId }: { matchId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => leaveMatchAction(_prev, formData),
    null,
  );

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-semibold px-4 py-2 bg-white border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-50 transition-colors"
      >
        Bajarme del partido
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
      <input type="hidden" name="matchId" value={matchId} />
      <p className="text-sm text-slate-700">¿Seguro que te bajas? Se avisará al resto.</p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-bold px-3 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Procesando…' : 'Sí, bajarme'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-sm font-semibold px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
      {state && 'error' in state && <p className="text-sm text-rose-600">{state.error}</p>}
    </form>
  );
}
