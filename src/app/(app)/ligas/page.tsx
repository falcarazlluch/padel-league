import Link from 'next/link';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { prisma } from '@/shared/db/client';
import type { Prisma, TeamCategory, CompetitionType } from '@prisma/client';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { CATEGORY_LABEL, categoryBadgeClass } from '@/modules/leagues';
import {
  deriveLeagueStatus,
  DISPLAY_STATUS_CLASS,
  DISPLAY_STATUS_LABEL,
} from '@/modules/leagues/presentation/league-status';
import {
  COMPETITION_TYPE_LABEL,
  COMPETITION_TYPE_BADGE_CLASS,
} from '@/modules/leagues/presentation/competition-type';
import { LeagueCardActions } from './_components/league-card-actions';

function readNow(): number {
  return Date.now();
}

type StatusFilter = 'all' | 'draft' | 'active' | 'finished';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'draft', label: 'No iniciadas' },
  { value: 'active', label: 'En curso' },
  { value: 'finished', label: 'Finalizadas' },
];

type CategoryFilter = 'all' | TeamCategory;

const CATEGORY_OPTIONS: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'BEGINNER', label: CATEGORY_LABEL.BEGINNER },
  { value: 'INTERMEDIATE', label: CATEGORY_LABEL.INTERMEDIATE },
  { value: 'ADVANCED', label: CATEGORY_LABEL.ADVANCED },
];

type TypeFilter = 'all' | CompetitionType;

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'LEAGUE', label: COMPETITION_TYPE_LABEL.LEAGUE },
  { value: 'AMERICANA', label: COMPETITION_TYPE_LABEL.AMERICANA },
  { value: 'TOURNAMENT', label: COMPETITION_TYPE_LABEL.TOURNAMENT },
];

function parseType(raw: string | undefined): TypeFilter {
  if (raw === 'LEAGUE' || raw === 'AMERICANA' || raw === 'TOURNAMENT') return raw;
  return 'all';
}

function parseStatus(raw: string | undefined): StatusFilter {
  if (raw === 'draft' || raw === 'active' || raw === 'finished') return raw;
  return 'all';
}

function parseCategory(raw: string | undefined): CategoryFilter {
  if (raw === 'BEGINNER' || raw === 'INTERMEDIATE' || raw === 'ADVANCED') return raw;
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
  searchParams: Promise<{ q?: string; status?: string; category?: string; type?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const status = parseStatus(params.status);
  const category = parseCategory(params.category);
  const typeFilter = parseType(params.type);
  const from = parseDate(params.from);
  const to = parseDate(params.to);

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const currentUser = token ? await getValidatedSession(token).catch(() => null) : null;
  const canCreateLeague = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'LEAGUE_ADMIN';
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  // Build the where clause
  const where: Prisma.LeagueWhereInput = {};
  if (q.length > 0) {
    where.name = { contains: q, mode: 'insensitive' };
  }
  if (status === 'draft') where.status = 'DRAFT';
  else if (status === 'active') where.status = 'ACTIVE';
  else if (status === 'finished') where.status = { in: ['FINISHED', 'ARCHIVED'] };
  if (category !== 'all') where.category = category;
  if (typeFilter !== 'all') where.type = typeFilter;
  // Date overlap: league period [startDate, endDate] overlaps with [from, to]
  if (from) where.endDate = { gte: from };
  if (to) where.startDate = { ...(where.startDate as object | undefined), lte: to };

  const leagues = await prisma.league.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const now = readNow();
  const leaguesWithDisplay = leagues.map((l) => ({
    ...l,
    displayStatus: deriveLeagueStatus(l.status, l.registrationStart, l.registrationEnd, now, l.startDate, l.endDate),
  }));

  const hasActiveFilters =
    q.length > 0 || status !== 'all' || category !== 'all' || typeFilter !== 'all' || from !== null || to !== null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Temporada 2026</p>
          <h1 className="text-2xl font-extrabold text-brand-navy">Competiciones</h1>
        </div>
        {canCreateLeague && (
          <Link
            href={'/ligas/nueva' as Route}
            className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 transition-opacity"
          >
            Nueva competición
          </Link>
        )}
      </div>

      {/* Filters */}
      <form
        method="GET"
        action="/ligas"
        className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 mb-6 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-3 items-end"
      >
        <div>
          <label htmlFor="q" className="block text-xs font-medium text-slate-500 mb-1">Buscar por nombre</label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q}
            placeholder="Competición verano…"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <div>
          <label htmlFor="type" className="block text-xs font-medium text-slate-500 mb-1">Tipo</label>
          <select
            id="type"
            name="type"
            defaultValue={typeFilter}
            className="w-full md:w-36 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
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
        <div>
          <label htmlFor="category" className="block text-xs font-medium text-slate-500 mb-1">Nivel</label>
          <select
            id="category"
            name="category"
            defaultValue={category}
            className="w-full md:w-36 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {/* En móvil apilamos los dos date inputs (los date pickers nativos son
            anchos y se solapaban con grid-cols-2). En ≥sm vuelven a estar
            lado a lado. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
            {hasActiveFilters
              ? 'No hay competiciones que coincidan con los filtros'
              : 'No hay competiciones todavía'}
          </p>
          <p className="text-sm">
            {hasActiveFilters ? 'Prueba a limpiar los filtros' : 'Crea la primera competición para empezar'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leaguesWithDisplay.map((league) => (
            <div key={league.id} className="relative">
              {isSuperAdmin && (
                <LeagueCardActions leagueId={league.id} leagueName={league.name} />
              )}
              <Link
                href={`/ligas/${league.slug}` as Route}
                className="block bg-white rounded-2xl border border-slate-200/80 p-5 hover:shadow-md transition-shadow shadow-sm"
              >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h2 className={`font-semibold text-brand-navy leading-tight ${isSuperAdmin ? 'pr-8' : ''}`}>{league.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${DISPLAY_STATUS_CLASS[league.displayStatus]}`}>
                  {DISPLAY_STATUS_LABEL[league.displayStatus]}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${COMPETITION_TYPE_BADGE_CLASS[league.type]}`}>
                  {COMPETITION_TYPE_LABEL[league.type]}
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${categoryBadgeClass(league.category)}`}>
                  {CATEGORY_LABEL[league.category]}
                </span>
              </div>
              {league.description && (
                <p className="text-sm text-slate-500 mb-3 line-clamp-2">{league.description}</p>
              )}
              <p className="text-xs text-slate-400">
                Competición: {league.startDate.toLocaleDateString('es-ES')} –{' '}
                {league.endDate.toLocaleDateString('es-ES')}
              </p>
              <p className="text-xs text-slate-400">
                Inscripción: {league.registrationStart.toLocaleDateString('es-ES')} –{' '}
                {league.registrationEnd.toLocaleDateString('es-ES')}
              </p>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
