import type { StandingEntry } from '@/modules/leagues';

// Mini-tabla de clasificación por grupo. Misma estructura que la tabla de
// liga pero compacta para mostrar varias en columna.

export type GroupView = {
  id: string;
  name: string;
  rows: StandingEntry[];
};

export function GroupStandings({ groups }: { groups: GroupView[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((g) => (
        <div key={g.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-sm font-bold text-brand-navy px-4 pt-3 pb-2">{g.name}</p>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-100">
              <tr className="text-slate-500 text-xs uppercase tracking-wider">
                <th className="text-left px-3 py-1.5 font-semibold">#</th>
                <th className="text-left px-3 py-1.5 font-semibold">Pareja</th>
                <th className="text-right px-2 py-1.5 font-semibold">PJ</th>
                <th className="text-right px-2 py-1.5 font-semibold">G</th>
                <th className="text-right px-2 py-1.5 font-semibold">Pts</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-sm text-slate-400 text-center">
                    Sin parejas asignadas
                  </td>
                </tr>
              ) : (
                g.rows.map((r, i) => (
                  <tr key={r.teamId} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-semibold text-slate-500">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium text-brand-navy truncate">{r.teamName}</td>
                    <td className="px-2 py-1.5 text-right text-slate-600">{r.played}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-700">{r.won}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-slate-900">{r.points}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
