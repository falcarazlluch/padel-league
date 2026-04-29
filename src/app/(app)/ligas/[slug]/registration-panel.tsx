'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useActionState, useTransition, useState } from 'react';
import type { LeagueStatus, TeamCategory } from '@prisma/client';
import { CATEGORY_LABEL } from '@/modules/leagues/presentation/category';
import { registerTeamAction, withdrawTeamAction } from '../actions';

type UserTeam = {
  id: string;
  name: string;
  category: TeamCategory;
  memberCount: number;
  isRegistered: boolean;
};

type Props = {
  leagueId: string;
  leagueStatus: LeagueStatus;
  /** Computed server-side to keep the component pure. */
  registrationWindow: 'open' | 'future' | 'past' | 'closed';
  userTeams: UserTeam[];
};

export function LeagueRegistrationPanel({
  leagueId,
  leagueStatus,
  registrationWindow,
  userTeams,
}: Props) {
  const inWindow = registrationWindow === 'open';

  const eligibleToRegister = userTeams.filter((t) => !t.isRegistered && t.memberCount === 2);
  const registered = userTeams.filter((t) => t.isRegistered);

  if (userTeams.length === 0 && !inWindow) return null;

  // leagueStatus is read so callers know we drive UI from it; use it to be explicit:
  const status = leagueStatus !== 'DRAFT' ? 'closed' : registrationWindow;

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-brand-navy">Inscripción</h2>
        <RegistrationStatusBadge status={status} />
      </div>

      {registered.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tus equipos apuntados</p>
          <ul className="space-y-2">
            {registered.map((t) => (
              <RegisteredRow
                key={t.id}
                leagueId={leagueId}
                team={t}
                canWithdraw={inWindow}
              />
            ))}
          </ul>
        </div>
      )}

      {inWindow && eligibleToRegister.length > 0 && (
        <RegisterForm leagueId={leagueId} teams={eligibleToRegister} />
      )}

      {inWindow && userTeams.length === 0 && (
        <p className="text-sm text-slate-500">
          Aún no tienes ningún equipo. Crea uno desde{' '}
          <Link href={'/equipos' as Route} className="text-brand-blue underline">Mis equipos</Link>{' '}
          para apuntarte.
        </p>
      )}
      {inWindow && userTeams.length > 0 && eligibleToRegister.length === 0 && registered.length === 0 && (
        <p className="text-sm text-slate-500">
          Tus equipos aún no están completos (necesitan 2 jugadores) — completa el equipo desde{' '}
          <Link href={'/equipos' as Route} className="text-brand-blue underline">Mis equipos</Link>.
        </p>
      )}
    </section>
  );
}

function RegistrationStatusBadge({ status }: { status: 'open' | 'future' | 'past' | 'closed' }) {
  const map = {
    open:   { label: 'Inscripción abierta',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    future: { label: 'Inscripción próxima',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    past:   { label: 'Inscripción cerrada',  cls: 'bg-slate-100 text-slate-500 border-slate-200' },
    closed: { label: 'Liga ya iniciada',     cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  } as const;
  const s = map[status];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${s.cls}`}>
      {s.label}
    </span>
  );
}

function RegisteredRow({
  leagueId,
  team,
  canWithdraw,
}: {
  leagueId: string;
  team: UserTeam;
  canWithdraw: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onWithdraw = () => {
    if (!confirm(`¿Borrar al equipo "${team.name}" de esta liga?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await withdrawTeamAction(leagueId, team.id);
      if (res.error) setError(res.error);
    });
  };

  return (
    <li className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2">
      <div className="text-sm">
        <span className="font-medium text-slate-700">{team.name}</span>
        <span className="ml-2 text-xs text-slate-400">{CATEGORY_LABEL[team.category]}</span>
        {error && <span className="block text-xs text-red-600 mt-0.5">{error}</span>}
      </div>
      {canWithdraw && (
        <button
          type="button"
          onClick={onWithdraw}
          disabled={pending}
          className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          {pending ? 'Borrando...' : 'Borrarse'}
        </button>
      )}
    </li>
  );
}

function RegisterForm({ leagueId, teams }: { leagueId: string; teams: UserTeam[] }) {
  const [state, formAction, pending] = useActionState(registerTeamAction, null);
  return (
    <form action={formAction} className="flex flex-col sm:flex-row sm:items-end gap-2 pt-2 border-t border-slate-100">
      <input type="hidden" name="leagueId" value={leagueId} />
      <div className="flex-1">
        <label htmlFor="teamId" className="block text-xs font-medium text-slate-500 mb-1">
          Apuntar equipo
        </label>
        <select
          id="teamId"
          name="teamId"
          required
          defaultValue={teams[0]?.id}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {CATEGORY_LABEL[t.category]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {pending ? 'Apuntando...' : 'Apuntarse'}
      </button>
      {state?.error && <p className="text-xs text-red-600 sm:ml-2">{state.error}</p>}
    </form>
  );
}
