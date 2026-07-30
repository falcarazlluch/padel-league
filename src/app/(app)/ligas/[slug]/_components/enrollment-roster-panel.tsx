import { ENROLLMENT_STATUS_CLASS, ENROLLMENT_STATUS_LABEL } from '@/modules/organizations';
import type { TournamentEnrollmentStatus } from '@/modules/organizations';

export type EnrollmentRosterRow = {
  id: string;
  status: TournamentEnrollmentStatus;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  teamName: string | null;
  teamMemberCount: number;
  pendingPartnerName: string | null;
};

/**
 * Organiser-side counterpart of the player's checklist: who is fully in and who
 * is stuck waiting on a partner. Surfacing the half-finished ones is the point —
 * the organiser can chase them before the window closes.
 */
export function EnrollmentRosterPanel({ rows }: { rows: EnrollmentRosterRow[] }) {
  if (rows.length === 0) return null;

  const completed = rows.filter((r) => r.status === 'COMPLETED');
  const pending = rows.filter((r) => r.status !== 'COMPLETED');

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-brand-navy">Inscripciones guiadas</h2>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
          {completed.length} confirmada(s)
        </span>
        {pending.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-amber-50 text-amber-700 border-amber-200">
            {pending.length} sin cerrar
          </span>
        )}
      </div>

      {pending.length > 0 && (
        <p className="text-xs text-slate-500">
          Las inscripciones sin cerrar no cuentan para el cuadro. Puedes avisar a estos jugadores
          por teléfono para que completen su pareja.
        </p>
      )}

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="py-2 pr-3">Jugador</th>
              <th className="py-2 pr-3">Pareja</th>
              <th className="py-2 pr-3">Contacto</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {[...pending, ...completed].map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2 pr-3 font-medium text-slate-700">{r.userName}</td>
                <td className="py-2 pr-3 text-slate-600">
                  {r.teamMemberCount >= 2 ? (
                    (r.teamName ?? '—')
                  ) : r.pendingPartnerName ? (
                    <span className="text-amber-700">{r.pendingPartnerName} (sin aceptar)</span>
                  ) : (
                    <span className="text-slate-400">Sin pareja</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-xs text-slate-500">
                  <span className="block truncate max-w-[12rem]">{r.userEmail}</span>
                  {r.userPhone && <span className="block">{r.userPhone}</span>}
                </td>
                <td className="py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium border ${ENROLLMENT_STATUS_CLASS[r.status]}`}
                  >
                    {ENROLLMENT_STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
