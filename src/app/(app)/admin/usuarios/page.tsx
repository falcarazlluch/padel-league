import Link from 'next/link';
import { getTenantId } from '@/shared/tenant/context';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { UserAdminService } from '@/modules/users';

const ROLE_LABEL = {
  SUPER_ADMIN: 'Super Admin',
  LEAGUE_ADMIN: 'Admin de liga',
  PLAYER: 'Jugador',
} as const;

const ROLE_CLASS = {
  SUPER_ADMIN: 'bg-red-50 text-red-700 border-red-200',
  LEAGUE_ADMIN: 'bg-blue-50 text-blue-700 border-blue-200',
  PLAYER: 'bg-slate-100 text-slate-600 border-slate-200',
} as const;

export default async function AdminUsuariosPage({
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

  const users = await UserAdminService.list(currentUser.id, q);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Administración</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Usuarios</h1>
        <p className="text-sm text-slate-500 mt-1">
          Vista de Super Admin: todos los usuarios registrados, sus equipos y ligas, y acciones de rol.
        </p>
      </div>

      <form
        method="GET"
        action="/admin/usuarios"
        className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex gap-3 items-end"
      >
        <div className="flex-1">
          <label htmlFor="q" className="block text-xs font-medium text-slate-500 mb-1">Buscar por email o nombre</label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q}
            placeholder="email@ejemplo.com o nombre…"
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
            href={'/admin/usuarios' as Route}
            className="px-4 py-2 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center"
          >
            Limpiar
          </Link>
        )}
      </form>

      {users.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12">No hay usuarios que coincidan.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Usuario</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-center px-3 py-3 font-medium text-gray-600">Equipos</th>
                <th className="text-center px-3 py-3 font-medium text-gray-600">Ligas creadas</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{u.name}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${ROLE_CLASS[u.role]}`}>
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-slate-600">{u.teamCount}</td>
                  <td className="px-3 py-3 text-center text-slate-600">{u.leaguesCreatedCount}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/usuarios/${u.id}` as Route}
                      className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
