'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { cancelPartnerInviteAction, invitePartnerAction, registerExistingTeamAction } from '../[token]/actions';

type EligibleTeam = { id: string; name: string; partnerName: string };
type Candidate = { id: string; name: string; avatarUrl: string | null };

type Mode = 'existing' | 'invite' | 'none';

/**
 * Step 3 — the only genuinely branching decision in the flow.
 *
 * The three options are shown up front, including "todavía no tengo pareja",
 * because the failure mode this wizard exists to prevent is a player quietly
 * assuming they are signed up when they are one accepted invite short.
 */
export function PartnerStep({
  token,
  leagueId,
  competitionName,
  myName,
  eligibleTeams,
  pendingInvite,
}: {
  token: string;
  leagueId: string;
  competitionName: string;
  myName: string;
  eligibleTeams: EligibleTeam[];
  pendingInvite: { invitedName: string; shareUrl: string; expiresAt: string } | null;
}) {
  const [mode, setMode] = useState<Mode>(eligibleTeams.length > 0 ? 'existing' : 'invite');

  if (pendingInvite) {
    return <PendingInviteBlock token={token} leagueId={leagueId} invite={pendingInvite} />;
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-5">
      <div>
        <h2 className="text-base font-bold text-brand-navy">Tu pareja</h2>
        <p className="text-sm text-slate-600 mt-1">
          {competitionName} se juega por parejas. Sin pareja confirmada tu plaza no queda cerrada.
        </p>
      </div>

      <div className="space-y-2" role="radiogroup" aria-label="Cómo quieres formar tu pareja">
        {eligibleTeams.length > 0 && (
          <ModeOption
            checked={mode === 'existing'}
            onSelect={() => setMode('existing')}
            title="Ya tengo pareja en la app"
            description="Usa una de tus parejas existentes. Se apunta al instante."
          />
        )}
        <ModeOption
          checked={mode === 'invite'}
          onSelect={() => setMode('invite')}
          title="Quiero invitar a mi pareja"
          description="Le avisamos por email y notificación. Al aceptar, quedáis inscritos automáticamente."
        />
        <ModeOption
          checked={mode === 'none'}
          onSelect={() => setMode('none')}
          title="Todavía no sé con quién juego"
          description="Guardamos tu avance, pero tu inscripción quedará SIN confirmar."
        />
      </div>

      {mode === 'existing' && eligibleTeams.length > 0 && (
        <ExistingTeamForm token={token} leagueId={leagueId} teams={eligibleTeams} />
      )}
      {mode === 'invite' && (
        <InvitePartnerForm token={token} leagueId={leagueId} myName={myName} />
      )}
      {mode === 'none' && <NoPartnerBlock token={token} />}
    </section>
  );
}

