import type { Route } from 'next';
import Link from 'next/link';
import type { MatchStatus } from '@prisma/client';
import { MatchCardJornada } from './match-card-jornada';

type MatchForJornada = {
  id: string;
  teamAId: string;
  teamBId: string;
  teamA: { id: string; name: string };
  teamB: { id: string; name: string };
  status: MatchStatus;
  scheduledAt: Date | null;
  deadlineAt: Date;
  round: number | null;
  winnerTeamId: string | null;
  confirmedSets: { setNumber: number; gamesA: number; gamesB: number }[];
};

type TeamLogoMap = Record<string, string | null>;

const ACTIVE_STATUSES: MatchStatus[] = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'];

function defaultJornada(matches: MatchForJornada[], rounds: number[]): number {
  const activeRound = rounds.find((r) =>
    matches.some((m) => m.round === r && ACTIVE_STATUSES.includes(m.status)),
  );
  return activeRound ?? rounds[rounds.length - 1] ?? 1;
}

export function PartidosTab({
  slug,
  matches,
  activeJornada,
  teamLogos,
}: {
  slug: string;
  matches: MatchForJornada[];
  activeJornada: number | null;
  teamLogos?: TeamLogoMap;
}) {
  const rounds = [...new Set(
    matches.map((m) => m.round).filter((r): r is number => r !== null)
  )].sort((a, b) => a - b);

  if (rounds.length === 0) {
    return <p className="text-sm text-gray-500">No hay partidos generados para esta liga.</p>;
  }

  const currentRound = activeJornada ?? defaultJornada(matches, rounds);
  const roundMatches = matches.filter((m) => m.round === currentRound);

  return (
    <div className="space-y-4">
      {/* Jornada pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {rounds.map((r) => (
          <Link
            key={r}
            href={`/ligas/${slug}?tab=partidos&jornada=${r}` as Route}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              r === currentRound
                ? 'bg-brand-navy text-white'
                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            J{r}
          </Link>
        ))}
      </div>

      {/* Match cards */}
      <div className="space-y-2">
        {roundMatches.length === 0 ? (
          <p className="text-sm text-gray-500">No hay partidos en esta jornada.</p>
        ) : (
          roundMatches.map((m) => (
            <MatchCardJornada
              key={m.id}
              matchId={m.id}
              slug={slug}
              teamAId={m.teamAId}
              teamBId={m.teamBId}
              teamAName={m.teamA.name}
              teamBName={m.teamB.name}
              teamALogoUrl={teamLogos?.[m.teamAId] ?? null}
              teamBLogoUrl={teamLogos?.[m.teamBId] ?? null}
              status={m.status}
              scheduledAt={m.scheduledAt}
              winnerTeamId={m.winnerTeamId}
              sets={m.confirmedSets}
            />
          ))
        )}
      </div>
    </div>
  );
}
