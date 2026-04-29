import type { Route } from 'next';
import Link from 'next/link';
import type { MatchStatus } from '@prisma/client';
import { TeamLogo } from '@/modules/teams/presentation/team-logo';

type SetRow = { setNumber: number; gamesA: number; gamesB: number };

type MatchCardProps = {
  matchId: string;
  slug: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  teamALogoUrl?: string | null;
  teamBLogoUrl?: string | null;
  status: MatchStatus;
  scheduledAt: Date | null;
  winnerTeamId: string | null;
  sets: SetRow[];
};

function singleCardBg(status: MatchStatus): string {
  if (status === 'SCHEDULED') return 'bg-yellow-50 border-yellow-200';
  if (status === 'DATE_PROPOSED' || status === 'DATE_CONFIRMED') return 'bg-blue-50 border-blue-200';
  return 'bg-gray-50 border-gray-200';
}

export function MatchCardJornada({
  matchId, slug, teamAId, teamAName, teamBName, teamALogoUrl, teamBLogoUrl,
  status, scheduledAt, winnerTeamId, sets,
}: MatchCardProps) {
  const isFinished = status === 'CONFIRMED' || status === 'ADMIN_RESOLVED';
  const setsWonA = isFinished ? sets.filter((s) => s.gamesA > s.gamesB).length : 0;
  const setsWonB = isFinished ? sets.filter((s) => s.gamesB > s.gamesA).length : 0;
  const isDraw = isFinished && setsWonA === setsWonB;
  const hasWinner = isFinished && !isDraw && winnerTeamId !== null;

  const setsDisplay = sets.map((s) => `${s.gamesA}-${s.gamesB}`).join(' / ');

  // Finished with a clear winner: render two separate rows
  if (hasWinner) {
    const teamAIsWinner = winnerTeamId === teamAId;
    const winnerName = teamAIsWinner ? teamAName : teamBName;
    const winnerLogo = teamAIsWinner ? teamALogoUrl : teamBLogoUrl;
    const loserName = teamAIsWinner ? teamBName : teamAName;
    const loserLogo = teamAIsWinner ? teamBLogoUrl : teamALogoUrl;

    return (
      <Link
        href={`/ligas/${slug}/partidos/${matchId}` as Route}
        className="block rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden hover:opacity-90 transition-opacity"
      >
        {/* Winner row */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-green-50 border-b border-green-200">
          <span className="flex items-center gap-2 min-w-0">
            <TeamLogo url={winnerLogo} name={winnerName} size="sm" />
            <span className="truncate text-sm text-green-700 font-bold">{winnerName}</span>
          </span>
          <span className="shrink-0 text-xs font-medium text-green-700">{setsDisplay}</span>
        </div>
        {/* Loser row */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-red-50">
          <span className="flex items-center gap-2 min-w-0">
            <TeamLogo url={loserLogo} name={loserName} size="sm" />
            <span className="truncate text-sm text-red-600">{loserName}</span>
          </span>
        </div>
      </Link>
    );
  }

  // Finished draw: both rows orange
  if (isDraw) {
    return (
      <Link
        href={`/ligas/${slug}/partidos/${matchId}` as Route}
        className="block rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-orange-50 border-b border-orange-200">
          <span className="flex items-center gap-2 min-w-0">
            <TeamLogo url={teamALogoUrl} name={teamAName} size="sm" />
            <span className="truncate text-sm text-orange-600 font-bold">{teamAName}</span>
          </span>
          <span className="shrink-0 text-xs font-medium text-orange-600">{setsDisplay}</span>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-orange-50">
          <span className="flex items-center gap-2 min-w-0">
            <TeamLogo url={teamBLogoUrl} name={teamBName} size="sm" />
            <span className="truncate text-sm text-orange-600 font-bold">{teamBName}</span>
          </span>
        </div>
      </Link>
    );
  }

  const teamLine = (
    <div className="flex items-center gap-2 min-w-0">
      <TeamLogo url={teamALogoUrl} name={teamAName} size="sm" />
      <span className="truncate text-sm text-gray-900 font-medium">{teamAName}</span>
      <span className="text-gray-400 text-xs shrink-0">vs</span>
      <TeamLogo url={teamBLogoUrl} name={teamBName} size="sm" />
      <span className="truncate text-sm text-gray-900 font-medium">{teamBName}</span>
    </div>
  );

  // SCHEDULED: single card + "Proponer fecha" button
  if (status === 'SCHEDULED') {
    return (
      <div className={`rounded-2xl border shadow-sm px-4 py-3 ${singleCardBg(status)}`}>
        <div className="flex items-center justify-between gap-3">
          {teamLine}
          <span className="text-xs text-yellow-700 shrink-0">Sin fecha</span>
        </div>
        <div className="mt-2">
          <Link
            href={`/partidos/${matchId}` as Route}
            className="inline-block text-xs px-3 py-1 bg-brand-navy text-white rounded-md hover:bg-brand-navy/90 transition-colors font-medium"
          >
            Proponer fecha
          </Link>
        </div>
      </div>
    );
  }

  // DATE_PROPOSED, DATE_CONFIRMED, EXPIRED_UNPLAYED: single card
  return (
    <Link
      href={`/ligas/${slug}/partidos/${matchId}` as Route}
      className={`block rounded-2xl border shadow-sm px-4 py-3 hover:opacity-90 transition-opacity ${singleCardBg(status)}`}
    >
      <div className="flex items-center justify-between gap-3">
        {teamLine}
        <div className="shrink-0 text-right">
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
