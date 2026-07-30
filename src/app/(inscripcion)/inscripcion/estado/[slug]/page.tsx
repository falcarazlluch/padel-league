import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { getTenantId } from '@/shared/tenant/context';
import {
  EnrollmentChecklist,
  EnrollmentService,
  ENROLLMENT_STATUS_CLASS,
  ENROLLMENT_STATUS_LABEL,
} from '@/modules/organizations';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Estado de mi inscripción',
  robots: { index: false, follow: false },
};

/**
 * Permanent, linkable answer to "¿estoy apuntado?". Every enrolment
 * notification points here, so a player who deleted the original invite link
 * still has one URL that tells them the truth.
 */
export default async function EstadoInscripcionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    redirect(`/login?next=${encodeURIComponent(`/inscripcion/estado/${slug}`)}` as Route);
  }
  const currentUser = await getValidatedSession(sessionToken);

  const league = await prisma.league.findFirst({
    where: { slug, organizationId: await getTenantId() },
    select: { id: true, name: true, slug: true, registrationEnd: true, status: true },
  });
  if (!league) notFound();

  const view = await EnrollmentService.getView(league.id, currentUser.id);

  // The most recent usable link for this competition, so "seguir donde lo dejé"
  // works without the player digging out the original email.
  const resumeLink = await prisma.tournamentInviteLink.findFirst({
    where: { leagueId: league.id, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { token: true },
  });

  const done = view.status === 'COMPLETED';

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-black text-brand-navy">{league.name}</h1>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium border ${ENROLLMENT_STATUS_CLASS[view.status]}`}
          >
            {ENROLLMENT_STATUS_LABEL[view.status]}
          </span>
        </div>
        <p className="text-sm text-slate-600">
          {done
            ? `Tu pareja${view.team ? ` "${view.team.name}"` : ''} está inscrita. No tienes que hacer nada más.`
            : view.status === 'NOT_STARTED'
              ? 'Todavía no has empezado tu inscripción a esta competición.'
              : view.status === 'CANCELLED'
                ? 'Tu inscripción está anulada. Puedes volver a empezar con el enlace de inscripción.'
                : 'Tu inscripción está empezada pero NO confirmada. Esto es lo que falta:'}
        </p>
        <p className="text-xs text-slate-400">
          Plazo de inscripción hasta el{' '}
          {league.registrationEnd.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
          .
        </p>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-bold text-brand-navy">Qué tienes y qué te falta</h2>
        <EnrollmentChecklist items={view.checklist} />
      </section>

      {view.pendingInvite && (
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-2">
          <h2 className="text-sm font-bold text-brand-navy">Enlace para tu pareja</h2>
          <p className="text-xs text-slate-500">
            Mándaselo a {view.pendingInvite.invitedName} si no encuentra el email.
          </p>
          <input
            readOnly
            value={view.pendingInvite.shareUrl}
            aria-label="Enlace para tu pareja"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-600"
          />
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {!done && resumeLink && (
          <Link
            href={`/inscripcion/${resumeLink.token}` as Route}
            className="flex-1 min-w-[12rem] text-center px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
          >
            {view.status === 'NOT_STARTED' || view.status === 'CANCELLED'
              ? 'Empezar inscripción'
              : 'Seguir con mi inscripción'}
          </Link>
        )}
        {!done && !resumeLink && (
          <p className="flex-1 text-sm text-slate-500">
            El organizador ha desactivado el enlace de inscripción. Ponte en contacto con él para
            terminar tu alta.
          </p>
        )}
        {done && league.status !== 'DRAFT' && (
          <Link
            href={`/ligas/${league.slug}` as Route}
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
    </div>
  );
}
