import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { IndependentMatchService } from '@/modules/independent-matches';
import { MatchCardMisPartidos } from './_components/match-card-mis-partidos';
import { PartidosSubnav } from '../_components/partidos-subnav';
import { PendingInvitationActions } from '../jugar/_components/pending-invitation-actions';
import { PlayerStack } from '../_components/player-stack';

export const metadata = { title: 'Mis partidos — Padel League' };

export default async function MisPartidosPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token).catch(() => redirect('/login' as Route));

  const [matches, independentMatches, pendingInvitations] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: { notIn: ['CANCELLED'] },
        OR: [
          { teamA: { members: { some: { userId: user.id } } } },
          { teamB: { members: { some: { userId: user.id } } } },
        ],
      },
      include: {
        league: { select: { id: true, name: true, slug: true } },
        teamA: {
          include: {
            members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
          },
        },
        teamB: {
          include: {
            members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
          },
        },
        confirmedResult: true,
        schedulingProposals: {
          where: { status: 'PROPOSED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      // Earliest scheduled date first, then earliest deadline; matches without
      // a date sort to the bottom (NULLS LAST). The page groups by status
      // afterwards, but each group stays in chronological order.
      orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { deadlineAt: 'asc' }],
    }),
    prisma.independentMatch.findMany({
      where: {
        status: { notIn: ['CANCELLED', 'REJECTED'] },
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
      orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    }),
    IndependentMatchService.getPendingInvitationsForUser(user.id),
  ]);

  const activeIndependent = independentMatches.filter((m) =>
    ['OPEN', 'PENDING_APPROVAL', 'CONFIRMED'].includes(m.status),
  );

  const confirmedMatches = matches
    .filter((m) => ['DATE_CONFIRMED', 'CONFIRMED', 'ADMIN_RESOLVED'].includes(m.status))
    .sort((a, b) => (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity));
  // For proposed-but-not-confirmed matches sort by the active proposal date,
  // which carries the meaningful "next event" timestamp (scheduledAt is null).
  const proposedMatches = matches
    .filter((m) => m.status === 'DATE_PROPOSED')
    .sort((a, b) => {
      const aTs = a.schedulingProposals[0]?.proposedDate.getTime() ?? Infinity;
      const bTs = b.schedulingProposals[0]?.proposedDate.getTime() ?? Infinity;
      return aTs - bTs;
    });
  const scheduledMatches = matches
    .filter((m) => m.status === 'SCHEDULED')
    .sort((a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime());
  const expiredMatches = matches.filter((m) => m.status === 'EXPIRED_UNPLAYED');

  // eslint-disable-next-line react-hooks/purity -- Server Component, Date.now() is safe here
  const now = Date.now();

  function buildCardProps(m: (typeof matches)[number]) {
    // El listado clásico solo aplica a matches con dos equipos. Filtrar por
    // teamId NOT NULL en la query mantendrá éste path limpio de Americana
    // ROTATING_INDIVIDUAL.
    if (!m.teamA || !m.teamB) return null;
    const teamA = m.teamA;
    const teamB = m.teamB;
    const teamAIds = teamA.members.map((tm) => tm.userId);

    let proposalState: 'none' | 'mine' | 'rival' = 'none';
    let proposedDate: string | null = null;
    const proposal = m.schedulingProposals[0];
    if (proposal) {
      proposedDate = proposal.proposedDate.toISOString();
      const proposerOnTeamA = teamAIds.includes(proposal.proposedByUserId);
      const userOnTeamA = teamAIds.includes(user.id);
      proposalState = proposerOnTeamA === userOnTeamA ? 'mine' : 'rival';
    }

    return {
      matchId: m.id,
      leagueSlug: m.league.slug,
      leagueName: m.league.name,
      teamA: {
        id: teamA.id,
        name: teamA.name,
        logoUrl: teamA.logoUrl,
        members: teamA.members.map((mb) => mb.user),
      },
      teamB: {
        id: teamB.id,
        name: teamB.name,
        logoUrl: teamB.logoUrl,
        members: teamB.members.map((mb) => mb.user),
      },
      status: m.status,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      daysToDeadline: Math.ceil((m.deadlineAt.getTime() - now) / 86_400_000),
      proposalState,
      proposedDate,
      winnerTeamId: m.winnerTeamId,
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Partidos</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Mis partidos</h1>
      </div>

      <PartidosSubnav active="mis" />

      {pendingInvitations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-amber-700 uppercase tracking-widest">Invitaciones pendientes</h2>
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
                        {dateStr ?? 'Fecha por definir'}
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
        </section>
      )}

      {matches.length === 0 && activeIndependent.length === 0 && pendingInvitations.length === 0 && (
        <p className="text-slate-400 text-sm">No tienes partidos asignados todavía.</p>
      )}

      {confirmedMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Confirmados</h2>
          {confirmedMatches.map((m) => {
            const props = buildCardProps(m);
            return props ? <MatchCardMisPartidos key={m.id} {...props} /> : null;
          })}
        </section>
      )}

      {proposedMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pendiente de confirmar</h2>
          {proposedMatches.map((m) => {
            const props = buildCardProps(m);
            return props ? <MatchCardMisPartidos key={m.id} {...props} /> : null;
          })}
        </section>
      )}

      {scheduledMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin programar</h2>
          {scheduledMatches.map((m) => {
            const props = buildCardProps(m);
            return props ? <MatchCardMisPartidos key={m.id} {...props} /> : null;
          })}
        </section>
      )}

      {activeIndependent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Partidos sueltos</h2>
          {activeIndependent.map((m) => {
            const dateStr = m.scheduledAt
              ? new Date(m.scheduledAt).toLocaleDateString('es-ES', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : null;
            const statusClass =
              m.status === 'CONFIRMED'
                ? 'bg-gradient-to-r from-emerald-50 to-green-100 text-emerald-700'
                : m.status === 'PENDING_APPROVAL'
                  ? 'bg-gradient-to-r from-yellow-50 to-amber-100 text-amber-700'
                  : 'bg-gradient-to-r from-blue-50 to-sky-100 text-blue-700';
            const statusLabel =
              m.status === 'CONFIRMED'
                ? 'Confirmado'
                : m.status === 'PENDING_APPROVAL'
                  ? 'Pendiente'
                  : 'Abierto';
            return (
              <Link
                key={m.id}
                href={`/jugar/${m.id}` as Route}
                className="block bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-bold text-brand-navy truncate">{m.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {dateStr ?? 'Fecha por definir'}
                      {m.location ? ` · ${m.location}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${statusClass}`}>
                    {statusLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <PlayerStack players={m.participants.map((p) => p.user)} />
                  <p className="text-xs text-slate-500 shrink-0">
                    {m.participants.length}/{m.maxPlayers}
                  </p>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      {expiredMatches.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-bold text-slate-400 uppercase tracking-widest select-none">
            No jugados ({expiredMatches.length})
          </summary>
          <div className="space-y-3 mt-3">
            {expiredMatches.map((m) => {
              const props = buildCardProps(m);
              return props ? <MatchCardMisPartidos key={m.id} {...props} /> : null;
            })}
          </div>
        </details>
      )}
    </div>
  );
}
