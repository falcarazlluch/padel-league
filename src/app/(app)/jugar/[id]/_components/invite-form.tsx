'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { inviteByEmail, inviteEntityToMatchAction } from '../actions';
import { MatchEntityPicker } from './match-entity-picker';

type ActionResult = { error: string } | { success: true } | null;

interface Props {
  matchId: string;
  availableSlots: number;
}

export function InviteForm({ matchId, availableSlots }: Props) {
  const [showEmailFallback, setShowEmailFallback] = useState(false);

  const [entityState, entityAction, entityPending] = useActionState<ActionResult, FormData>(
    inviteEntityToMatchAction,
    null,
  );
  const entityFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (entityState && 'success' in entityState) entityFormRef.current?.reset();
  }, [entityState]);

  const [emailState, emailAction, emailPending] = useActionState<ActionResult, FormData>(
    inviteByEmail,
    null,
  );

  return (
    <div className="space-y-3">
      <form ref={entityFormRef} action={entityAction} className="flex flex-col gap-2">
        <input type="hidden" name="matchId" value={matchId} />
        <MatchEntityPicker matchId={matchId} availableSlots={availableSlots} />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={entityPending}
            className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {entityPending ? 'Enviando…' : 'Invitar'}
          </button>
          {entityState && 'error' in entityState && <p className="text-xs text-red-600">{entityState.error}</p>}
          {entityState && 'success' in entityState && <p className="text-xs text-emerald-700">Invitación enviada.</p>}
        </div>
      </form>

      <button
        type="button"
        onClick={() => setShowEmailFallback((v) => !v)}
        className="text-xs text-slate-500 hover:text-slate-700 underline transition-colors"
      >
        {showEmailFallback ? 'Ocultar invitación por email' : '¿No lo encuentras? Invitar por email'}
      </button>

      {showEmailFallback && (
        <form action={emailAction} className="flex gap-2 items-start">
          <input type="hidden" name="matchId" value={matchId} />
          <div className="flex-1">
            <input
              name="email"
              type="email"
              placeholder="email@ejemplo.com"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
            {emailState && 'error' in emailState && <p className="text-xs text-red-600 mt-1">{emailState.error}</p>}
            {emailState && 'success' in emailState && <p className="text-xs text-green-600 mt-1">Invitación enviada.</p>}
          </div>
          <button
            type="submit"
            disabled={emailPending}
            className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 shrink-0 transition-opacity"
          >
            {emailPending ? '…' : 'Invitar'}
          </button>
        </form>
      )}
    </div>
  );
}
