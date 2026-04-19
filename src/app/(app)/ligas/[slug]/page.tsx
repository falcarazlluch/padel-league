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
import type { MatchStatus } from '@prisma/client';

const STATUS_LABEL: Record<MatchStatus, string> = {
  SCHEDULED: 'Pendiente',
  DATE_PROPOSED: 'Fecha propuesta',
  DATE_CONFIRMED: 'Fecha confirmada',
  PENDING_VALIDATION: 'Resultado enviado',
  CONFIRMED: 'Confirmado',
  ADMIN_RESOLVED: 'Resuelto admin',
  DISPUTED: 'En disputa',
  EXPIRED_UNPLAYED: 'No jugado',
  CANCELLED: 'Cancelado',
};

const STATUS_CLASS: Record<MatchStatus, string> = {
  SCHEDULED: 'bg-gray-100 text-gray-600',
  DATE_PROPOSED: 'bg-yellow-100 text-yellow-700',
  DATE_CONFIRMED: 'bg-blue-100 text-blue-700',
  PENDING_VALIDATION: 'bg-orange-100 text-orange-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  ADMIN_RESOLVED: 'bg-purple-100 text-purple-700',
  DISPUTED: 'bg-red-100 text-red-700',
  EXPIRED_UNPLAYED: 'bg-gray-100 text-gray-400',
  CANCELLED: 'bg-gray-100 text-gray-400',
};

export default async function LigaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);

  const [currentUser, league] = await Promise.all([
    getValidatedSession(token),
    LeagueService.getBySlug(slug).catch(() => null),
  ]);
  if (!league) notFound();

  const [teams, matches] = await Promise.all([
    LeagueService.getTeams(league.id),
    LeagueService.getMatches(league.id),
  ]);

  // Load confirmed + admin-resolved matches for standings calculation
  const confirmedMatches = await prisma.match.findMany({
    where: { leagueId: league.id, status: { in: ['CONFIRMED', 'ADMIN_RESOLVED'] } },
    include: { confirmedResult: { include: { sets: true } } },
  });

  const teamNamesMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const standingMatches = confirmedMatches.map((m) => ({
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    winnerTeamId: m.winnerTeamId,
    sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
  }));

  const standings = calculateStandings(teamNamesMap, standingMatches);

  const isLeagueAdmin = await prisma.leagueMember.findFirst({
    where: { leagueId: league.id, userId: currentUser.id, role: 'LEAGUE_ADMIN' },
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{league.name}</h1>
          {league.description && <p className="text-gray-500 mt-1">{league.description}</p>}
          <p className="text-sm text-gray-400 mt-1">
            {league.startDate.toLocaleDateString('es-ES')} – {league.endDate.toLocaleDateString('es-ES')}
          </p>
        </div>
        {isLeagueAdmin && league.status === 'DRAFT' && (
          <ActivateLeagueButton leagueId={league.id} />
        )}
      </div>

      {/* Equipos */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Equipos ({teams.length})</h2>
          {isLeagueAdmin && league.status === 'DRAFT' && (
            <Link
              href={`/ligas/${slug}/equipos/nueva` as Route}
              className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
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
              <div key={team.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="font-medium text-gray-900 mb-3">{team.name}</h3>
                <ul className="space-y-1.5">
                  {team.members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium shrink-0">
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

      {/* Clasificación — only if there are teams */}
      {teams.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Clasificación</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
        </section>
      )}

      {/* Partidos */}
      {matches.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Partidos ({matches.length})</h2>
          <div className="space-y-2">
            {matches.map((match) => (
              <Link
                key={match.id}
                href={`/ligas/${slug}/partidos/${match.id}` as Route}
                className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 font-medium text-gray-900 min-w-0">
                  <span className="truncate">{match.teamA.name}</span>
                  <span className="text-gray-400 text-xs shrink-0">vs</span>
                  <span className="truncate">{match.teamB.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {match.scheduledAt && (
                    <span className="text-xs text-gray-400">
                      {match.scheduledAt.toLocaleDateString('es-ES')}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[match.status]}`}>
                    {STATUS_LABEL[match.status]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
