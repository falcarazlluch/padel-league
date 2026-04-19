import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');
  const user = await getValidatedSession(token);

  const [leagueCount, matchCount] = await Promise.all([
    prisma.league.count({ where: { status: 'ACTIVE' } }),
    prisma.match.count({
      where: {
        status: 'PENDING_VALIDATION',
        OR: [
          { teamA: { members: { some: { userId: user.id } } } },
          { teamB: { members: { some: { userId: user.id } } } },
        ],
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bienvenido, {user.name}</h1>
        <p className="text-sm text-gray-500 mt-1">Panel de control de Padel League</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-navy flex items-center justify-center shrink-0">
            <span className="text-2xl">🏆</span>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{leagueCount}</p>
            <p className="text-sm text-gray-500">Liga{leagueCount !== 1 ? 's' : ''} activa{leagueCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-yellow flex items-center justify-center shrink-0">
            <span className="text-2xl">⏳</span>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{matchCount}</p>
            <p className="text-sm text-gray-500">Resultado{matchCount !== 1 ? 's' : ''} pendiente{matchCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-green flex items-center justify-center shrink-0">
            <span className="text-2xl">🎾</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Mis partidos</p>
            <p className="text-xs text-gray-500">Ver mis próximos partidos</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          href={'/ligas' as Route}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-navy text-white text-sm font-semibold rounded-lg hover:bg-brand-navy-light transition-colors"
        >
          Ver ligas
        </Link>
        {user.role === 'SUPER_ADMIN' && (
          <Link
            href={'/admin/usuarios/invitar' as Route}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors"
          >
            Invitar jugador
          </Link>
        )}
      </div>
    </div>
  );
}
