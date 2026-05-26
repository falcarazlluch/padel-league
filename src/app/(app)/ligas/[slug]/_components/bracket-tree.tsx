import Link from 'next/link';
import type { Route } from 'next';
import type { MatchStatus, BracketSide } from '@prisma/client';

// Vista de bracket de torneo. Render por columnas: cada ronda es una columna,
// los matches dentro de la ronda se distribuyen verticalmente. No dibujamos
// líneas conectoras (se podrían añadir con SVG después); las posiciones por
// `bracketPosition` mantienen el orden lógico de cruces.

export type BracketCell = {
  id: string;
  side: BracketSide;
  round: number;
  position: number;
  status: MatchStatus;
  teamAName: string | null;
  teamBName: string | null;
  winnerSide: 'A' | 'B' | null;
  score: { setsA: number; setsB: number } | null;
};

export function BracketTree({
  cells,
  side,
  leagueSlug,
  disableLinks = false,
}: {
  cells: BracketCell[];
  side: BracketSide;
  leagueSlug: string;
  disableLinks?: boolean;
}) {
  const filtered = cells.filter((c) => c.side === side);
  if (filtered.length === 0) return null;

  const byRound = new Map<number, BracketCell[]>();
  for (const c of filtered) {
    const list = byRound.get(c.round) ?? [];
    list.push(c);
    byRound.set(c.round, list);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  const roundLabel = (r: number, total: number): string => {
    const fromFinal = total - 1 - r;
    if (fromFinal === 0) return 'Final';
    if (fromFinal === 1) return 'Semifinal';
    if (fromFinal === 2) return 'Cuartos';
    if (fromFinal === 3) return 'Octavos';
    return `Ronda ${r + 1}`;
  };

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-4 min-w-max"
        style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(220px, 1fr))` }}
      >
        {rounds.map((r) => {
          const list = byRound.get(r)!.sort((a, b) => a.position - b.position);
          return (
            <div key={r} className="flex flex-col gap-3 justify-around">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {roundLabel(r, rounds.length)}
              </p>
              {list.map((c) => (
                <BracketCellView key={c.id} cell={c} leagueSlug={leagueSlug} disableLinks={disableLinks} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BracketCellView({
  cell,
  leagueSlug,
  disableLinks,
}: {
  cell: BracketCell;
  leagueSlug: string;
  disableLinks: boolean;
}) {
  const aWins = cell.winnerSide === 'A';
  const bWins = cell.winnerSide === 'B';
  const body = (
    <>
      <SideRow name={cell.teamAName ?? 'Por determinar'} sets={cell.score?.setsA} highlight={aWins} />
      <div className="border-t border-slate-100" />
      <SideRow name={cell.teamBName ?? 'Por determinar'} sets={cell.score?.setsB} highlight={bWins} />
    </>
  );
  if (disableLinks) {
    return (
      <div className="block bg-white rounded-xl border border-slate-200/80 shadow-sm">{body}</div>
    );
  }
  return (
    <Link
      href={`/ligas/${leagueSlug}/partidos/${cell.id}` as Route}
      className="block bg-white rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow"
    >
      {body}
    </Link>
  );
}

function SideRow({
  name,
  sets,
  highlight,
}: {
  name: string;
  sets: number | undefined;
  highlight: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 ${
        highlight ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'text-slate-700'
      }`}
    >
      <span className="truncate text-sm">{name}</span>
      <span className="font-mono text-sm shrink-0 text-slate-600">
        {sets !== undefined ? sets : '—'}
      </span>
    </div>
  );
}
