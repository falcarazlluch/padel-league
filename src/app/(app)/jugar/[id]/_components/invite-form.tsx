'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { inviteByEmail, inviteUserToMatchAction } from '../actions';
import { MatchUserPicker } from './match-user-picker';

type ActionResult = { error: string } | { success: true } | null;

export function InviteForm({ matchId }: { matchId: string }) {
  const [showEmailFallback, setShowEmailFallback] = useState(false);

  const [userState, userAction, userPending] = useActionState<ActionResult, FormData>(
    inviteUserToMatchAction,
    null,
  );
  const userFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (userState && 'success' in userState) userFormRef.current?.reset();
  }, [userState]);

  const [emailState, emailAction, emailPending] = useActionState<ActionResult, FormData>(
    inviteByEmail,
    null,
  );

  return (
    <div className="space-y-3">
      <form ref={userFormRef} action={userAction} className="flex flex-col gap-2">
        <input type="hidden" name="matchId" value={matchId} />
        <MatchUserPicker matchId={matchId} />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={userPending}
            className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {userPending ? 'Enviando…' : 'Invitar'}
          </button>
          {userState && 'error' in userState && <p className="text-xs text-red-600">{userState.error}</p>}
          {userState && 'success' in userState && <p className="text-xs text-emerald-700">Invitación enviada.</p>}
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
