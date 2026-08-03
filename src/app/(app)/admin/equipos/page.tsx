import Link from 'next/link';
import { getTenantId } from '@/shared/tenant/context';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { TeamService } from '@/modules/teams';
import { TeamLogo } from '@/modules/teams/presentation/team-logo';
import { CATEGORY_LABEL, categoryBadgeClass } from '@/modules/leagues';
import { DeleteTeamButton } from './delete-team-button';

export const dynamic = 'force-dynamic';

export default async function AdminEquiposPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // Platform-wide administration: these pages show data across every tenant, so
  // they only exist on the apex host. Inside a tenant subdomain they 404 — an
  // ORG_ADMIN has no business enumerating other organizations' users or teams.
  if (await getTenantId()) notFound();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const currentUser = await getValidatedSession(token);
  if (currentUser.role !== 'SUPER_ADMIN') redirect('/dashboard' as Route);

  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const teams = await TeamService.adminList(currentUser.id, q);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">
          Administración
        </p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Equipos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Listado completo de equipos. Solo se pueden eliminar equipos sin partidos asociados
          (FK protegida). Para liberar un equipo con histórico, borra primero su competición.
        </p>
      </div>

      <form
        method="GET"
        action="/admin/equipos"
        className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex gap-3 items-end"
      >
        <div className="flex-1">
          <label htmlFor="q" className="block text-xs font-medium text-slate-500 mb-1">
            Buscar por nombre
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q}
            placeholder="Los Magníficos…"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
        >
          Filtrar
        </button>
        {q.length > 0 && (
          <Link
            href={'/admin/equipos' as Route}
            className="px-4 py-2 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center"
          >
            Limpiar
          </Link>
        )}
      </form>

      {teams.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12">No hay equipos.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Equipo</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">Miembros</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600">Inscripciones</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600">Partidos</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">Creado</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {teams.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/equipos/${t.id}` as Route}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <TeamLogo url={t.logoUrl} name={t.name} size="sm" />
                        <span className="font-medium text-slate-900 truncate">{t.name}</span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${categoryBadgeClass(t.category)}`}
                        >
                          {CATEGORY_LABEL[t.category]}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      <span className="font-semibold mr-2">{t.memberCount}</span>
                      <span className="text-xs text-slate-400 truncate">
                        {t.memberNames.slice(0, 2).join(', ')}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-600">
                      {t.activeRegistrationsCount}
                    </td>
                    <td className="px-3 py-3 text-center text-slate-600">{t.matchCount}</td>
                    <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {t.createdAt.toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeleteTeamButton
                        teamId={t.id}
                        teamName={t.name}
                        hasMatches={t.matchCount > 0}
                        hasActiveRegistrations={t.activeRegistrationsCount > 0}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
