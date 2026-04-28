import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { MatchCardMisPartidos } from './_components/match-card-mis-partidos';

export const metadata = { title: 'Mis partidos — Padel League' };

export default async function MisPartidosPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token).catch(() => redirect('/login' as Route));

  const matches = await prisma.match.findMany({
    where: {
      status: { notIn: ['CANCELLED'] },
      OR: [
        { teamA: { members: { some: { userId: user.id } } } },
        { teamB: { members: { some: { userId: user.id } } } },
      ],
    },
    include: {
      league: { select: { id: true, name: true, slug: true } },
      teamA: { include: { members: { select: { userId: true } } } },
      teamB: { include: { members: { select: { userId: true } } } },
      confirmedResult: true,
      schedulingProposals: {
        where: { status: 'PROPOSED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { deadlineAt: 'asc' },
  });

  const confirmedMatches = matches
    .filter((m) => ['DATE_CONFIRMED', 'CONFIRMED', 'ADMIN_RESOLVED'].includes(m.status))
    .sort((a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0));
  const proposedMatches = matches.filter((m) => m.status === 'DATE_PROPOSED');
  const scheduledMatches = matches.filter((m) => m.status === 'SCHEDULED');
  const expiredMatches = matches.filter((m) => m.status === 'EXPIRED_UNPLAYED');

  // eslint-disable-next-line react-hooks/purity -- Server Component, Date.now() is safe here
  const now = Date.now();

  function buildCardProps(m: (typeof matches)[number]) {
    const teamAIds = m.teamA.members.map((tm) => tm.userId);

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
      teamAName: m.teamA.name,
      teamBName: m.teamB.name,
      teamAId: m.teamAId,
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
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Calendario</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Mis partidos</h1>
      </div>

      {matches.length === 0 && (
        <p className="text-slate-400 text-sm">No tienes partidos asignados todavía.</p>
      )}

      {confirmedMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Confirmados</h2>
          {confirmedMatches.map((m) => (
            <MatchCardMisPartidos key={m.id} {...buildCardProps(m)} />
          ))}
        </section>
      )}

      {proposedMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pendiente de confirmar</h2>
          {proposedMatches.map((m) => (
            <MatchCardMisPartidos key={m.id} {...buildCardProps(m)} />
          ))}
        </section>
      )}

      {scheduledMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin programar</h2>
          {scheduledMatches.map((m) => (
            <MatchCardMisPartidos key={m.id} {...buildCardProps(m)} />
          ))}
        </section>
      )}

      {expiredMatches.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-bold text-slate-400 uppercase tracking-widest select-none">
            No jugados ({expiredMatches.length})
          </summary>
          <div className="space-y-3 mt-3">
            {expiredMatches.map((m) => (
              <MatchCardMisPartidos key={m.id} {...buildCardProps(m)} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
