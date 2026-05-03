'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useActionState } from 'react';
import type { MatchStatus } from '@prisma/client';
import { acceptProposalFromList } from '../actions';
import { TeamWithStack } from '../../_components/team-with-stack';
import type { StackPlayer } from '../../_components/player-stack';

interface TeamSide {
  id: string;
  name: string;
  logoUrl: string | null;
  members: StackPlayer[];
}

type Props = {
  matchId: string;
  leagueSlug: string;
  leagueName: string;
  teamA: TeamSide;
  teamB: TeamSide;
  status: MatchStatus;
  scheduledAt: string | null;   // ISO string
  proposalState: 'none' | 'mine' | 'rival';
  proposedDate: string | null;  // ISO string
  winnerTeamId: string | null;
  daysToDeadline: number;
};

function cardStyle(status: MatchStatus, proposalState: 'none' | 'mine' | 'rival'): string {
  if (status === 'CONFIRMED' || status === 'ADMIN_RESOLVED')
    return 'bg-white border-l-4 border-l-emerald-400 border border-slate-200/80 shadow-sm';
  if (status === 'DATE_PROPOSED' || status === 'DATE_CONFIRMED')
    return proposalState === 'rival'
      ? 'bg-white border-l-4 border-l-brand-blue border border-slate-200/80 shadow-sm'
      : 'bg-white border-l-4 border-l-brand-blue/50 border border-slate-200/80 shadow-sm';
  if (status === 'SCHEDULED')
    return 'bg-white border-l-4 border-l-brand-yellow border border-slate-200/80 shadow-sm';
  return 'bg-white border border-slate-200/80 shadow-sm';
}

export function MatchCardMisPartidos({
  matchId, leagueSlug, leagueName, teamA, teamB,
  status, scheduledAt, proposalState, proposedDate,
  winnerTeamId, daysToDeadline,
}: Props) {
  const [acceptResult, acceptAction, acceptPending] = useActionState(acceptProposalFromList, null);

  const isFinished = status === 'CONFIRMED' || status === 'ADMIN_RESOLVED';
  const matchHref = `/ligas/${leagueSlug}/partidos/${matchId}` as Route;

  const relevantDate = proposedDate
    ? new Date(proposedDate)
    : scheduledAt
    ? new Date(scheduledAt)
    : null;

  const dateStr = relevantDate
    ? relevantDate.toLocaleDateString('es-ES', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div className={`rounded-2xl p-4 space-y-3 ${cardStyle(status, proposalState)}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400 truncate">{leagueName}</span>
        {dateStr && status !== 'SCHEDULED' && (
          <span className="text-xs text-slate-400 shrink-0">{dateStr}</span>
        )}
      </div>

      <Link href={matchHref} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 hover:opacity-90 transition-opacity">
        <TeamWithStack team={teamA} highlight={isFinished && winnerTeamId === teamA.id} />
        <span className="text-slate-400 text-sm px-1">vs</span>
        <TeamWithStack team={teamB} highlight={isFinished && winnerTeamId === teamB.id} reverse />
      </Link>

      {status === 'SCHEDULED' && (
        <p className="text-xs text-yellow-700">
          ⚠️ Sin fecha · vence en {daysToDeadline} día{daysToDeadline !== 1 ? 's' : ''}
        </p>
      )}
      {status === 'DATE_PROPOSED' && proposalState === 'rival' && (
        <p className="text-xs text-blue-700">📬 Rival propone: {dateStr}</p>
      )}
      {status === 'DATE_PROPOSED' && proposalState === 'mine' && (
        <p className="text-xs text-orange-700">⏳ Tu propuesta: {dateStr} — esperando al rival</p>
      )}
      {status === 'DATE_CONFIRMED' && (
        <p className="text-xs text-blue-700">✅ Programado: {dateStr}</p>
      )}
      {isFinished && winnerTeamId === null && (
        <p className="text-xs text-slate-500">Empate</p>
      )}
      {status === 'EXPIRED_UNPLAYED' && (
        <p className="text-xs text-gray-500">Partido no jugado</p>
      )}

      {status === 'SCHEDULED' && (
        <Link
          href={matchHref}
          className="inline-block bg-brand-yellow text-brand-navy text-xs font-bold rounded-full px-3 py-1 hover:opacity-90 transition-opacity"
        >
          + Proponer fecha
        </Link>
      )}

      {status === 'DATE_PROPOSED' && proposalState === 'rival' && (
        <div className="flex gap-2 items-center flex-wrap">
          <form action={acceptAction}>
            <input type="hidden" name="matchId" value={matchId} />
            <button
              type="submit"
              disabled={acceptPending}
              className="bg-gradient-to-br from-emerald-500 to-green-600 text-white text-xs font-bold rounded-full px-3 py-1 hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {acceptPending ? '...' : '✓ Aceptar'}
            </button>
          </form>
          <Link
            href={matchHref}
            className="border border-slate-200 text-slate-500 text-xs rounded-full px-3 py-1 hover:bg-gray-50 transition-colors"
          >
            Proponer otra
          </Link>
          {acceptResult && 'error' in acceptResult && (
            <span className="text-xs text-red-600">{acceptResult.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
