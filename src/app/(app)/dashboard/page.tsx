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
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Panel de control</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Bienvenido, {user.name}</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-brand-navy to-brand-navy-light rounded-2xl p-5 shadow-lg">
          <p className="text-2xl font-extrabold text-brand-yellow">{leagueCount}</p>
          <p className="text-xs text-white/70 mt-1">Liga{leagueCount !== 1 ? 's' : ''} activa{leagueCount !== 1 ? 's' : ''}</p>
        </div>

        <div className="bg-gradient-to-br from-brand-blue to-brand-blue-light rounded-2xl p-5 shadow-lg">
          <p className="text-2xl font-extrabold text-white">{matchCount}</p>
          <p className="text-xs text-white/80 mt-1">Resultado{matchCount !== 1 ? 's' : ''} pendiente{matchCount !== 1 ? 's' : ''}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-md border border-slate-200/80">
          <p className="text-sm font-bold text-brand-navy">Mis partidos</p>
          <p className="text-xs text-slate-400 mt-1">Ver mis próximos partidos</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          href={'/ligas' as Route}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 transition-opacity"
        >
          Ver ligas
        </Link>
        {user.role === 'SUPER_ADMIN' && (
          <Link
            href={'/admin/usuarios/invitar' as Route}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          >
            Invitar jugador
          </Link>
        )}
      </div>
    </div>
  );
}
