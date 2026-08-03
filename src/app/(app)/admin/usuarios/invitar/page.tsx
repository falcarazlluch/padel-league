import { notFound } from 'next/navigation';
import { getTenantId } from '@/shared/tenant/context';
import { inviteUserAction } from './actions';

export default async function InviteUserPage() {
  // Platform-wide administration: invites here mint a registration code for the
  // public platform, which is meaningless inside a tenant (the way in there is
  // the organiser's inscription link). 404 on a tenant subdomain.
  if (await getTenantId()) notFound();

  // inviteUserAction returns { error?, success? }; cast to satisfy form action prop type.
  const formAction = inviteUserAction as unknown as (formData: FormData) => Promise<void>;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Administración</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Invitar jugador</h1>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
            <input id="email" name="email" type="email" required
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all" />
          </div>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">Nombre (opcional)</label>
            <input id="name" name="name" type="text"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all" />
          </div>
          <button type="submit"
            className="w-full px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity">
            Enviar invitación
          </button>
        </form>
      </div>
    </div>
  );
}
