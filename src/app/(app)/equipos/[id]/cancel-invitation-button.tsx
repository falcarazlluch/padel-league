'use client';

import { useTransition, useState } from 'react';
import { cancelInvitationAction } from '../actions';

export function CancelInvitationButton({
  invitationId,
  teamId,
}: {
  invitationId: string;
  teamId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onCancel = () => {
    setError(null);
    startTransition(async () => {
      const res = await cancelInvitationAction(invitationId, teamId);
      if (res.error) setError(res.error);
    });
  };

  return (
    <span>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
      >
        {pending ? 'Cancelando…' : 'Cancelar'}
      </button>
      {error && <span className="block text-xs text-red-600 mt-0.5">{error}</span>}
    </span>
  );
}