function ModeOption({
  checked,
  onSelect,
  title,
  description,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
        checked ? 'border-brand-blue bg-brand-blue/5' : 'border-slate-200 hover:bg-slate-50'
      }`}
    >
      <input
        type="radio"
        name="partnerMode"
        checked={checked}
        onChange={onSelect}
        className="mt-1 accent-[var(--color-brand-blue)]"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-700">{title}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
    </label>
  );
}

function ExistingTeamForm({
  token,
  leagueId,
  teams,
}: {
  token: string;
  leagueId: string;
  teams: EligibleTeam[];
}) {
  const [state, formAction, pending] = useActionState(registerExistingTeamAction, null);
  return (
    <form action={formAction} className="space-y-3 pt-2 border-t border-slate-100">
      <input type="hidden" name="inviteToken" value={token} />
      <input type="hidden" name="leagueId" value={leagueId} />
      <div>
        <label htmlFor="teamId" className="block text-sm font-medium text-slate-700 mb-1">
          Elige la pareja con la que te apuntas
        </label>
        <select
          id="teamId"
          name="teamId"
          required
          defaultValue={teams[0]?.id}
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · con {t.partnerName}
            </option>
          ))}
        </select>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-3 bg-gradient-to-br from-brand-green to-brand-green-dark text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {pending ? 'Apuntando...' : 'Apuntarnos ya'}
      </button>
      <p className="text-xs text-slate-400">
        Avisaremos a tu compañero/a de que os habéis apuntado.
      </p>
    </form>
  );
}

function InvitePartnerForm({
  token,
  leagueId,
  myName,
}: {
  token: string;
  leagueId: string;
  myName: string;
}) {
  const [state, formAction, pending] = useActionState(invitePartnerAction, null);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [searching, setSearching] = useState(false);
  const [useEmail, setUseEmail] = useState(false);

  // Whether a search is meaningful right now. Kept as a derived value rather
  // than clearing `candidates` from inside the effect — the stale list simply
  // stops being rendered, and the effect stays free of synchronous setState.
  const searchActive = !picked && !useEmail && query.trim().length >= 2;
  const visibleCandidates = searchActive ? candidates : [];

  useEffect(() => {
    if (!searchActive) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(
        `/api/inscripcion/partners?q=${encodeURIComponent(query.trim())}&leagueId=${encodeURIComponent(leagueId)}`,
        { signal: controller.signal },
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: Candidate[]) => setCandidates(rows))
        .catch(() => {
          /* aborted or offline — the email fallback is always available */
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, leagueId, searchActive]);

  return (
    <form action={formAction} className="space-y-4 pt-2 border-t border-slate-100">
      <input type="hidden" name="inviteToken" value={token} />
      <input type="hidden" name="leagueId" value={leagueId} />
      {picked && <input type="hidden" name="partnerUserId" value={picked.id} />}

      {!useEmail && !picked && (
        <div>
          <label htmlFor="partnerQuery" className="block text-sm font-medium text-slate-700 mb-1">
            Busca a tu pareja por nombre
          </label>
          <input
            id="partnerQuery"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Empieza a escribir su nombre..."
            autoComplete="off"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
          {searching && <p className="text-xs text-slate-400 mt-1">Buscando...</p>}
          {visibleCandidates.length > 0 && (
            <ul className="mt-2 border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
              {visibleCandidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(c);
                      setQuery('');
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!searching && query.trim().length >= 2 && visibleCandidates.length === 0 && (
            <p className="text-xs text-slate-500 mt-2">
              No encontramos a nadie con ese nombre.{' '}
              <button
                type="button"
                onClick={() => setUseEmail(true)}
                className="text-brand-blue font-semibold underline"
              >
                Invítale por email
              </button>{' '}
              — aunque no tenga cuenta todavía.
            </p>
          )}
          <button
            type="button"
            onClick={() => setUseEmail(true)}
            className="text-xs text-brand-blue font-semibold underline mt-2"
          >
            Mi pareja no está en la app
          </button>
        </div>
      )}

      {picked && (
        <div className="flex items-center justify-between gap-3 bg-brand-blue/5 border border-brand-blue/30 rounded-xl px-3 py-2.5">
          <span className="text-sm font-semibold text-brand-navy">{picked.name}</span>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="text-xs text-slate-500 font-semibold hover:underline"
          >
            Cambiar
          </button>
        </div>
      )}

      {useEmail && !picked && (
        <div className="space-y-3">
          <div>
            <label htmlFor="partnerName" className="block text-sm font-medium text-slate-700 mb-1">
              Nombre de tu pareja
            </label>
            <input
              id="partnerName"
              name="partnerName"
              type="text"
              maxLength={80}
              placeholder="Ej: Marta Ruiz"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
          </div>
          <div>
            <label htmlFor="partnerEmail" className="block text-sm font-medium text-slate-700 mb-1">
              Su email <span className="text-red-500">*</span>
            </label>
            <input
              id="partnerEmail"
              name="partnerEmail"
              type="email"
              required
              autoComplete="off"
              placeholder="pareja@email.com"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
            <p className="text-xs text-slate-400 mt-1">
              Le enviaremos un enlace para aceptar. Si aún no tiene cuenta, podrá crearla desde ahí.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUseEmail(false)}
            className="text-xs text-brand-blue font-semibold underline"
          >
            Volver a buscar por nombre
          </button>
        </div>
      )}

      <div>
        <label htmlFor="teamName" className="block text-sm font-medium text-slate-700 mb-1">
          Nombre de la pareja <span className="text-slate-400 font-normal">(opcional)</span>
        </label>
        <input
          id="teamName"
          name="teamName"
          type="text"
          maxLength={60}
          placeholder={`Ej: ${myName.split(' ')[0]} y compañía`}
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || (!picked && !useEmail)}
        className="w-full px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? 'Enviando invitación...' : 'Enviar invitación a mi pareja'}
      </button>
      {!picked && !useEmail && (
        <p className="text-xs text-slate-400">
          Elige a alguien de la lista o invítale por email para continuar.
        </p>
      )}
    </form>
  );
}

function PendingInviteBlock({
  token,
  leagueId,
  invite,
}: {
  token: string;
  leagueId: string;
  invite: { invitedName: string; shareUrl: string; expiresAt: string };
}) {
  const [pendingCancel, startCancel] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    if (!confirm(`¿Cancelar la invitación a ${invite.invitedName} y elegir otra pareja?`)) return;
    setError(null);
    startCancel(async () => {
      const res = await cancelPartnerInviteAction(token, leagueId);
      if (res.error) setError(res.error);
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-brand-navy">
          Esperando a {invite.invitedName}
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Ya le hemos avisado. En cuanto acepte, quedaréis inscritos automáticamente y te
          avisaremos.
        </p>
      </div>
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
        <p className="text-xs text-amber-800">
          Caduca el{' '}
          {new Date(invite.expiresAt).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'long',
          })}
          . Si no acepta antes, tendrás que invitar a otra persona.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/inscripcion/${token}?paso=4` as Route}
          className="flex-1 min-w-[10rem] text-center px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
        >
          Ver estado de mi inscripción
        </Link>
        <button
          type="button"
          onClick={cancel}
          disabled={pendingCancel}
          className="px-4 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          {pendingCancel ? 'Cancelando...' : 'Cambiar de pareja'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

function NoPartnerBlock({ token }: { token: string }) {
  return (
    <div className="space-y-3 pt-2 border-t border-slate-100">
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
        <p className="text-sm font-semibold text-amber-900">Tu inscripción quedará sin confirmar</p>
        <p className="text-xs text-amber-800 mt-1">
          Guardamos tu avance para que no tengas que repetir nada, pero{' '}
          <strong>no ocupas plaza</strong> hasta que tengas pareja. Vuelve a este enlace cuando la
          tengas.
        </p>
      </div>
      <Link
        href={`/inscripcion/${token}?paso=4` as Route}
        className="block text-center px-4 py-3 bg-white border border-slate-200 text-brand-navy text-sm font-bold rounded-xl hover:bg-slate-50 transition-colors"
      >
        Entendido, ver qué me falta
      </Link>
    </div>
  );
}
