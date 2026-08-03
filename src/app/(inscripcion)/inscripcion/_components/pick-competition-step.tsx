import Link from 'next/link';
import type { Route } from 'next';
import type { OpenCompetitionSummary } from '@/modules/organizations/presentation/labels';
import { CATEGORY_LABEL } from '@/modules/leagues/presentation/category';
import {
  COMPETITION_TYPE_BADGE_CLASS,
  COMPETITION_TYPE_LABEL,
} from '@/modules/leagues/presentation/competition-type';

function fmt(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

/**
 * Only reached from an ORGANIZATION link: choose which competition to enrol in.
 * Competitions the player is already enrolled in stay listed but are not
 * offered again — showing them keeps "where am I?" answerable, hiding them
 * would make the list look wrong.
 */
export function PickCompetitionStep({
  token,
  competitions,
  organizationName,
}: {
  token: string;
  competitions: OpenCompetitionSummary[];
  organizationName: string;
}) {
  const available = competitions.filter((c) => !c.alreadyEnrolled);
  const enrolled = competitions.filter((c) => c.alreadyEnrolled);

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-5">
      <div>
        <h2 className="text-base font-bold text-brand-navy">Elige la competición</h2>
        <p className="text-sm text-slate-600 mt-1">
          Estas son las competiciones de {organizationName} con la inscripción abierta.
        </p>
      </div>

      {available.length === 0 && enrolled.length === 0 && (
        <p className="text-sm text-slate-500">
          Ahora mismo no hay ninguna competición con la inscripción abierta. Guarda este enlace: te
          servirá cuando el club abra la siguiente.
        </p>
      )}

      {available.length > 0 && (
        <ul className="space-y-2">
          {available.map((c) => (
            <li key={c.id}>
              <Link
                href={`/inscripcion/${token}?paso=4&liga=${encodeURIComponent(c.slug)}` as Route}
                className="block rounded-xl border border-slate-200 p-3 hover:border-brand-blue hover:bg-brand-blue/5 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-brand-navy">{c.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium border ${COMPETITION_TYPE_BADGE_CLASS[c.type]}`}
                  >
                    {COMPETITION_TYPE_LABEL[c.type]}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-slate-50 text-slate-600 border-slate-200">
                    {CATEGORY_LABEL[c.category]}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Se juega del {fmt(c.startDate)} al {fmt(c.endDate)} · inscripción hasta el{' '}
                  {fmt(c.registrationEnd)} · {c.registeredCount} pareja(s) apuntada(s)
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {enrolled.length > 0 && (
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Ya empezadas por ti
          </p>
          <ul className="space-y-1.5">
            {enrolled.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-slate-600">{c.name}</span>
                <Link
                  href={`/inscripcion/estado/${c.slug}` as Route}
                  className="text-xs font-semibold text-brand-blue hover:underline"
                >
                  Ver mi estado
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
