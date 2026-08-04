'use client';

import { useActionState } from 'react';
import { setOrgMemberRoleAction } from '../actions';

/**
 * Add somebody by email. The account has to exist already — the platform does
 * not create people here, it only decides which club they belong to.
 */
export function AddMemberForm({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [state, formAction, pending] = useActionState(setOrgMemberRoleAction, null);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
      <h3 className="text-sm font-bold text-brand-navy">Añadir a alguien al club</h3>
      <form action={formAction} className="flex flex-col sm:flex-row sm:items-end gap-2">
        <input type="hidden" name="organizationId" value={organizationId} />
        <div className="flex-1">
          <label htmlFor="add-email" className="block text-xs font-medium text-slate-500 mb-1">
            Email de la cuenta
          </label>
          <input
            id="add-email"
            name="email"
            type="email"
            required
            placeholder="admin@club.es"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <div className="sm:w-44">
          <label htmlFor="add-role" className="block text-xs font-medium text-slate-500 mb-1">
            Rol en el club
          </label>
          <select
            id="add-role"
            name="role"
            defaultValue="ORG_ADMIN"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          >
            <option value="ORG_ADMIN">Administrador</option>
            <option value="ORG_PLAYER">Jugador</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-brand-navy text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {pending ? 'Añadiendo...' : 'Añadir'}
        </button>
      </form>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state?.success && <p className="text-xs text-emerald-700">{state.success}</p>}
      <p className="text-xs text-slate-400">
        Un administrador de {organizationName} puede crear competiciones y repartir enlaces de
        inscripción, pero solo dentro de este club.
      </p>
    </div>
  );
}
