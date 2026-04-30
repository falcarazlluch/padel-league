import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService, calculateAvailableSlots } from '@/modules/independent-matches';
import { JoinPublicMatchInlineButton } from './[id]/_components/join-public-match-button';

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
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Partidos</p>
          <h1 className="text-2xl font-extrabold text-brand-navy">Jugar</h1>
        </div>
        <Link
          href={'/jugar/nuevo' as Route}
          className="text-sm px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold rounded-xl shadow-md hover:opacity-90 transition-opacity"
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
              ? 'border-brand-yellow text-brand-navy font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Tablón ({openMatches.filter((m) => calculateAvailableSlots(m.maxPlayers, m.confirmedCount) > 0).length})
        </Link>
        <Link
          href={'/jugar?tab=mis' as Route}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            !isTablon
              ? 'border-brand-yellow text-brand-navy font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Mis partidos ({myMatches.length})
        </Link>
      </div>

      {isTablon ? (
        <section>
          {openMatches.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay partidos abiertos en este momento.</p>
          ) : (
            <ul className="space-y-3">
              {openMatches.map((m) => {
                const available = calculateAvailableSlots(m.maxPlayers, m.confirmedCount);
                return (
                  <li key={m.id} className="block p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <Link href={`/jugar/${m.id}` as Route} className="min-w-0 flex-1">
                        <p className="font-bold text-brand-navy truncate">{m.name}</p>
                        {m.scheduledAt && (
                          <p className="text-sm text-slate-400 mt-0.5">
                            {new Intl.DateTimeFormat('es-ES', {
                              weekday: 'short', day: 'numeric', month: 'short',
                              hour: '2-digit', minute: '2-digit',
                              timeZone: 'Europe/Madrid',
                            }).format(new Date(m.scheduledAt))}
                          </p>
                        )}
                        {m.location && <p className="text-sm text-slate-400 truncate">{m.location}</p>}
                      </Link>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          available === 0 ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {available === 0 ? 'Completo' : `${available} libre${available !== 1 ? 's' : ''}`}
                        </span>
                        {available > 0 && <JoinPublicMatchInlineButton matchId={m.id} />}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <section>
          {myMatches.length === 0 ? (
            <p className="text-slate-400 text-sm">No tienes partidos activos.</p>
          ) : (
            <ul className="space-y-3">
              {myMatches.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/jugar/${m.id}` as Route}
                    className="block p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-bold text-brand-navy truncate">{m.name}</p>
                        <p className="text-xs text-slate-400 uppercase tracking-wide mt-0.5">
                          Partido abierto
                        </p>
                      </div>
                      <StatusBadge status={m.status} />
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    OPEN: { label: 'Abierto', className: 'bg-gradient-to-r from-blue-50 to-sky-100 text-blue-700' },
    PENDING_APPROVAL: { label: 'Pendiente', className: 'bg-gradient-to-r from-yellow-50 to-amber-100 text-amber-700' },
    CONFIRMED: { label: 'Confirmado', className: 'bg-gradient-to-r from-emerald-50 to-green-100 text-emerald-700' },
    REJECTED: { label: 'Rechazado', className: 'bg-gradient-to-r from-red-50 to-rose-100 text-red-600' },
    CANCELLED: { label: 'Cancelado', className: 'bg-gray-100 text-gray-500' },
  };
  const { label, className } = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-500' };
  return <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${className}`}>{label}</span>;
}
