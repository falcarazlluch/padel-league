// Tabla de clasificación para Americana — sirve tanto para individual
// (jugadores) como para parejas (teams). El layout es idéntico; cambia el
// header de la primera columna y el contenido de cada fila.

export type AmericanaStandingsRow = {
  id: string; // userId o teamId
  name: string;
  matchesPlayed: number;
  gamesFor: number;
  gamesAgainst: number;
  gamesDiff: number;
};

export function AmericanaStandingsTable({
  rows,
  firstColLabel,
}: {
  rows: AmericanaStandingsRow[];
  firstColLabel: 'Jugador' | 'Pareja';
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">Aún no hay inscripciones.</p>;
  }
  return (
    <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200/80 shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="text-slate-500 text-xs uppercase tracking-wider">
            <th className="text-left px-3 py-2 font-semibold">#</th>
            <th className="text-left px-3 py-2 font-semibold">{firstColLabel}</th>
            <th className="text-right px-3 py-2 font-semibold">PJ</th>
            <th className="text-right px-3 py-2 font-semibold">GF</th>
            <th className="text-right px-3 py-2 font-semibold">GC</th>
            <th className="text-right px-3 py-2 font-semibold">+/-</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-3 py-2 font-semibold text-slate-500">{i + 1}</td>
              <td className="px-3 py-2 font-medium text-brand-navy">{r.name}</td>
              <td className="px-3 py-2 text-right text-slate-600">{r.matchesPlayed}</td>
              <td className="px-3 py-2 text-right text-slate-600">{r.gamesFor}</td>
              <td className="px-3 py-2 text-right text-slate-600">{r.gamesAgainst}</td>
              <td
                className={`px-3 py-2 text-right font-semibold ${
                  r.gamesDiff > 0 ? 'text-emerald-700' : r.gamesDiff < 0 ? 'text-rose-700' : 'text-slate-500'
                }`}
              >
                {r.gamesDiff > 0 ? `+${r.gamesDiff}` : r.gamesDiff}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
