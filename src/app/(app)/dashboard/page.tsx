import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { calculateStandings, CategoryProposalService, computeTeamProgress } from '@/modules/leagues';
import { MatchCommentaryService } from '@/modules/match-commentary';
import { CommentaryFeedCard } from '../ligas/[slug]/_components/commentary-feed-card';
import { CategoryProposalBanner } from './category-proposal-banner';
import { WinLossChart } from './win-loss-chart';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');
  const user = await getValidatedSession(token);

  const [leagueCount, matchCount, userLeagues, recentCommentaries, pendingCategoryProposals] = await Promise.all([
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
    prisma.league.findMany({
      where: {
        status: 'ACTIVE',
        registrations: {
          some: {
            withdrawnAt: null,
            team: { members: { some: { userId: user.id } } },
          },
        },
      },
      include: {
        registrations: {
          where: { withdrawnAt: null },
          include: {
            team: {
              select: {
                id: true,
                name: true,
                members: { select: { userId: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    MatchCommentaryService.listForUser(user.id, 5),
    CategoryProposalService.listPendingForUser(user.id),
  ]);

  // Compute standings + per-user-team progression for each league in parallel
  const leaguesWithStandings = await Promise.all(
    userLeagues.map(async (league) => {
      const matchesForStandings = await prisma.match.findMany({
        where: { leagueId: league.id, status: { in: ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'] } },
        include: { confirmedResult: { include: { sets: true } } },
      });
      const leagueTeams = league.registrations.map((r) => r.team);
      const teamNamesMap = Object.fromEntries(leagueTeams.map((t) => [t.id, t.name]));
      const standings = calculateStandings(
        teamNamesMap,
        matchesForStandings.map((m) => ({
          teamAId: m.teamAId,
          teamBId: m.teamBId,
          status: m.status as 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED',
          winnerTeamId: m.winnerTeamId,
          sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
        })),
      );
      const userTeamId = leagueTeams.find((t) => t.members.some((m) => m.userId === user.id))?.id;
      const userTeamName = userTeamId ? teamNamesMap[userTeamId] : null;
      const progress = userTeamId
        ? computeTeamProgress(
            matchesForStandings.map((m) => ({
              teamAId: m.teamAId,
              teamBId: m.teamBId,
              status: m.status as 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED',
              winnerTeamId: m.winnerTeamId,
              finalizedAt: m.updatedAt,
            })),
            userTeamId,
          )
        : [];
      const userRank = userTeamId
        ? standings.findIndex((s) => s.teamId === userTeamId) + 1
        : 0;
      const userPoints = userTeamId
        ? standings.find((s) => s.teamId === userTeamId)?.points ?? 0
        : 0;
      return {
        id: league.id, slug: league.slug, name: league.name,
        standings, userTeamId, userTeamName, progress,
        userRank: userRank > 0 ? userRank : null,
        userPoints,
        totalTeams: standings.length,
      };
    }),
  );

  const rankings = leaguesWithStandings
    .filter((l) => l.userTeamId !== undefined && l.userRank !== null)
    .sort((a, b) => (a.userRank ?? Infinity) - (b.userRank ?? Infinity));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Panel de control</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Bienvenido, {user.name}</h1>
      </div>

      <CategoryProposalBanner
        proposals={pendingCategoryProposals.map((p) => ({
          id: p.id,
          teamName: p.teamName,
          leagueName: p.leagueName,
          fromCategory: p.fromCategory,
          toCategory: p.toCategory,
          reason: p.reason,
        }))}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href={'/ligas' as Route}
          className="bg-gradient-to-br from-brand-navy to-brand-navy-light rounded-2xl p-5 shadow-lg hover:opacity-90 transition-opacity"
        >
          <p className="text-2xl font-extrabold text-brand-yellow">{leagueCount}</p>
          <p className="text-xs text-white/70 mt-1">Liga{leagueCount !== 1 ? 's' : ''} activa{leagueCount !== 1 ? 's' : ''}</p>
        </Link>

        <Link
          href={'/partidos' as Route}
          className="bg-gradient-to-br from-brand-blue to-brand-blue-light rounded-2xl p-5 shadow-lg hover:opacity-90 transition-opacity"
        >
          <p className="text-2xl font-extrabold text-white">{matchCount}</p>
          <p className="text-xs text-white/80 mt-1">Resultado{matchCount !== 1 ? 's' : ''} pendiente{matchCount !== 1 ? 's' : ''}</p>
        </Link>

        <Link
          href={'/partidos' as Route}
          className="bg-white rounded-2xl p-5 shadow-md border border-slate-200/80 hover:shadow-lg transition-shadow"
        >
          <p className="text-sm font-bold text-brand-navy">Mis partidos</p>
          <p className="text-xs text-slate-400 mt-1">Ver mis próximos partidos</p>
        </Link>
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

      {rankings.length > 0 && (
        <section>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Mis posiciones</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rankings.map((r) => {
              const medalClass =
                r.userRank === 1
                  ? 'bg-brand-yellow text-brand-navy'
                  : (r.userRank ?? 99) <= 3
                    ? 'bg-slate-200 text-slate-700'
                    : 'bg-slate-100 text-slate-500';
              return (
                <li key={r.id}>
                  <Link
                    href={`/ligas/${r.slug}` as Route}
                    className="flex items-center gap-3 bg-white rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow px-3 py-3"
                  >
                    <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold ${medalClass}`}>
                      {r.userRank}º
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-brand-navy truncate">
                        {r.userTeamName ?? 'Tu equipo'}
                      </span>
                      <span className="block text-xs text-slate-500 truncate">
                        {r.name} · {r.userPoints} pts · de {r.totalTeams}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {leaguesWithStandings.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mis ligas</p>
            <p className="text-xs text-slate-400 sm:hidden">Desliza →</p>
          </div>
          <div className="-mx-6 px-6 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 scroll-pl-6">
            {leaguesWithStandings.map((league) => (
              <Link
                key={league.id}
                href={`/ligas/${league.slug}` as Route}
                className="snap-start shrink-0 w-[85%] sm:w-80 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow p-5"
              >
                <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Clasificación</p>
                <h3 className="font-bold text-brand-navy mb-3 truncate">{league.name}</h3>
                {league.standings.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin datos todavía.</p>
                ) : (
                  <ol className="space-y-1.5">
                    {league.standings.slice(0, 5).map((entry, idx) => {
                      const isUserTeam = entry.teamId === league.userTeamId;
                      return (
                        <li
                          key={entry.teamId}
                          className={`flex items-center justify-between text-sm rounded-lg px-2 py-1 ${
                            isUserTeam ? 'bg-brand-yellow/15 font-semibold text-brand-navy' : ''
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                                idx === 0
                                  ? 'bg-brand-yellow text-brand-navy'
                                  : idx < 3
                                    ? 'bg-slate-200 text-slate-700'
                                    : 'text-slate-400'
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <span className="truncate text-slate-700">{entry.teamName}</span>
                          </span>
                          <span className="shrink-0 ml-2 font-bold text-brand-navy">{entry.points}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {league.userTeamId && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-[11px] font-semibold tracking-widest uppercase text-slate-400 mb-2">
                      Progreso de {league.userTeamName ?? 'tu equipo'}
                    </p>
                    <WinLossChart points={league.progress} width={260} height={56} />
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {recentCommentaries.length > 0 && (
        <section>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Últimas crónicas</p>
          <ul className="space-y-2">
            {recentCommentaries.map((c) => (
              <li key={c.id}>
                <CommentaryFeedCard item={c} showLeague={true} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
