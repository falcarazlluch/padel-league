import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { LeagueService, calculateStandings } from '@/modules/leagues';
import { prisma } from '@/shared/db/client';
import { ActivateLeagueButton } from './activate-button';
import { AddMemberForm } from './add-member-form';
import { PartidosTab } from './_components/partidos-tab';
import { MatchCommentaryService } from '@/modules/match-commentary';
import { CommentaryFeedCard } from './_components/commentary-feed-card';

export default async function LigaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; jornada?: string }>;
}) {
  const { slug } = await params;
  const { tab, jornada } = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);

  const [currentUser, league] = await Promise.all([
    getValidatedSession(token),
    LeagueService.getBySlug(slug).catch(() => null),
  ]);
  if (!league) notFound();

  const [teams] = await Promise.all([
    LeagueService.getTeams(league.id),
  ]);

  // Load confirmed + admin-resolved matches for standings calculation
  const matchesForStandings = await prisma.match.findMany({
    where: { leagueId: league.id, status: { in: ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'] } },
    include: { confirmedResult: { include: { sets: true } } },
  });

  const teamNamesMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const standingMatches = matchesForStandings.map((m) => ({
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    status: m.status as 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED',
    winnerTeamId: m.winnerTeamId,
    sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
  }));

  const standings = calculateStandings(teamNamesMap, standingMatches);

  const isLeagueAdmin =
    currentUser.role === 'SUPER_ADMIN' ||
    !!(await prisma.leagueMember.findFirst({
      where: { leagueId: league.id, userId: currentUser.id, role: 'LEAGUE_ADMIN' },
    }));

  // Fetch matches with confirmed sets for the Partidos tab
  const matchesWithSets = await prisma.match.findMany({
    where: { leagueId: league.id },
    include: {
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
      confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
    },
    orderBy: [{ round: 'asc' }, { deadlineAt: 'asc' }],
  });

  const matchesForJornada = matchesWithSets.map((m) => ({
    id: m.id,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    teamA: m.teamA,
    teamB: m.teamB,
    status: m.status,
    scheduledAt: m.scheduledAt,
    deadlineAt: m.deadlineAt,
    round: m.round,
    winnerTeamId: m.winnerTeamId,
    confirmedSets: m.confirmedResult?.sets ?? [],
  }));

  const cronicas = tab === 'cronicas'
    ? await MatchCommentaryService.listForLeague(league.id, 20)
    : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Liga</p>
          <h1 className="text-2xl font-extrabold text-brand-navy">{league.name}</h1>
          {league.description && <p className="text-slate-500 mt-1">{league.description}</p>}
          <p className="text-sm text-slate-400 mt-1">
            {league.startDate.toLocaleDateString('es-ES')} – {league.endDate.toLocaleDateString('es-ES')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isLeagueAdmin && (
            <Link
              href={`/ligas/${slug}/editar` as Route}
              className="text-sm px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
            >
              Editar liga
            </Link>
          )}
          {isLeagueAdmin && league.status === 'DRAFT' && (
            <ActivateLeagueButton leagueId={league.id} />
          )}
        </div>
      </div>

      {/* Equipos */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Equipos ({teams.length})</h2>
          {isLeagueAdmin && league.status === 'DRAFT' && (
            <Link
              href={`/ligas/${slug}/equipos/nueva` as Route}
              className="text-sm px-3 py-1.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-semibold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
            >
              Añadir equipo
            </Link>
          )}
        </div>
        {teams.length === 0 ? (
          <p className="text-sm text-gray-400">No hay equipos en esta liga todavía.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <div key={team.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="font-medium text-gray-900 mb-3">{team.name}</h3>
                <ul className="space-y-1.5">
                  {team.members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-xs flex items-center justify-center font-semibold shrink-0">
                        {m.user.name[0]?.toUpperCase()}
                      </span>
                      {m.user.name}
                    </li>
                  ))}
                  {team.members.length < 2 && isLeagueAdmin && league.status === 'DRAFT' && (
                    <li className="mt-2">
                      <AddMemberForm teamId={team.id} />
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tabs: Clasificación / Partidos / Crónicas */}
      {teams.length > 0 && (
        <section>
          <div className="flex border-b border-gray-200 mb-4">
            <Link
              href={`/ligas/${slug}` as Route}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab !== 'partidos' && tab !== 'cronicas'
                  ? 'border-brand-yellow text-brand-navy font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Clasificación
            </Link>
            <Link
              href={`/ligas/${slug}?tab=partidos` as Route}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'partidos'
                  ? 'border-brand-yellow text-brand-navy font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Partidos
            </Link>
            <Link
              href={`/ligas/${slug}?tab=cronicas` as Route}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'cronicas'
                  ? 'border-brand-yellow text-brand-navy font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Crónicas
            </Link>
          </div>

          {tab === 'partidos' && (
            <PartidosTab
              slug={slug}
              matches={matchesForJornada}
              activeJornada={jornada ? parseInt(jornada, 10) : null}
            />
          )}

          {tab === 'cronicas' && (
            cronicas.length === 0 ? (
              <p className="text-sm text-slate-400">Aún no hay crónicas en esta liga.</p>
            ) : (
              <div className="space-y-3">
                {cronicas.map((c) => (
                  <CommentaryFeedCard key={c.id} item={c} showLeague={false} />
                ))}
              </div>
            )
          )}

          {tab !== 'partidos' && tab !== 'cronicas' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Equipo</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">PJ</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">G</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">E</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">P</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Sets</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600 font-bold">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {standings.map((entry, idx) => (
                    <tr key={entry.teamId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{entry.teamName}</td>
                      <td className="px-3 py-3 text-center text-gray-600">{entry.played}</td>
                      <td className="px-3 py-3 text-center text-green-600">{entry.won}</td>
                      <td className="px-3 py-3 text-center text-gray-500">{entry.drawn}</td>
                      <td className="px-3 py-3 text-center text-red-500">{entry.lost}</td>
                      <td className="px-3 py-3 text-center text-gray-500">
                        {entry.setsDiff > 0 ? `+${entry.setsDiff}` : entry.setsDiff}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-gray-900">{entry.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
