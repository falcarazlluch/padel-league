import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { PartidosSubnav } from '../_components/partidos-subnav';
import { MatchResultRow } from '../_components/match-result-row';
import { PlayerStack } from '../_components/player-stack';

export const metadata = { title: 'Resultados — Padel League' };

const FINAL_STATUSES = ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'] as const;

function formatIndependentDate(date: Date | null): string {
  if (!date) return 'Fecha por definir';
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

export default async function ResultadosPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token).catch(() => redirect('/login' as Route));

  const now = new Date();

  const [leagueMatches, independentMatches] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: { in: [...FINAL_STATUSES] },
        OR: [
          { teamA: { members: { some: { userId: user.id } } } },
          { teamB: { members: { some: { userId: user.id } } } },
        ],
      },
      include: {
        league: { select: { slug: true, name: true } },
        teamA: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
          },
        },
        teamB: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
          },
        },
        confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
      },
      orderBy: [{ scheduledAt: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    }),
    prisma.independentMatch.findMany({
      where: {
        status: { not: 'CANCELLED' },
        scheduledAt: { lt: now },
        OR: [
          { organizerId: user.id },
          { participants: { some: { userId: user.id, status: 'ACCEPTED' } } },
        ],
      },
      include: {
        participants: {
          where: { status: 'ACCEPTED' },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
      orderBy: [{ scheduledAt: 'desc' }],
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Partidos</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Mis resultados</h1>
        <p className="text-sm text-slate-500 mt-1">
          Histórico de los partidos jugados o cerrados, en cualquier liga y partidos sueltos.
        </p>
      </div>

      <PartidosSubnav active="resultados" />

      {leagueMatches.length === 0 && independentMatches.length === 0 && (
        <p className="text-slate-400 text-sm">Aún no tienes resultados que mostrar.</p>
      )}

      {leagueMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Partidos de liga</h2>
          {leagueMatches.map((m) => (
            <MatchResultRow
              key={m.id}
              matchId={m.id}
              leagueSlug={m.league.slug}
              leagueName={m.league.name}
              scheduledAt={m.scheduledAt}
              teamA={{
                id: m.teamA.id,
                name: m.teamA.name,
                logoUrl: m.teamA.logoUrl,
                members: m.teamA.members.map((mb) => mb.user),
              }}
              teamB={{
                id: m.teamB.id,
                name: m.teamB.name,
                logoUrl: m.teamB.logoUrl,
                members: m.teamB.members.map((mb) => mb.user),
              }}
              winnerTeamId={m.winnerTeamId}
              sets={m.confirmedResult?.sets ?? []}
              adminResolved={m.status === 'ADMIN_RESOLVED'}
              expiredUnplayed={m.status === 'EXPIRED_UNPLAYED'}
            />
          ))}
        </section>
      )}

      {independentMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Partidos sueltos</h2>
          <ul className="space-y-3">
            {independentMatches.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/jugar/${m.id}` as Route}
                  className="block bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow p-4"
                >
                  <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                    <p className="font-bold text-brand-navy truncate">{m.name}</p>
                    <span className="text-xs text-slate-400">{formatIndependentDate(m.scheduledAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <PlayerStack players={m.participants.map((p) => p.user)} />
                    <p className="text-xs text-slate-500 shrink-0">
                      {m.location ? `${m.location} · ` : ''}
                      {m.participants.length}/{m.maxPlayers}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
