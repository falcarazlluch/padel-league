'use client';

import { useActionState, useTransition, useState } from 'react';
import type { LeagueStatus } from '@prisma/client';
import { registerIndividualAction, withdrawIndividualAction } from '../actions';

type Props = {
  leagueId: string;
  leagueStatus: LeagueStatus;
  registrationWindow: 'open' | 'future' | 'past' | 'closed';
  iAmRegistered: boolean;
  registeredCount: number;
  /** Cap mínimo / máximo del formato — solo display. */
  minPlayers?: number;
  maxPlayers?: number;
};

export function IndividualRegistrationPanel({
  leagueId,
  leagueStatus,
  registrationWindow,
  iAmRegistered,
  registeredCount,
  minPlayers = 4,
  maxPlayers = 16,
}: Props) {
  const inWindow = registrationWindow === 'open' && leagueStatus === 'DRAFT';
  const status = leagueStatus !== 'DRAFT' ? 'closed' : registrationWindow;
  const [state, formAction, pending] = useActionState(registerIndividualAction, null);
  const [withdrawPending, startWithdraw] = useTransition();
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const onWithdraw = () => {
    if (!confirm('¿Darte de baja de esta Americana?')) return;
    setWithdrawError(null);
    startWithdraw(async () => {
      const res = await withdrawIndividualAction(leagueId);
      if (res.error) setWithdrawError(res.error);
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-brand-navy">Inscripción individual</h2>
        <StatusBadge status={status} />
      </div>

      <p className="text-sm text-slate-600">
        {registeredCount} jugador{registeredCount === 1 ? '' : 'es'} apuntado{registeredCount === 1 ? '' : 's'}.
        {' '}
        {registeredCount < minPlayers && (
          <span className="text-amber-700">Se necesitan al menos {minPlayers} para activar.</span>
        )}
        {registeredCount >= maxPlayers && (
          <span className="text-rose-700">Aforo completo ({maxPlayers}).</span>
        )}
      </p>

      {iAmRegistered ? (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <p className="text-sm font-medium text-emerald-800">Estás apuntado.</p>
          {inWindow && (
            <button
              type="button"
              onClick={onWithdraw}
              disabled={withdrawPending}
              className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
            >
              {withdrawPending ? 'Borrando…' : 'Darme de baja'}
            </button>
          )}
        </div>
      ) : inWindow && registeredCount < maxPlayers ? (
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="leagueId" value={leagueId} />
          <button
            type="submit"
            disabled={pending}
            className="self-start px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {pending ? 'Apuntándome…' : 'Apuntarme'}
          </button>
          {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
        </form>
      ) : null}

      {withdrawError && <p className="text-xs text-red-600">{withdrawError}</p>}
    </section>
  );
}

function StatusBadge({ status }: { status: 'open' | 'future' | 'past' | 'closed' }) {
  const map = {
    open: { label: 'Inscripción abierta', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    future: { label: 'Inscripción próxima', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    past: { label: 'Inscripción cerrada', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
    closed: { label: 'Competición ya iniciada', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  } as const;
  const s = map[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${s.cls}`}>{s.label}</span>;
}
