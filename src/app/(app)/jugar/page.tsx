import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService, calculateAvailableSlots } from '@/modules/independent-matches';

export const metadata = { title: 'Jugar — Padel League' };

export default async function JugarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token).catch(() => redirect('/login' as Route));

  const [openMatches, myMatches] = await Promise.all([
    IndependentMatchService.listOpen(),
    IndependentMatchService.getForUser(user.id),
  ]);

  const isTablon = tab !== 'mis';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Jugar</h1>
        <Link
          href={'/jugar/nuevo' as Route}
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          Crear partido
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <Link
          href={'/jugar' as Route}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            isTablon
              ? 'border-brand-navy text-brand-navy'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Tablón ({openMatches.filter((m) => calculateAvailableSlots(m.maxPlayers, m.confirmedCount) > 0).length})
        </Link>
        <Link
          href={'/jugar?tab=mis' as Route}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            !isTablon
              ? 'border-brand-navy text-brand-navy'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Mis partidos ({myMatches.length})
        </Link>
      </div>

      {isTablon ? (
        <section>
          {openMatches.length === 0 ? (
            <p className="text-gray-500 text-sm">No hay partidos abiertos en este momento.</p>
          ) : (
            <ul className="space-y-3">
              {openMatches.map((m) => {
                const available = calculateAvailableSlots(m.maxPlayers, m.confirmedCount);
                return (
                  <li key={m.id}>
                    <Link
                      href={`/jugar/${m.id}` as Route}
                      className="block p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{m.name}</p>
                          {m.scheduledAt && (
                            <p className="text-sm text-gray-500 mt-0.5">
                              {new Date(m.scheduledAt).toLocaleDateString('es-ES', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          )}
                          {m.location && (
                            <p className="text-sm text-gray-500 truncate">{m.location}</p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                            available === 0
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-green-50 text-green-700'
                          }`}
                        >
                          {available === 0 ? 'Completo' : `${available} libre${available !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <section>
          {myMatches.length === 0 ? (
            <p className="text-gray-500 text-sm">No tienes partidos activos.</p>
          ) : (
            <ul className="space-y-3">
              {myMatches.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/jugar/${m.id}` as Route}
                    className="block p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{m.name}</p>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mt-0.5">
                          {m.type === 'OPEN' ? 'Abierto' : 'Reto de equipos'}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                          m.status === 'CONFIRMED'
                            ? 'bg-green-50 text-green-700'
                            : m.status === 'PENDING_APPROVAL'
                            ? 'bg-yellow-50 text-yellow-700'
                            : m.status === 'CANCELLED' || m.status === 'REJECTED'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {m.status === 'CONFIRMED'
                          ? 'Confirmado'
                          : m.status === 'PENDING_APPROVAL'
                          ? 'Pendiente'
                          : m.status === 'CANCELLED'
                          ? 'Cancelado'
                          : m.status === 'REJECTED'
                          ? 'Rechazado'
                          : 'Abierto'}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
