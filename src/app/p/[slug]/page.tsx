import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/shared/db/client';
import {
  calculateStandings,
  CATEGORY_LABEL,
  categoryBadgeClass,
} from '@/modules/leagues';
import {
  calculateAmericanaIndividualStandings,
  calculateAmericanaPairsStandings,
} from '@/modules/leagues/application/americana-standings';
import {
  COMPETITION_TYPE_LABEL,
  COMPETITION_TYPE_BADGE_CLASS,
} from '@/modules/leagues/presentation/competition-type';
import {
  deriveLeagueStatus,
  DISPLAY_STATUS_CLASS,
  DISPLAY_STATUS_LABEL,
} from '@/modules/leagues/presentation/league-status';
import {
  AmericanaRoundsGrid,
  type AmericanaMatchView,
} from '@/app/(app)/ligas/[slug]/_components/americana-rounds-grid';
import {
  AmericanaStandingsTable,
  type AmericanaStandingsRow,
} from '@/app/(app)/ligas/[slug]/_components/americana-standings-table';
import {
  BracketTree,
  type BracketCell,
} from '@/app/(app)/ligas/[slug]/_components/bracket-tree';
import {
  GroupStandings,
  type GroupView,
} from '@/app/(app)/ligas/[slug]/_components/group-standings';

// Página pública (sin login) de una competición. URL "compartible" para clubes
// que quieran enseñar resultados sin pedir registro al visitante. Solo lectura:
// no se muestran botones de admin, inscripción ni enlaces a detalles de match
// (todos ellos requieren sesión).

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const league = await prisma.league.findUnique({
    where: { slug },
    select: { name: true, description: true, type: true, category: true },
  });
  if (!league) return { title: 'Competición no encontrada · Padel League' };
  return {
    title: `${league.name} · Padel League`,
    description:
      league.description ??
      `${COMPETITION_TYPE_LABEL[league.type]} de pádel categoría ${CATEGORY_LABEL[league.category]}.`,
    openGraph: {
      title: league.name,
      description:
        league.description ??
        `${COMPETITION_TYPE_LABEL[league.type]} de pádel · ${CATEGORY_LABEL[league.category]}`,
      type: 'website',
    },
  };
}

