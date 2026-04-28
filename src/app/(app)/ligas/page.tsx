import Link from 'next/link';
import type { Route } from 'next';
import { LeagueService } from '@/modules/leagues';
import type { LeagueStatus } from '@prisma/client';

const STATUS_LABEL: Record<LeagueStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activa',
  FINISHED: 'Finalizada',
  ARCHIVED: 'Archivada',
};

const STATUS_CLASS: Record<LeagueStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-500',
  ACTIVE: 'bg-gradient-to-r from-emerald-50 to-green-100 text-emerald-700',
  FINISHED: 'bg-gradient-to-r from-blue-50 to-sky-100 text-blue-700',
  ARCHIVED: 'bg-gray-100 text-gray-400',
};

export default async function LigasPage() {
  const leagues = await LeagueService.list();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Temporada 2026</p>
          <h1 className="text-2xl font-extrabold text-brand-navy">Ligas</h1>
        </div>
        <Link
          href={'/ligas/nueva' as Route}
          className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 transition-opacity"
        >
          Nueva liga
        </Link>
      </div>

      {leagues.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg mb-2">No hay ligas todavía</p>
          <p className="text-sm">Crea la primera liga para empezar</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((league) => (
            <Link
              key={league.id}
              href={`/ligas/${league.slug}` as Route}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 hover:shadow-md transition-shadow shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h2 className="font-semibold text-brand-navy leading-tight">{league.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_CLASS[league.status]}`}>
                  {STATUS_LABEL[league.status]}
                </span>
              </div>
              {league.description && (
                <p className="text-sm text-slate-500 mb-3 line-clamp-2">{league.description}</p>
              )}
              <p className="text-xs text-slate-400">
                {league.startDate.toLocaleDateString('es-ES')} –{' '}
                {league.endDate.toLocaleDateString('es-ES')}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
