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

  const FINISHED = ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'];
  const activeMatches = matches.filter((m) => !FINISHED.includes(m.status));
  const finishedMatches = matches.filter((m) => FINISHED.includes(m.status));

  function buildCardProps(m: (typeof matches)[number]) {
    const teamAIds = m.teamA.members.map((tm) => tm.userId);
    const currentUserTeamId = teamAIds.includes(user.id) ? m.teamAId : m.teamBId;

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
      teamBId: m.teamBId,
      status: m.status,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      deadlineAt: m.deadlineAt.toISOString(),
      proposalState,
      proposedDate,
      winnerTeamId: m.winnerTeamId,
      currentUserTeamId,
    };
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mis partidos</h1>

      {matches.length === 0 && (
        <p className="text-gray-500 text-sm">No tienes partidos asignados todavía.</p>
      )}

      {activeMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Pendientes</h2>
          {activeMatches.map((m) => (
            <MatchCardMisPartidos key={m.id} {...buildCardProps(m)} />
          ))}
        </section>
      )}

      {finishedMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Jugados</h2>
          {finishedMatches.map((m) => (
            <MatchCardMisPartidos key={m.id} {...buildCardProps(m)} />
          ))}
        </section>
      )}
    </div>
  );
}