export default async function CompetitionPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;

  const league = await prisma.league.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      category: true,
      status: true,
      registrationStart: true,
      registrationEnd: true,
      startDate: true,
      endDate: true,
      americanaVariant: true,
      americanaCourts: true,
      hasGroupPhase: true,
    },
  });
  if (!league) notFound();

  // No exponemos detalles de DRAFT (todavía no anunciada al mundo). Mostramos
  // un placeholder amable para que la URL no tire 404 si se compartió por
  // error: tras activarse, el contenido aparece.
  if (league.status === 'DRAFT') {
    return (
      <PublicShell>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center space-y-3">
          <h1 className="text-xl font-extrabold text-brand-navy">{league.name}</h1>
          <p className="text-sm text-slate-500">
            Esta competición aún no ha empezado. Vuelve cuando esté activa para ver inscritos,
            calendario y resultados.
          </p>
          <Link
            href={'/' as Route}
            className="inline-block text-sm px-4 py-2 bg-brand-navy text-white rounded-xl font-semibold hover:opacity-90"
          >
            Ir a Padel League
          </Link>
        </div>
      </PublicShell>
    );
  }

  const isAmericana = league.type === 'AMERICANA';
  const isRotatingIndividual =
    isAmericana && league.americanaVariant === 'ROTATING_INDIVIDUAL';
  const isTournament = league.type === 'TOURNAMENT';

  // Teams apuntadas (no DRAFT) — para vista pública mostramos solo nombre + miembros.
  const teamRegistrations = await prisma.leagueRegistration.findMany({
    where: { leagueId: league.id, withdrawnAt: null, teamId: { not: null } },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          category: true,
          members: { select: { user: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: { registeredAt: 'asc' },
  });
  const teams = teamRegistrations
    .map((r) => r.team)
    .filter((t): t is NonNullable<typeof t> => t !== null);

  // Individual registrations (solo Americana ROTATING_INDIVIDUAL).
  const individualRegistrations = isRotatingIndividual
    ? await prisma.leagueRegistration.findMany({
        where: { leagueId: league.id, withdrawnAt: null, userId: { not: null } },
        select: { userId: true, user: { select: { id: true, name: true } } },
      })
    : [];

  // Matches confirmados para clasificaciones.
  const matchesForStandings = await prisma.match.findMany({
    where: {
      leagueId: league.id,
      status: { in: ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'] },
    },
    include: { confirmedResult: { include: { sets: true } } },
  });

  const teamNamesMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const standings = calculateStandings(
    teamNamesMap,
    matchesForStandings
      .filter((m): m is typeof m & { teamAId: string; teamBId: string } =>
        m.teamAId != null && m.teamBId != null,
      )
      .map((m) => ({
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        status: m.status as 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED',
        winnerTeamId: m.winnerTeamId,
        sets:
          m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
      })),
  );

  // Americana data.
  let americanaMatchesView: AmericanaMatchView[] = [];
  let americanaStandings: AmericanaStandingsRow[] = [];
  let americanaStandingsLabel: 'Jugador' | 'Pareja' = 'Jugador';
  if (isAmericana) {
    if (isRotatingIndividual) {
      const rows = await prisma.match.findMany({
        where: { leagueId: league.id, americanaRound: { not: null } },
        include: {
          participants: { include: { user: { select: { id: true, name: true } } } },
          confirmedResult: { include: { sets: true } },
        },
        orderBy: [{ americanaRound: 'asc' }, { americanaCourt: 'asc' }],
      });
      americanaMatchesView = rows.map((m) => {
        const sideA = m.participants
          .filter((p) => p.side === 'A')
          .sort((a, b) => a.partnerIndex - b.partnerIndex);
        const sideB = m.participants
          .filter((p) => p.side === 'B')
          .sort((a, b) => a.partnerIndex - b.partnerIndex);
        const sets = m.confirmedResult?.sets ?? [];
        const gamesA = sets.reduce((acc, s) => acc + s.gamesA, 0);
        const gamesB = sets.reduce((acc, s) => acc + s.gamesB, 0);
        return {
          id: m.id,
          round: m.americanaRound ?? 0,
          court: m.americanaCourt ?? 1,
          status: m.status,
          sideALabel: sideA.map((p) => p.user.name).join(' + '),
          sideBLabel: sideB.map((p) => p.user.name).join(' + '),
          score: m.confirmedResult ? { gamesA, gamesB } : null,
          winnerSide: !m.confirmedResult
            ? null
            : gamesA > gamesB
              ? 'A'
              : gamesB > gamesA
                ? 'B'
                : 'DRAW',
        };
      });
      const names = Object.fromEntries(
        individualRegistrations
          .filter((r) => r.userId != null && r.user != null)
          .map((r) => [r.userId!, r.user!.name]),
      );
      const standingsRows = calculateAmericanaIndividualStandings(
        names,
        rows.map((m) => ({
          status: m.status,
          participants: m.participants.map((p) => ({
            userId: p.userId,
            side: p.side as 'A' | 'B',
          })),
          sets: m.confirmedResult?.sets ?? [],
        })),
      );
      americanaStandings = standingsRows.map((s) => ({
        id: s.userId,
        name: s.name,
        matchesPlayed: s.matchesPlayed,
        gamesFor: s.gamesFor,
        gamesAgainst: s.gamesAgainst,
        gamesDiff: s.gamesDiff,
      }));
      americanaStandingsLabel = 'Jugador';
    } else {
      const rows = await prisma.match.findMany({
        where: {
          leagueId: league.id,
          americanaRound: { not: null },
          teamAId: { not: null },
          teamBId: { not: null },
        },
        include: {
          teamA: { select: { id: true, name: true } },
          teamB: { select: { id: true, name: true } },
          confirmedResult: { include: { sets: true } },
        },
        orderBy: [{ americanaRound: 'asc' }, { americanaCourt: 'asc' }],
      });
      americanaMatchesView = rows.map((m) => {
        const sets = m.confirmedResult?.sets ?? [];
        const gamesA = sets.reduce((acc, s) => acc + s.gamesA, 0);
        const gamesB = sets.reduce((acc, s) => acc + s.gamesB, 0);
        return {
          id: m.id,
          round: m.americanaRound ?? 0,
          court: m.americanaCourt ?? 1,
          status: m.status,
          sideALabel: m.teamA?.name ?? '—',
          sideBLabel: m.teamB?.name ?? '—',
          score: m.confirmedResult ? { gamesA, gamesB } : null,
          winnerSide: !m.confirmedResult
            ? null
            : gamesA > gamesB
              ? 'A'
              : gamesB > gamesA
                ? 'B'
                : 'DRAW',
        };
      });
      const pairRows = calculateAmericanaPairsStandings(
        teamNamesMap,
        rows
          .filter((m): m is typeof m & { teamAId: string; teamBId: string } =>
            m.teamAId != null && m.teamBId != null,
          )
          .map((m) => ({
            status: m.status,
            teamAId: m.teamAId,
            teamBId: m.teamBId,
            sets: m.confirmedResult?.sets ?? [],
          })),
      );
      americanaStandings = pairRows.map((s) => ({
        id: s.teamId,
        name: s.teamName,
        matchesPlayed: s.matchesPlayed,
        gamesFor: s.gamesFor,
        gamesAgainst: s.gamesAgainst,
        gamesDiff: s.gamesDiff,
      }));
      americanaStandingsLabel = 'Pareja';
    }
  }

  // Tournament data.
  let bracketCells: BracketCell[] = [];
  let tournamentGroups: GroupView[] = [];
  if (isTournament) {
    const tournamentMatches = await prisma.match.findMany({
      where: { leagueId: league.id },
      include: {
        teamA: { select: { id: true, name: true } },
        teamB: { select: { id: true, name: true } },
        confirmedResult: { include: { sets: true } },
      },
      orderBy: [
        { bracketSide: 'asc' },
        { bracketRound: 'asc' },
        { bracketPosition: 'asc' },
        { competitionGroupId: 'asc' },
        { round: 'asc' },
      ],
    });
    bracketCells = tournamentMatches
      .filter(
        (m): m is typeof m & {
          bracketSide: NonNullable<typeof m.bracketSide>;
          bracketRound: number;
          bracketPosition: number;
        } => m.bracketSide != null && m.bracketRound != null && m.bracketPosition != null,
      )
      .map((m) => {
        const sets = m.confirmedResult?.sets ?? [];
        const setsA = sets.filter((s) => s.gamesA > s.gamesB).length;
        const setsB = sets.filter((s) => s.gamesB > s.gamesA).length;
        return {
          id: m.id,
          side: m.bracketSide,
          round: m.bracketRound,
          position: m.bracketPosition,
          status: m.status,
          teamAName: m.teamA?.name ?? null,
          teamBName: m.teamB?.name ?? null,
          winnerSide:
            m.winnerTeamId === m.teamAId
              ? 'A'
              : m.winnerTeamId === m.teamBId
                ? 'B'
                : null,
          score: m.confirmedResult ? { setsA, setsB } : null,
        };
      });
    if (league.hasGroupPhase) {
      const groupRows = await prisma.competitionGroup.findMany({
        where: { leagueId: league.id },
        orderBy: { index: 'asc' },
        include: {
          registrations: { include: { team: { select: { id: true, name: true } } } },
        },
      });
      const groupMatches = tournamentMatches.filter((m) => m.competitionGroupId != null);
      tournamentGroups = groupRows.map((g) => {
        const groupTeams = g.registrations
          .map((r) => r.team)
          .filter((t): t is NonNullable<typeof t> => t !== null);
        const groupTeamNames = Object.fromEntries(groupTeams.map((t) => [t.id, t.name]));
        const myMatches = groupMatches
          .filter((m) => m.competitionGroupId === g.id)
          .filter((m): m is typeof m & { teamAId: string; teamBId: string } =>
            m.teamAId != null && m.teamBId != null,
          );
        const rows = calculateStandings(
          groupTeamNames,
          myMatches.map((m) => ({
            teamAId: m.teamAId,
            teamBId: m.teamBId,
            status: m.status as 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED',
            winnerTeamId: m.winnerTeamId,
            sets:
              m.confirmedResult?.sets.map((s) => ({
                gamesA: s.gamesA,
                gamesB: s.gamesB,
              })) ?? [],
          })),
        );
        return { id: g.id, name: g.name, rows };
      });
    }
  }

  const displayStatus = deriveLeagueStatus(
    league.status,
    league.registrationStart,
    league.registrationEnd,
    Date.now(),
    league.startDate,
    league.endDate,
  );

  const activeTab = tab === 'partidos' ? 'partidos' : 'clasificacion';

  return (
    <PublicShell>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">
            {COMPETITION_TYPE_LABEL[league.type]}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-brand-navy">{league.name}</h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${COMPETITION_TYPE_BADGE_CLASS[league.type]}`}
            >
              {COMPETITION_TYPE_LABEL[league.type]}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium border ${categoryBadgeClass(league.category)}`}
            >
              {CATEGORY_LABEL[league.category]}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${DISPLAY_STATUS_CLASS[displayStatus]}`}
            >
              {DISPLAY_STATUS_LABEL[displayStatus]}
            </span>
          </div>
          {league.description && (
            <p className="text-slate-500 mt-1">{league.description}</p>
          )}
          <p className="text-sm text-slate-400 mt-1">
            {league.startDate.toLocaleDateString('es-ES')} –{' '}
            {league.endDate.toLocaleDateString('es-ES')}
          </p>
        </div>

        <CallToActionBanner />

        {/* Inscritos */}
        {isRotatingIndividual ? (
          <section>
            <h2 className="text-base font-semibold text-brand-navy mb-3">
              Jugadores apuntados ({individualRegistrations.length})
            </h2>
            {individualRegistrations.length === 0 ? (
              <p className="text-sm text-slate-400">Aún no hay jugadores apuntados.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {individualRegistrations.map((r) => (
                  <li
                    key={r.userId}
                    className="flex items-center gap-2 bg-white rounded-xl border border-slate-200/80 shadow-sm px-3 py-2"
                  >
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm flex items-center justify-center font-semibold">
                      {r.user?.name?.[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span className="text-sm font-medium text-slate-800 truncate">
                      {r.user?.name ?? 'Jugador'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section>
            <h2 className="text-base font-semibold text-brand-navy mb-3">
              Equipos apuntados ({teams.length})
            </h2>
            {teams.length === 0 ? (
              <p className="text-sm text-slate-400">Aún no hay equipos apuntados.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {teams.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h3 className="font-medium text-brand-navy truncate">{t.name}</h3>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${categoryBadgeClass(t.category)}`}
                      >
                        {CATEGORY_LABEL[t.category]}
                      </span>
                    </div>
                    <ul className="space-y-1 text-sm text-slate-600">
                      {t.members.map((m) => (
                        <li key={m.user.id} className="truncate">
                          {m.user.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Tabs */}
        <section>
          <div className="flex border-b border-gray-200 mb-4 flex-wrap">
            <Link
              href={`/p/${slug}` as Route}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'clasificacion'
                  ? 'border-brand-yellow text-brand-navy font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Clasificación
            </Link>
            <Link
              href={`/p/${slug}?tab=partidos` as Route}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'partidos'
                  ? 'border-brand-yellow text-brand-navy font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {isAmericana ? 'Rondas' : isTournament ? 'Bracket' : 'Partidos'}
            </Link>
          </div>

          {activeTab === 'clasificacion' && (
            isAmericana ? (
              <AmericanaStandingsTable
                rows={americanaStandings}
                firstColLabel={americanaStandingsLabel}
              />
            ) : isTournament ? (
              tournamentGroups.length > 0 ? (
                <GroupStandings groups={tournamentGroups} />
              ) : (
                <p className="text-sm text-slate-400">
                  Este torneo no tiene fase de grupos. Mira la pestaña <strong>Bracket</strong>.
                </p>
              )
            ) : (
              <StandingsTable
                rows={standings.map((s, i) => ({
                  position: i + 1,
                  teamId: s.teamId,
                  teamName: s.teamName,
                  played: s.played,
                  won: s.won,
                  drawn: s.drawn,
                  lost: s.lost,
                  setsDiff: s.setsDiff,
                  points: s.points,
                }))}
              />
            )
          )}

          {activeTab === 'partidos' && (
            isAmericana ? (
              <AmericanaRoundsGrid
                matches={americanaMatchesView}
                courts={league.americanaCourts ?? 1}
                leagueSlug={slug}
                disableLinks
              />
            ) : isTournament ? (
              <div className="space-y-8">
                {bracketCells.some((c) => c.side === 'GOLD') ? (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      Bracket Oro
                    </p>
                    <BracketTree
                      cells={bracketCells}
                      side="GOLD"
                      leagueSlug={slug}
                      disableLinks
                    />
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    {league.hasGroupPhase
                      ? 'El bracket se generará cuando termine la fase de grupos.'
                      : 'Aún no hay partidos en el bracket.'}
                  </p>
                )}
                {bracketCells.some((c) => c.side === 'SILVER') && (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      Bracket Plata
                    </p>
                    <BracketTree
                      cells={bracketCells}
                      side="SILVER"
                      leagueSlug={slug}
                      disableLinks
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Para ver el calendario detallado y los resultados sets-a-sets, inicia sesión.
              </p>
            )
          )}
        </section>
      </div>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background:
          'linear-gradient(160deg,#e8eef8 0%,#f0f4fb 40%,#f5f7fa 100%)',
      }}
    >
      <header className="bg-gradient-to-r from-brand-navy to-brand-navy-light px-4 sm:px-6 py-3 flex items-center justify-between shadow-md">
        <Link href={'/' as Route} className="flex items-center">
          <Image
            src="/logo.png"
            alt="Padel League"
            width={180}
            height={72}
            className="h-12 sm:h-14 w-auto object-contain drop-shadow-lg"
            priority
            unoptimized
          />
        </Link>
        <Link
          href={'/login' as Route}
          className="text-sm font-semibold text-brand-navy bg-brand-yellow rounded-xl px-3 py-1.5 shadow-sm hover:opacity-90 transition-opacity"
        >
          Iniciar sesión
        </Link>
      </header>
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 flex-1">
        {children}
      </main>
      <footer className="text-center text-xs text-slate-400 py-6">
        Compartido públicamente · Padel League
      </footer>
    </div>
  );
}

function CallToActionBanner() {
  return (
    <div className="bg-brand-navy/5 border border-brand-navy/20 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <p className="text-sm font-semibold text-brand-navy">¿Quieres jugar tú también?</p>
        <p className="text-xs text-slate-500">
          Crea una cuenta gratis y apúntate a la próxima competición de tu club.
        </p>
      </div>
      <Link
        href={'/register' as Route}
        className="text-sm font-semibold text-white bg-gradient-to-br from-brand-navy to-brand-navy-light rounded-xl px-4 py-2 shadow-sm hover:opacity-90 transition-opacity shrink-0"
      >
        Crear cuenta
      </Link>
    </div>
  );
}

function StandingsTable({
  rows,
}: {
  rows: Array<{
    position: number;
    teamId: string;
    teamName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    setsDiff: number;
    points: number;
  }>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">Aún no hay partidos jugados.</p>;
  }
  return (
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
          {rows.map((r) => (
            <tr key={r.teamId}>
              <td className="px-4 py-3 text-gray-400 font-medium">{r.position}</td>
              <td className="px-4 py-3 font-medium text-gray-900 truncate">{r.teamName}</td>
              <td className="px-3 py-3 text-center text-gray-600">{r.played}</td>
              <td className="px-3 py-3 text-center text-green-600">{r.won}</td>
              <td className="px-3 py-3 text-center text-gray-500">{r.drawn}</td>
              <td className="px-3 py-3 text-center text-red-500">{r.lost}</td>
              <td className="px-3 py-3 text-center text-gray-500">
                {r.setsDiff > 0 ? `+${r.setsDiff}` : r.setsDiff}
              </td>
              <td className="px-3 py-3 text-center font-bold text-gray-900">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
