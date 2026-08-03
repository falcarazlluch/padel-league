import { cookies } from 'next/headers';
import { getTenantId } from '@/shared/tenant/context';
import { redirect, notFound } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { ResolveDisputeForm } from './resolve-form';

export default async function DisputasAdminPage() {
  // Platform-wide administration: these pages show data across every tenant, so
  // they only exist on the apex host. Inside a tenant subdomain they 404 — an
  // ORG_ADMIN has no business enumerating other organizations' users or teams.
  if (await getTenantId()) notFound();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);

  let user;
  try {
    user = await getValidatedSession(token);
  } catch {
    redirect('/login' as Route);
  }
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard' as Route);

  const disputes = await prisma.dispute.findMany({
    where: { status: 'OPEN' },
    include: {
      match: {
        include: {
          league: { select: { name: true, slug: true } },
          teamA: { select: { name: true } },
          teamB: { select: { name: true } },
        },
      },
      opener: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Administración</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Disputas abiertas</h1>
        <p className="text-sm text-slate-400 mt-0.5">{disputes.length} disputa{disputes.length !== 1 ? 's' : ''} pendiente{disputes.length !== 1 ? 's' : ''}</p>
      </div>

      {disputes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center text-gray-400">
          No hay disputas abiertas.
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((dispute) => (
            <div key={dispute.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-brand-navy">
                    {dispute.match.teamA?.name ?? '—'} vs {dispute.match.teamB?.name ?? '—'}
                  </p>
                  <p className="text-sm text-slate-400">
                    Liga: {dispute.match.league.name} · Abierta por {dispute.opener.name} ({dispute.opener.email})
                  </p>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {new Date(dispute.createdAt).toLocaleDateString('es-ES')}
                  </p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-red-50 to-rose-100 text-red-600">
                  Abierta
                </span>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Motivo</p>
                <p className="text-sm text-slate-600">{dispute.reason}</p>
              </div>

              <ResolveDisputeForm disputeId={dispute.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
