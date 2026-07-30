import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import {
  EnrollmentService,
  OrgBrandHeader,
  PARTNER_BLOCKED_MESSAGE,
} from '@/modules/organizations';
import {
  COMPETITION_TYPE_LABEL,
  COMPETITION_TYPE_BADGE_CLASS,
} from '@/modules/leagues/presentation/competition-type';
import { PartnerDecision } from './partner-decision';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const invite = await EnrollmentService.getPartnerInvite(token, null);
  if (!invite) return { title: 'Invitación no disponible' };
  return {
    title: `${invite.inviter.name} te invita · ${invite.competition.name}`,
    robots: { index: false, follow: false },
  };
}

function fmt(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * The partner's side of the flow. Accepting here does three things at once —
 * joins the tenant, joins the pair, and registers both players — which is why
 * the copy is explicit that one click finishes the inscription for both.
 */
export default async function PartnerInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  const currentUser = sessionToken
    ? await getValidatedSession(sessionToken).catch(() => null)
    : null;

  const invite = await EnrollmentService.getPartnerInvite(token, currentUser?.id ?? null);
  if (!invite) notFound();

  const next = encodeURIComponent(`/pareja/${token}`);

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-brand-navy to-brand-navy-light px-5 py-4 space-y-1">
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-white/60">
            Invitación de pareja
          </p>
          <h1 className="text-xl sm:text-2xl font-black text-white">
            {invite.inviter.name} quiere jugar contigo
          </h1>
          <p className="text-sm text-white/80">{invite.competition.name}</p>
        </div>

        <div className="p-5 space-y-4">
          {invite.organization && (
            <OrgBrandHeader
              name={invite.organization.name}
              logoUrl={invite.organization.logoUrl}
              size="sm"
            />
          )}

          <div className="flex flex-wrap gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium border ${COMPETITION_TYPE_BADGE_CLASS[invite.competition.type]}`}
            >
              {COMPETITION_TYPE_LABEL[invite.competition.type]}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-slate-50 text-slate-600 border-slate-200">
              Pareja: {invite.team.name}
            </span>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl px-3 py-2">
              <dt className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">
                Se juega
              </dt>
              <dd className="text-sm font-semibold text-brand-navy">
                {fmt(invite.competition.startDate)} – {fmt(invite.competition.endDate)}
              </dd>
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2">
              <dt className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">
                Responde antes del
              </dt>
              <dd className="text-sm font-semibold text-brand-navy">{fmt(invite.expiresAt)}</dd>
            </div>
          </dl>

          <div className="rounded-xl bg-brand-blue/5 border border-brand-blue/20 p-3">
            <p className="text-sm text-slate-700">
              Al aceptar quedáis <strong>los dos inscritos</strong> automáticamente. Hasta entonces{' '}
              {invite.inviter.name.split(' ')[0]} <strong>no tiene plaza</strong>.
            </p>
          </div>
        </div>
      </section>

      {invite.blockedReason ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900">Esta invitación no está disponible</p>
          <p className="text-sm text-amber-800">
            {PARTNER_BLOCKED_MESSAGE[invite.blockedReason]}
          </p>
          {invite.blockedReason === 'WRONG_ACCOUNT' && (
            <Link
              href={'/login' as Route}
              className="inline-block text-sm font-semibold text-brand-blue underline"
            >
              Entrar con otra cuenta
            </Link>
          )}
        </div>
      ) : currentUser ? (
        <PartnerDecision token={token} inviterFirstName={invite.inviter.name.split(' ')[0] ?? ''} />
      ) : (
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-brand-navy">Identifícate para aceptar</h2>
            <p className="text-sm text-slate-600 mt-1">
              {invite.invitedEmail
                ? `La invitación se envió a ${invite.invitedEmail}. Entra o crea tu cuenta y volverás aquí.`
                : 'Entra o crea tu cuenta y volverás aquí automáticamente.'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href={`/registro?partnerToken=${encodeURIComponent(token)}&next=${next}` as Route}
              className="block text-center px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
            >
              Soy nuevo — crear cuenta
            </Link>
            <Link
              href={`/login?next=${next}` as Route}
              className="block text-center px-4 py-3 bg-white border border-slate-200 text-brand-navy text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 transition-colors"
            >
              Ya tengo cuenta — entrar
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
