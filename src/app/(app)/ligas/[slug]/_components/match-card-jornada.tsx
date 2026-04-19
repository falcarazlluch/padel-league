import type { Route } from 'next';
import Link from 'next/link';
import type { MatchStatus } from '@prisma/client';

type SetRow = { setNumber: number; gamesA: number; gamesB: number };

type MatchCardProps = {
  matchId: string;
  slug: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  status: MatchStatus;
  scheduledAt: Date | null;
  winnerTeamId: string | null;
  sets: SetRow[];
};

function resultColor(teamId: string, winnerTeamId: string | null, isDraw: boolean): string {
  if (isDraw) return 'text-orange-600 font-bold';
  if (winnerTeamId === teamId) return 'text-green-700 font-bold';
  return 'text-red-600';
}

function cardBg(status: MatchStatus, isDraw: boolean): string {
  if (status === 'CONFIRMED' || status === 'ADMIN_RESOLVED') {
    if (isDraw) return 'bg-orange-50 border-orange-200';
    return 'bg-green-50 border-green-200';
  }
  if (status === 'SCHEDULED') return 'bg-yellow-50 border-yellow-200';
  if (status === 'DATE_PROPOSED' || status === 'DATE_CONFIRMED') return 'bg-blue-50 border-blue-200';
  return 'bg-gray-50 border-gray-200';
}

export function MatchCardJornada({
  matchId, slug, teamAId, teamBId, teamAName, teamBName,
  status, scheduledAt, winnerTeamId, sets,
}: MatchCardProps) {
  const isFinished = status === 'CONFIRMED' || status === 'ADMIN_RESOLVED';
  const setsWonA = isFinished ? sets.filter((s) => s.gamesA > s.gamesB).length : 0;
  const setsWonB = isFinished ? sets.filter((s) => s.gamesB > s.gamesA).length : 0;
  const isDraw = isFinished && setsWonA === setsWonB;

  const setsDisplay = sets.map((s) => `${s.gamesA}-${s.gamesB}`).join(' / ');

  return (
    <Link
      href={`/ligas/${slug}/partidos/${matchId}` as Route}
      className={`block rounded-lg border px-4 py-3 hover:opacity-90 transition-opacity ${cardBg(status, isDraw)}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`truncate text-sm ${isFinished ? resultColor(teamAId, winnerTeamId, isDraw) : 'text-gray-900 font-medium'}`}>
            {teamAName}
          </span>
          <span className="text-gray-400 text-xs shrink-0">vs</span>
          <span className={`truncate text-sm ${isFinished ? resultColor(teamBId, winnerTeamId, isDraw) : 'text-gray-900 font-medium'}`}>
            {teamBName}
          </span>
        </div>
        <div className="shrink-0 text-right">
          {isFinished && (
            <span className="text-xs font-medium text-gray-700">{setsDisplay}</span>
          )}
          {status === 'SCHEDULED' && (
            <span className="text-xs text-yellow-700">Sin fecha</span>
          )}
          {(status === 'DATE_PROPOSED' || status === 'DATE_CONFIRMED') && scheduledAt && (
            <span className="text-xs text-blue-700">
              {scheduledAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {status === 'EXPIRED_UNPLAYED' && (
            <span className="text-xs text-gray-400">No jugado</span>
          )}
        </div>
      </div>
    </Link>
  );
}
