'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useState, useTransition } from 'react';
// Presentation path, not the module facade: the facade re-exports services that
// pull in prisma/pg-boss, which cannot be bundled for the client.
import type { ChecklistItem, TournamentEnrollmentStatus } from '@/modules/organizations/presentation/labels';
import { EnrollmentChecklist } from '@/modules/organizations/presentation/enrollment-checklist';
import { cancelEnrollmentAction } from '../[token]/actions';

/**
 * Step 4. States the outcome in one unambiguous headline, then backs it with the
 * checklist. Three possible endings and no fourth:
 *   COMPLETED               → "Estás dentro", nothing left to do.
 *   AWAITING_PARTNER_ACCEPT → "Falta que X acepte", with the link to nudge them.
 *   AWAITING_PARTNER        → "Te falta pareja", with the way to fix it.
 */
export function DoneStep({
  token,
  leagueId,
  competitionName,
  competitionSlug,
  checklist,
  status,
  teamName,
  pendingInvite,
}: {
  token: string;
  leagueId: string;
  competitionName: string;
  competitionSlug: string;
  checklist: ChecklistItem[];
  status: TournamentEnrollmentStatus | 'NOT_STARTED';
  teamName: string | null;
  pendingInvite: {
    invitedName: string;
    invitedEmail: string | null;
    shareUrl: string;
    expiresAt: string;
  } | null;
}) {
  const done = status === 'COMPLETED';
  const waiting = status === 'AWAITING_PARTNER_ACCEPT';

  return (
    <div className="space-y-5">
      <section
        className={`rounded-2xl border shadow-sm p-5 ${
          done
            ? 'bg-emerald-50 border-emerald-200'
            : waiting
              ? 'bg-amber-50 border-amber-200'
              : 'bg-white border-slate-200/80'
        }`}
      >
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none shrink-0" aria-hidden>
            {done ? '🎉' : waiting ? '⏳' : '👋'}
          </span>
          <div>
            <h2
              className={`text-lg font-black ${
                done ? 'text-emerald-900' : waiting ? 'text-amber-900' : 'text-brand-navy'
              }`}
            >
              {done
                ? '¡Estás dentro!'
                : waiting
                  ? `Falta que ${pendingInvite?.invitedName ?? 'tu pareja'} acepte`
                  : 'Te falta la pareja'}
            </h2>
            <p
              className={`text-sm mt-1 ${
                done ? 'text-emerald-800' : waiting ? 'text-amber-800' : 'text-slate-600'
              }`}
            >
              {done
                ? `Tu pareja${teamName ? ` "${teamName}"` : ''} está inscrita en ${competitionName}. No tienes que hacer nada más.`
                : waiting
                  ? `Tu plaza en ${competitionName} se confirmará sola en cuanto acepte. Te avisaremos.`
                  : `Todavía no ocupas plaza en ${competitionName}. Elige o invita a tu pareja para cerrarla.`}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-bold text-brand-navy">Qué tienes y qué te falta</h3>
        <EnrollmentChecklist items={checklist} />
      </section>

      {pendingInvite && <NudgePartner invite={pendingInvite} />}

      <div className="flex flex-wrap gap-2">
        {!done && (
          <Link
            href={`/inscripcion/${token}?paso=3` as Route}
            className="flex-1 min-w-[12rem] text-center px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
          >
            {waiting ? 'Cambiar de pareja' : 'Elegir pareja ahora'}
          </Link>
        )}
        {done && (
          <Link
            href={`/ligas/${competitionSlug}` as Route}
            className="flex-1 min-w-[12rem] text-center px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
          >
            Ver la competición
          </Link>
        )}
        <Link
          href={'/dashboard' as Route}
          className="flex-1 min-w-[10rem] text-center px-4 py-3 bg-white border border-slate-200 text-brand-navy text-sm font-bold rounded-xl hover:bg-slate-50 transition-colors"
        >
          Ir a mi panel
        </Link>
      </div>

      <CancelEnrollment token={token} leagueId={leagueId} registered={done} />
    </div>
  );
}

function NudgePartner({
  invite,
}: {
  invite: { invitedName: string; invitedEmail: string | null; shareUrl: string; expiresAt: string };
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-brand-navy">Dale un empujón a tu pareja</h3>
        <p className="text-xs text-slate-500 mt-1">
          {invite.invitedEmail
            ? `Le hemos enviado un email a ${invite.invitedEmail}. Si no lo encuentra, mándale este enlace directamente por WhatsApp:`
            : 'Mándale este enlace por WhatsApp para que acepte:'}
        </p>
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={invite.shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Enlace para tu pareja"
          className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-600"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="px-3 py-2 bg-brand-navy text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity shrink-0"
        >
          {copied ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
      {copyError && (
        <p className="text-xs text-slate-500">
          No se pudo copiar automáticamente — selecciona el enlace y cópialo a mano.
        </p>
      )}
      <p className="text-xs text-slate-400">
        Caduca el{' '}
        {new Date(invite.expiresAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long' })}.
      </p>
    </section>
  );
}

function CancelEnrollment({
  token,
  leagueId,
  registered,
}: {
  token: string;
  leagueId: string;
  registered: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    const msg = registered
      ? '¿Anular vuestra inscripción? Se avisará a tu pareja y perderéis la plaza.'
      : '¿Descartar esta inscripción?';
    if (!confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelEnrollmentAction(token, leagueId);
      if (res.error) setError(res.error);
    });
  };

  return (
    <details className="text-xs text-slate-400">
      <summary className="cursor-pointer">No quiero participar</summary>
      <div className="mt-2 space-y-2">
        <p>
          {registered
            ? 'Anular libera vuestra plaza y avisa a tu pareja.'
            : 'Descartar borra tu avance en este asistente. Podrás volver a empezar con el mismo enlace.'}
        </p>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="text-red-600 font-semibold hover:underline disabled:opacity-60"
        >
          {pending ? 'Anulando...' : registered ? 'Anular inscripción' : 'Descartar inscripción'}
        </button>
        {error && <p className="text-red-600">{error}</p>}
      </div>
    </details>
  );
}
