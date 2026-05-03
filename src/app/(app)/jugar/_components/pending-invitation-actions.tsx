'use client';

import { useActionState } from 'react';
import {
  acceptPendingInvitationAction,
  rejectPendingInvitationAction,
} from '../[id]/actions';

type ActionResult = { error: string } | { success: true };

interface Props {
  matchId: string;
}

export function PendingInvitationActions({ matchId }: Props) {
  const [acceptState, acceptAction, accepting] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => acceptPendingInvitationAction(_prev, formData),
    null,
  );
  const [rejectState, rejectAction, rejecting] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => rejectPendingInvitationAction(_prev, formData),
    null,
  );
  const error =
    (acceptState && 'error' in acceptState ? acceptState.error : null) ??
    (rejectState && 'error' in rejectState ? rejectState.error : null);

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex gap-2">
        <form action={rejectAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <button
            type="submit"
            disabled={rejecting || accepting}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors"
          >
            {rejecting ? '…' : 'Rechazar'}
          </button>
        </form>
        <form action={acceptAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <button
            type="submit"
            disabled={rejecting || accepting}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {accepting ? '…' : 'Aceptar'}
          </button>
        </form>
      </div>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
