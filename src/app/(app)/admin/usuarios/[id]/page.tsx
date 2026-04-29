import Link from 'next/link';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { UserAdminService } from '@/modules/users';
import { isUserFacingError } from '@/shared/errors';
import { CATEGORY_LABEL } from '@/modules/leagues/presentation/category';
import type { TeamCategory } from '@prisma/client';
import { SetRoleForm } from './set-role-form';

const ROLE_LABEL = {
  SUPER_ADMIN: 'Super Admin',
  LEAGUE_ADMIN: 'Admin de liga',
  PLAYER: 'Jugador',
} as const;

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const currentUser = await getValidatedSession(token);
  if (currentUser.role !== 'SUPER_ADMIN') redirect('/dashboard' as Route);

  let user;
  try {
    user = await UserAdminService.getDetail(currentUser.id, id);
  } catch (err) {
    if (isUserFacingError(err)) notFound();
    throw err;
  }

  const isSelf = user.id === currentUser.id;

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Usuario</p>
          <h1 className="text-2xl font-extrabold text-brand-navy">{user.name}</h1>
          <p className="text-sm text-slate-500">{user.email}</p>
          <p className="text-xs text-slate-400 mt-1">
            Alta: {user.createdAt.toLocaleDateString('es-ES')} · Rol actual: <strong>{ROLE_LABEL[user.role]}</strong>
          </p>
        </div>
        <Link
          href={'/admin/usuarios' as Route}
          className="text-sm px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
        >
          ← Lista
        </Link>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
        <h2 className="text-base font-semibold text-brand-navy">Rol</h2>
        {user.role === 'SUPER_ADMIN' ? (
          <p className="text-sm text-slate-500">No se puede modificar el rol de un Super Admin desde la UI.</p>
        ) : isSelf ? (
          <p className="text-sm text-slate-500">No puedes cambiar tu propio rol.</p>
        ) : (
          <SetRoleForm userId={user.id} currentRole={user.role} />
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-brand-navy mb-3">Equipos ({user.teams.length})</h2>
        {user.teams.length === 0 ? (
          <p className="text-sm text-slate-400">Sin equipos.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {user.teams.map((t) => (
              <li key={t.id} className="bg-white rounded-xl border border-slate-200/80 p-3 flex items-center justify-between gap-2">
                <span className="text-sm text-slate-700 truncate">{t.name}</span>
                <span className="text-[11px] text-slate-400 shrink-0">{CATEGORY_LABEL[t.category as TeamCategory]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-brand-navy mb-3">Ligas creadas ({user.leaguesCreated.length})</h2>
        {user.leaguesCreated.length === 0 ? (
          <p className="text-sm text-slate-400">No ha creado ligas.</p>
        ) : (
          <ul className="grid gap-2">
            {user.leaguesCreated.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/ligas/${l.slug}` as Route}
                  className="bg-white rounded-xl border border-slate-200/80 p-3 flex items-center justify-between gap-2 hover:shadow-sm transition-shadow"
                >
                  <span className="text-sm text-slate-700 truncate">{l.name}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">{l.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
