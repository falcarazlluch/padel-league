import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { LeagueService, calculateStandings, CATEGORY_LABEL, categoryBadgeClass } from '@/modules/leagues';
import { prisma } from '@/shared/db/client';
import { ActivateLeagueButton } from './activate-button';
import { PartidosTab } from './_components/partidos-tab';
import { MatchCommentaryService } from '@/modules/match-commentary';
import { CommentaryFeedCard } from './_components/commentary-feed-card';
import { MatchResultRow } from '@/app/(app)/_components/match-result-row';
import { LeagueRegistrationPanel } from './registration-panel';
import { TeamLogo } from '@/modules/teams/presentation/team-logo';
import type { LeagueStatus } from '@prisma/client';
import {
  deriveLeagueStatus,
  DISPLAY_STATUS_CLASS,
  DISPLAY_STATUS_LABEL,
} from '@/modules/leagues/presentation/league-status';

function computeRegistrationWindow(
  status: LeagueStatus,
  registrationStart: Date,
  registrationEnd: Date,
): 'open' | 'future' | 'past' | 'closed' {
  if (status !== 'DRAFT') return 'closed';
  const now = Date.now();
  if (now < registrationStart.getTime()) return 'future';
  if (now > registrationEnd.getTime()) return 'past';
  return 'open';
}

function readNow(): number {
  return Date.now();
}

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

  // Teams the current user belongs to + their registration status for this league.
  const userTeams = await prisma.team.findMany({
    where: { members: { some: { userId: currentUser.id } } },
    include: {
      members: { select: { userId: true } },
      registrations: { where: { leagueId: league.id }, select: { withdrawnAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const userTeamsForRegistration = userTeams.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    memberCount: t.members.length,
    isRegistered: t.registrations.some((r) => r.withdrawnAt === null),
  }));

  // Load confirmed + admin-resolved matches for standings calculation
  const matchesForStandings = await prisma.match.findMany({
    where: { leagueId: league.id, status: { in: ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'] } },
    include: { confirmedResult: { include: { sets: true } } },
  });

  const teamNamesMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const teamLogoMap = Object.fromEntries(teams.map((t) => [t.id, t.logoUrl]));
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
    (currentUser.role === 'LEAGUE_ADMIN' && league.createdByUserId === currentUser.id);

  // Fetch matches with confirmed sets for the Partidos tab
  const matchesWithSets = await prisma.match.findMany({
    where: { leagueId: league.id },
    include: {
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

  const finalizedMatches = tab === 'resultados'
    ? matchesWithSets
        .filter((m) => m.status === 'CONFIRMED' || m.status === 'ADMIN_RESOLVED' || m.status === 'EXPIRED_UNPLAYED')
        .sort((a, b) => (b.scheduledAt?.getTime() ?? 0) - (a.scheduledAt?.getTime() ?? 0))
    : [];

  const registrationWindow = computeRegistrationWindow(
    league.status,
    league.registrationStart,
    league.registrationEnd,
  );
  const displayStatus = deriveLeagueStatus(
    league.status,
    league.registrationStart,
    league.registrationEnd,
    readNow(),
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Liga</p>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-brand-navy">{league.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${categoryBadgeClass(league.category)}`}>
              {CATEGORY_LABEL[league.category]}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${DISPLAY_STATUS_CLASS[displayStatus]}`}>
              {DISPLAY_STATUS_LABEL[displayStatus]}
            </span>
          </div>
          {league.description && <p className="text-slate-500 mt-1">{league.description}</p>}
          <p className="text-sm text-slate-400 mt-1">
            Liga: {league.startDate.toLocaleDateString('es-ES')} – {league.endDate.toLocaleDateString('es-ES')}
          </p>
          <p className="text-sm text-slate-400">
            Inscripción: {league.registrationStart.toLocaleDateString('es-ES')} – {league.registrationEnd.toLocaleDateString('es-ES')}
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

      {/* Inscripción */}
      <LeagueRegistrationPanel
        leagueId={league.id}
        leagueStatus={league.status}
        registrationWindow={registrationWindow}
        userTeams={userTeamsForRegistration}
      />

      {/* Equipos apuntados */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Equipos apuntados ({teams.length})</h2>
        {teams.length === 0 ? (
          <p className="text-sm text-gray-400">No hay equipos apuntados todavía.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <Link
                key={team.id}
                href={`/equipos/${team.id}` as Route}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamLogo url={team.logoUrl} name={team.name} size="md" />
                    <h3 className="font-medium text-gray-900 truncate">{team.name}</h3>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${categoryBadgeClass(team.category)}`}>
                    {CATEGORY_LABEL[team.category]}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {team.members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-xs flex items-center justify-center font-semibold shrink-0">
                        {m.user.name[0]?.toUpperCase()}
                      </span>
                      {m.user.name}
                    </li>
                  ))}
                </ul>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Tabs: Clasificación / Partidos / Crónicas */}
      {teams.length > 0 && (
        <section>
          <div className="flex border-b border-gray-200 mb-4 flex-wrap">
            <Link
              href={`/ligas/${slug}` as Route}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab !== 'partidos' && tab !== 'cronicas' && tab !== 'resultados'
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
              href={`/ligas/${slug}?tab=resultados` as Route}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'resultados'
                  ? 'border-brand-yellow text-brand-navy font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Resultados
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
              teamLogos={teamLogoMap}
            />
          )}

          {tab === 'resultados' && (
            finalizedMatches.length === 0 ? (
              <p className="text-sm text-slate-400">Aún no hay resultados en esta liga.</p>
            ) : (
              <div className="space-y-3">
                {finalizedMatches.map((m) => (
                  <MatchResultRow
                    key={m.id}
                    matchId={m.id}
                    leagueSlug={slug}
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
              </div>
            )
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

          {tab !== 'partidos' && tab !== 'cronicas' && tab !== 'resultados' && (
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
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link href={`/equipos/${entry.teamId}` as Route} className="flex items-center gap-2 hover:underline">
                          <TeamLogo url={teamLogoMap[entry.teamId] ?? null} name={entry.teamName} size="sm" />
                          <span className="truncate">{entry.teamName}</span>
                        </Link>
                      </td>
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
