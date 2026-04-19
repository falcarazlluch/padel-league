import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { ResolveDisputeForm } from './resolve-form';

export default async function DisputasAdminPage() {
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
        <h1 className="text-2xl font-bold text-gray-900">Disputas abiertas</h1>
        <p className="text-gray-500 mt-1">{disputes.length} disputa{disputes.length !== 1 ? 's' : ''} pendiente{disputes.length !== 1 ? 's' : ''}</p>
      </div>

      {disputes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No hay disputas abiertas.
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((dispute) => (
            <div key={dispute.id} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-gray-900">
                    {dispute.match.teamA.name} vs {dispute.match.teamB.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    Liga: {dispute.match.league.name} · Abierta por {dispute.opener.name} ({dispute.opener.email})
                  </p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {new Date(dispute.createdAt).toLocaleDateString('es-ES')}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-1">Motivo:</p>
                <p className="text-sm text-gray-600">{dispute.reason}</p>
              </div>

              <ResolveDisputeForm disputeId={dispute.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
