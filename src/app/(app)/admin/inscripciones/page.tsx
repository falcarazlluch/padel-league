import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { getTenant } from '@/shared/tenant/context';
import {
  EnrollmentService,
  InviteLinkService,
  OrganizationService,
  ENROLLMENT_STATUS_CLASS,
  ENROLLMENT_STATUS_LABEL,
} from '@/modules/organizations';
import { CopyableLink } from './copyable-link';

export const dynamic = 'force-dynamic';

/**
 * Org admin's cockpit: for every competition still taking entries, how many
 * pairs are confirmed, how many are stuck, and the link to hand out. This is
 * where the organiser sees that "12 apuntados" is really "9 confirmed + 3
 * waiting on a partner".
 */
export default async function InscripcionesAdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const currentUser = await getValidatedSession(token);

  const tenant = await getTenant();
  if (!tenant) notFound();
  if (!(await OrganizationService.canAdminister(tenant.id, currentUser.id))) notFound();

  const competitions = await prisma.league.findMany({
    where: { organizationId: tenant.id },
    orderBy: [{ status: 'asc' }, { registrationEnd: 'desc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      registrationEnd: true,
      _count: { select: { registrations: true } },
    },
    take: 50,
  });

  const detail = await Promise.all(
    competitions.map(async (c) => {
      const [rows, links] = await Promise.all([
        EnrollmentService.listForLeague(c.id, currentUser.id).catch(() => []),
        InviteLinkService.listForLeague(c.id, currentUser.id).catch(() => []),
      ]);
      const activeLink = links.find((l) => l.revokedAt === null) ?? null;
      return {
        ...c,
        completed: rows.filter((r) => r.status === 'COMPLETED').length,
        stuck: rows.filter((r) => r.status !== 'COMPLETED'),
        shareUrl: activeLink?.shareUrl ?? null,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">
          {tenant.name}
        </p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Inscripciones</h1>
        <p className="text-sm text-slate-500 mt-1">
          Estado real de cada competición. Las inscripciones sin cerrar no ocupan plaza.
        </p>
      </div>

      {detail.length === 0 && (
        <p className="text-sm text-slate-500">
          Todavía no has creado ninguna competición.{' '}
          <Link href={'/ligas/nueva' as Route} className="text-brand-blue underline">
            Crea la primera
          </Link>
          .
        </p>
      )}

      {detail.map((c) => (
        <section key={c.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link
                href={`/ligas/${c.slug}` as Route}
                className="font-bold text-brand-navy hover:underline"
              >
                {c.name}
              </Link>
              <p className="text-xs text-slate-400">
                Inscripción hasta el{' '}
                {c.registrationEnd.toLocaleDateString('es-ES', { day: '2-digit', month: 'long' })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
                {c.completed} pareja(s) confirmada(s)
              </span>
              {c.stuck.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-amber-50 text-amber-700 border-amber-200">
                  {c.stuck.length} sin cerrar
                </span>
              )}
            </div>
          </div>

          {c.shareUrl ? (
            <CopyableLink url={c.shareUrl} label={`Enlace de inscripción de ${c.name}`} />
          ) : (
            <p className="text-xs text-slate-500">
              Sin enlace de inscripción activo.{' '}
              <Link href={`/ligas/${c.slug}` as Route} className="text-brand-blue underline">
                Genera uno
              </Link>
              .
            </p>
          )}

          {c.stuck.length > 0 && (
            <ul className="divide-y divide-slate-50 border-t border-slate-100 pt-2">
              {c.stuck.map((r) => (
                <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{r.user.name}</p>
                    <p className="text-xs text-slate-400">
                      {r.user.phone ? `${r.user.phone} · ` : ''}
                      {r.pendingPartner
                        ? `esperando a ${r.pendingPartner.name}`
                        : 'sin pareja elegida'}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium border ${ENROLLMENT_STATUS_CLASS[r.status]}`}
                  >
                    {ENROLLMENT_STATUS_LABEL[r.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
