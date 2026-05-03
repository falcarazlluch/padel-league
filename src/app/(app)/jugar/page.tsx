import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService, calculateAvailableSlots } from '@/modules/independent-matches';
import { JoinPublicMatchInlineButton } from './[id]/_components/join-public-match-button';
import { PendingInvitationActions } from './_components/pending-invitation-actions';
import { PartidosSubnav } from '../_components/partidos-subnav';

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

  const [openMatches, myMatches, pendingInvitations] = await Promise.all([
    IndependentMatchService.listOpen(),
    IndependentMatchService.getForUser(user.id),
    IndependentMatchService.getPendingInvitationsForUser(user.id),
  ]);

  const isTablon = tab !== 'mis';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Partidos</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">{isTablon ? 'Tablón' : 'Mis partidos'}</h1>
      </div>

      <PartidosSubnav active={isTablon ? 'tablon' : 'mis'} />

      {isTablon ? (
        <section>
          {openMatches.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay partidos abiertos en este momento.</p>
          ) : (
            <ul className="space-y-3">
              {(() => {
                const myMatchIds = new Set(myMatches.map((m) => m.id));
                return openMatches.map((m) => {
                  const available = calculateAvailableSlots(m.maxPlayers, m.confirmedCount);
                  return (
                    <li key={m.id} className="block p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <Link href={`/jugar/${m.id}` as Route} className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-brand-navy truncate">{m.name}</p>
                            {m.organizerId === user.id && (
                              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-brand-navy text-white shrink-0">
                                Organizo
                              </span>
                            )}
                          </div>
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
                          {myMatchIds.has(m.id) ? (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">Estás dentro</span>
                          ) : available > 0 ? (
                            <JoinPublicMatchInlineButton matchId={m.id} />
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                });
              })()}
            </ul>
          )}
        </section>
      ) : (
        <section>
          {pendingInvitations.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-amber-700 uppercase tracking-widest mb-2">Invitaciones pendientes</h2>
              <ul className="space-y-3">
                {pendingInvitations.map((m) => {
                  const dateStr = m.scheduledAt
                    ? new Intl.DateTimeFormat('es-ES', {
                        weekday: 'short', day: 'numeric', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                        timeZone: 'Europe/Madrid',
                      }).format(new Date(m.scheduledAt))
                    : null;
                  return (
                    <li key={m.id} className="block p-4 bg-amber-50 border border-amber-200 rounded-2xl shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <Link href={`/jugar/${m.id}` as Route} className="min-w-0 flex-1">
                          <p className="font-bold text-brand-navy truncate">{m.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {dateStr ?? 'Sin fecha'}
                            {m.location ? ` · ${m.location}` : ''}
                          </p>
                          <p className="text-xs text-amber-700 uppercase tracking-wide mt-1">Invitación pendiente</p>
                        </Link>
                        <PendingInvitationActions matchId={m.id} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {myMatches.length === 0 && pendingInvitations.length === 0 ? (
            <p className="text-slate-400 text-sm">No tienes partidos activos.</p>
          ) : myMatches.length > 0 ? (
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
          ) : null}
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
