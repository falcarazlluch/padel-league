import type { InviteLinkPreview } from '@/modules/organizations';
import { CATEGORY_LABEL } from '@/modules/leagues';
import {
  COMPETITION_TYPE_LABEL,
  COMPETITION_TYPE_BADGE_CLASS,
} from '@/modules/leagues/presentation/competition-type';

function fmt(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** What the player is being invited to, stated before anything is asked of them. */
export function CompetitionSummary({ preview }: { preview: InviteLinkPreview }) {
  const c = preview.competition;
  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-brand-navy to-brand-navy-light px-5 py-4">
        <p className="text-[0.7rem] font-bold uppercase tracking-widest text-white/60">
          {preview.organization.name} te invita
        </p>
        <h1 className="text-xl sm:text-2xl font-black text-white mt-0.5">{c.name}</h1>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${COMPETITION_TYPE_BADGE_CLASS[c.type]}`}>
            {COMPETITION_TYPE_LABEL[c.type]}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-slate-50 text-slate-600 border-slate-200">
            Nivel {CATEGORY_LABEL[c.category]}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-slate-50 text-slate-600 border-slate-200">
            {c.registeredCount} pareja(s) apuntada(s)
          </span>
        </div>

        {c.description && <p className="text-sm text-slate-600 leading-relaxed">{c.description}</p>}

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl px-3 py-2">
            <dt className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">
              Se juega
            </dt>
            <dd className="text-sm font-semibold text-brand-navy">
              {fmt(c.startDate)} – {fmt(c.endDate)}
            </dd>
          </div>
          <div className="bg-slate-50 rounded-xl px-3 py-2">
            <dt className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">
              Inscripción hasta
            </dt>
            <dd className="text-sm font-semibold text-brand-navy">{fmt(c.registrationEnd)}</dd>
          </div>
        </dl>

        <p className="text-xs text-slate-500">
          Se juega <strong>por parejas</strong>. En el asistente eliges o invitas a tu compañero/a;
          te diremos en todo momento si falta algo para que tu plaza quede confirmada.
        </p>
      </div>
    </section>
  );
}
