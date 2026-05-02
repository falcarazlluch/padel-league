import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { updateProfileAction, changePasswordAction, revokeAllSessionsAction } from './actions';

export default async function PerfilPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null; // layout will redirect
  const user = await getValidatedSession(token);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Mi cuenta</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Perfil</h1>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Datos personales</h2>
        <form
          action={updateProfileAction as unknown as (formData: FormData) => Promise<void>}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre y apellido</label>
            <input name="name" type="text" required defaultValue={user.name} placeholder="Ej: Juan García"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" defaultValue={user.email} disabled
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-400 cursor-not-allowed" />
          </div>
          <button type="submit"
            className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity">
            Guardar
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cambiar contraseña</h2>
        <form
          action={changePasswordAction as unknown as (formData: FormData) => Promise<void>}
          className="space-y-4"
        >
          <input name="currentPassword" type="password" required placeholder="Contraseña actual"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all" />
          <input name="newPassword" type="password" required placeholder="Nueva contraseña (mín. 10 chars)"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all" />
          <button type="submit"
            className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity">
            Cambiar contraseña
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sesiones</h2>
        <p className="text-sm text-slate-400">
          Cierra sesión en todos tus dispositivos.
        </p>
        <form action={revokeAllSessionsAction}>
          <button type="submit"
            className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 transition-colors">
            Cerrar todas las sesiones
          </button>
        </form>
      </section>
    </div>
  );
}
