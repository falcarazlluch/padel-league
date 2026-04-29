import Link from 'next/link';
import type { Route } from 'next';
import { prisma } from '@/shared/db/client';
import type { LeagueStatus, Prisma } from '@prisma/client';

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

type StatusFilter = 'all' | 'draft' | 'active' | 'finished';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'draft', label: 'No iniciadas' },
  { value: 'active', label: 'En curso' },
  { value: 'finished', label: 'Finalizadas' },
];

function parseStatus(raw: string | undefined): StatusFilter {
  if (raw === 'draft' || raw === 'active' || raw === 'finished') return raw;
  return 'all';
}

function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export default async function LigasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const status = parseStatus(params.status);
  const from = parseDate(params.from);
  const to = parseDate(params.to);

  // Build the where clause
  const where: Prisma.LeagueWhereInput = {};
  if (q.length > 0) {
    where.name = { contains: q, mode: 'insensitive' };
  }
  if (status === 'draft') where.status = 'DRAFT';
  else if (status === 'active') where.status = 'ACTIVE';
  else if (status === 'finished') where.status = { in: ['FINISHED', 'ARCHIVED'] };
  // Date overlap: league period [startDate, endDate] overlaps with [from, to]
  if (from) where.endDate = { gte: from };
  if (to) where.startDate = { ...(where.startDate as object | undefined), lte: to };

  const leagues = await prisma.league.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const hasActiveFilters = q.length > 0 || status !== 'all' || from !== null || to !== null;

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

      {/* Filters */}
      <form
        method="GET"
        action="/ligas"
        className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 mb-6 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end"
      >
        <div>
          <label htmlFor="q" className="block text-xs font-medium text-slate-500 mb-1">Buscar por nombre</label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q}
            placeholder="Liga verano…"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <div>
          <label htmlFor="status" className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="w-full md:w-40 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="from" className="block text-xs font-medium text-slate-500 mb-1">Desde</label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={params.from ?? ''}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
          </div>
          <div>
            <label htmlFor="to" className="block text-xs font-medium text-slate-500 mb-1">Hasta</label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={params.to ?? ''}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
          >
            Filtrar
          </button>
          {hasActiveFilters && (
            <Link
              href={'/ligas' as Route}
              className="px-4 py-2 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center"
            >
              Limpiar
            </Link>
          )}
        </div>
      </form>

      {leagues.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg mb-2">
            {hasActiveFilters ? 'No hay ligas que coincidan con los filtros' : 'No hay ligas todavía'}
          </p>
          <p className="text-sm">
            {hasActiveFilters ? 'Prueba a limpiar los filtros' : 'Crea la primera liga para empezar'}
          </p>
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
