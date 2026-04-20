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
  deadlineAt: string;           // ISO string
  proposalState: 'none' | 'mine' | 'rival';
  proposedDate: string | null;  // ISO string
  winnerTeamId: string | null;
  teamAId: string;
  teamBId: string;
  currentUserTeamId: string;
};

function cardStyle(status: MatchStatus, proposalState: 'none' | 'mine' | 'rival'): string {
  if (status === 'CONFIRMED' || status === 'ADMIN_RESOLVED') return 'bg-green-50 border-green-200';
  if (status === 'DATE_PROPOSED' || status === 'DATE_CONFIRMED')
    return proposalState === 'rival' ? 'bg-blue-50 border-blue-300' : 'bg-blue-50 border-blue-200';
  if (status === 'SCHEDULED') return 'bg-yellow-50 border-yellow-200';
  return 'bg-gray-50 border-gray-200';
}

export function MatchCardMisPartidos({
  matchId, leagueSlug, leagueName, teamAName, teamBName,
  status, scheduledAt, deadlineAt, proposalState, proposedDate,
  winnerTeamId, teamAId, teamBId,
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

  const daysToDeadline = Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 86_400_000);

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${cardStyle(status, proposalState)}`}>
      <div className="flex items-center justify-between gap-2">
        <Link href={matchHref} className="font-medium text-gray-900 text-sm hover:underline">
          {teamAName} <span className="text-gray-400 font-normal">vs</span> {teamBName}
        </Link>
        <span className="text-xs text-gray-400 shrink-0">{leagueName}</span>
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

      {status === 'SCHEDULED' && (
        <Link
          href={matchHref}
          className="inline-block bg-brand-yellow text-brand-navy text-xs font-bold rounded px-3 py-1 hover:opacity-90"
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
              className="bg-green-600 text-white text-xs font-bold rounded px-3 py-1 hover:bg-green-700 disabled:opacity-50"
            >
              {acceptPending ? '...' : '✓ Aceptar'}
            </button>
          </form>
          <Link
            href={matchHref}
            className="border border-gray-300 text-gray-600 text-xs rounded px-3 py-1 hover:bg-white"
          >
            Otra fecha
          </Link>
          {acceptResult && 'error' in acceptResult && (
            <span className="text-xs text-red-600">{acceptResult.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
