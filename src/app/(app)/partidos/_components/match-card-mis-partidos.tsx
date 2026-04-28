'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useActionState } from 'react';
import type { MatchStatus } from '@prisma/client';
import { acceptProposalFromList } from '../actions';

type Props = {
  matchId: string;
  leagueSlug: string;
  leagueName: string;
  teamAName: string;
  teamBName: string;
  status: MatchStatus;
  scheduledAt: string | null;   // ISO string
  proposalState: 'none' | 'mine' | 'rival';
  proposedDate: string | null;  // ISO string
  winnerTeamId: string | null;
  teamAId: string;
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
  matchId, leagueSlug, leagueName, teamAName, teamBName,
  status, scheduledAt, proposalState, proposedDate,
  winnerTeamId, teamAId, daysToDeadline,
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
    <div className={`rounded-2xl p-4 space-y-2 ${cardStyle(status, proposalState)}`}>
      <div className="flex items-center justify-between gap-2">
        <Link href={matchHref} className="font-bold text-brand-navy text-sm hover:underline">
          {teamAName} <span className="text-gray-400 font-normal">vs</span> {teamBName}
        </Link>
        <span className="text-xs text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded-full font-medium shrink-0">{leagueName}</span>
      </div>

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
      {isFinished && (
        <p className="text-xs text-green-700 font-medium">
          {winnerTeamId
            ? `Ganador: ${winnerTeamId === teamAId ? teamAName : teamBName}`
            : 'Empate'}
        </p>
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
        <div className="flex gap-2 items-center">
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
