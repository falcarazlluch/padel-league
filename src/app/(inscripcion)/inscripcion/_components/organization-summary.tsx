// Presentation path, not domain/: the boundaries rule keeps the app layer out
// of module internals, and the facade would drag prisma into the bundle.
import type {
  InviteLinkOrganization,
  OpenCompetitionSummary,
} from '@/modules/organizations/presentation/labels';

function fmt(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Landing header for an ORGANIZATION link. Unlike the competition landing this
 * one leads with the club, because the link is reusable all season and the
 * visitor may be meeting the club, not a specific tournament.
 */
export function OrganizationSummary({
  organization,
  openCompetitions,
}: {
  organization: InviteLinkOrganization;
  openCompetitions: OpenCompetitionSummary[];
}) {
  const soonest = openCompetitions[0] ?? null;

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-brand-navy to-brand-navy-light px-5 py-4">
        <p className="text-[0.7rem] font-bold uppercase tracking-widest text-white/60">
          Te invitan a
        </p>
        <h1 className="text-xl sm:text-2xl font-black text-white mt-0.5">{organization.name}</h1>
        {organization.tagline && (
          <p className="text-sm text-white/80 mt-1">{organization.tagline}</p>
        )}
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-600 leading-relaxed">
          Este enlace te da acceso al entorno de {organization.name}: sus competiciones, sus
          clasificaciones y sus resultados. Después eliges en cuál te apuntas.
        </p>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl px-3 py-2">
            <dt className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">
              Inscripción abierta en
            </dt>
            <dd className="text-sm font-semibold text-brand-navy">
              {openCompetitions.length === 0
                ? 'Ninguna ahora mismo'
                : `${openCompetitions.length} competición(es)`}
            </dd>
          </div>
          {soonest && (
            <div className="bg-slate-50 rounded-xl px-3 py-2">
              <dt className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">
                Cierra antes
              </dt>
              <dd className="text-sm font-semibold text-brand-navy">
                {soonest.name} · {fmt(soonest.registrationEnd)}
              </dd>
            </div>
          )}
        </dl>

        <p className="text-xs text-slate-500">
          Guarda este enlace: sirve durante toda la temporada, no solo para un torneo.
        </p>
      </div>
    </section>
  );
}
