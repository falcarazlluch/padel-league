import Link from 'next/link';
import type { Route } from 'next';
import type { MatchStatus } from '@prisma/client';

// Vista de rondas para una Americana. Cada ronda es una "fila" con tantas
// columnas (pistas) como pistas paralelas tenga la competición. Cada celda
// muestra los 4 jugadores (ROTATING_INDIVIDUAL) o las 2 parejas (FIXED_PAIRS)
// y, si el resultado está confirmado, el score "AvB" en games.
//
// Click en una celda → /ligas/{slug}/partidos/{matchId} con el detalle.

export type AmericanaMatchView = {
  id: string;
  round: number;
  court: number;
  status: MatchStatus;
  sideALabel: string; // "Ana + Bea" o "Pareja Rojo"
  sideBLabel: string;
  // Cuando hay resultado confirmado, suma de games por lado.
  score: { gamesA: number; gamesB: number } | null;
  winnerSide: 'A' | 'B' | 'DRAW' | null;
};

export function AmericanaRoundsGrid({
  matches,
  courts,
  leagueSlug,
  disableLinks = false,
}: {
  matches: AmericanaMatchView[];
  courts: number;
  leagueSlug: string;
  disableLinks?: boolean;
}) {
  if (matches.length === 0) {
    return <p className="text-sm text-slate-400">Aún no hay rondas generadas.</p>;
  }

  // Agrupar por ronda
  const byRound = new Map<number, AmericanaMatchView[]>();
  for (const m of matches) {
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  }
  const sortedRounds = [...byRound.keys()].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {sortedRounds.map((round) => {
        const matchesThisRound = byRound.get(round)!.sort((a, b) => a.court - b.court);
        return (
          <div key={round}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Ronda {round}
            </p>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, Math.min(courts, matchesThisRound.length))}, minmax(0, 1fr))`,
              }}
            >
              {matchesThisRound.map((m) => (
                <RoundCell key={m.id} match={m} leagueSlug={leagueSlug} disableLinks={disableLinks} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoundCell({
  match,
  leagueSlug,
  disableLinks,
}: {
  match: AmericanaMatchView;
  leagueSlug: string;
  disableLinks: boolean;
}) {
  const confirmed = match.status === 'CONFIRMED' || match.status === 'ADMIN_RESOLVED';
  const pending = match.status === 'PENDING_VALIDATION';
  const aWins = match.winnerSide === 'A';
  const bWins = match.winnerSide === 'B';

  const body = (
    <>
      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
        <span>Pista {match.court}</span>
        {confirmed && <span className="text-emerald-600 font-semibold">Confirmado</span>}
        {pending && <span className="text-amber-600 font-semibold">Pendiente validación</span>}
      </div>
      <div className="space-y-1.5">
        <SideRow label={match.sideALabel} games={match.score?.gamesA} highlight={aWins} />
        <SideRow label={match.sideBLabel} games={match.score?.gamesB} highlight={bWins} />
      </div>
    </>
  );
  if (disableLinks) {
    return <div className="block bg-white rounded-xl border border-slate-200/80 shadow-sm p-3">{body}</div>;
  }
  return (
    <Link
      href={`/ligas/${leagueSlug}/partidos/${match.id}` as Route}
      className="block bg-white rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow p-3"
    >
      {body}
    </Link>
  );
}

function SideRow({ label, games, highlight }: { label: string; games: number | undefined; highlight: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm ${
        highlight ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'text-slate-700'
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="font-mono shrink-0 text-slate-600">
        {games !== undefined ? games : '—'}
      </span>
    </div>
  );
}
