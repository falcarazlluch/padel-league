import Link from 'next/link';
import type { Route } from 'next';
import { TeamWithStack } from './team-with-stack';
import type { StackPlayer } from './player-stack';

interface SetRow {
  setNumber: number;
  gamesA: number;
  gamesB: number;
}

interface TeamSide {
  id: string;
  name: string;
  logoUrl: string | null;
  members: StackPlayer[];
}

interface Props {
  matchId: string;
  leagueSlug: string;
  leagueName?: string;
  scheduledAt: Date | null;
  teamA: TeamSide;
  teamB: TeamSide;
  winnerTeamId: string | null;
  sets: SetRow[];
  /** When true the match was admin-resolved without play; mark differently. */
  adminResolved?: boolean;
  expiredUnplayed?: boolean;
}

function formatDate(date: Date | null): string {
  if (!date) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

export function MatchResultRow({
  matchId,
  leagueSlug,
  leagueName,
  scheduledAt,
  teamA,
  teamB,
  winnerTeamId,
  sets,
  adminResolved,
  expiredUnplayed,
}: Props) {
  const teamAWon = winnerTeamId === teamA.id;
  const teamBWon = winnerTeamId !== null && winnerTeamId !== teamA.id;
  const draw = winnerTeamId === null && !expiredUnplayed && sets.length > 0;

  return (
    <Link
      href={`/ligas/${leagueSlug}/partidos/${matchId}` as Route}
      className="block bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow p-4"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <p className="text-xs text-slate-400">
          {formatDate(scheduledAt)}
          {leagueName ? ` · ${leagueName}` : ''}
        </p>
        {expiredUnplayed && (
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            No jugado
          </span>
        )}
        {adminResolved && (
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            Resuelto por admin
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamWithStack team={teamA} highlight={teamAWon} />
        <div className="flex items-center gap-1 px-2 text-sm font-mono">
          {expiredUnplayed ? (
            <span className="text-slate-400">—</span>
          ) : sets.length === 0 ? (
            <span className="text-slate-400">sin sets</span>
          ) : (
            sets
              .sort((a, b) => a.setNumber - b.setNumber)
              .map((s) => (
                <span
                  key={s.setNumber}
                  className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs"
                >
                  {s.gamesA}-{s.gamesB}
                </span>
              ))
          )}
        </div>
        <TeamWithStack team={teamB} highlight={teamBWon} reverse />
      </div>

      {draw && <p className="text-xs text-slate-400 mt-2 text-center">Empate</p>}
    </Link>
  );
}
