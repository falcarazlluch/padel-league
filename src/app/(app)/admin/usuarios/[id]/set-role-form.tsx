'use client';

import { useActionState } from 'react';
import type { UserRole } from '@prisma/client';
import { setUserRoleAction } from '../actions';

export function SetRoleForm({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: UserRole;
}) {
  const [state, formAction, pending] = useActionState(setUserRoleAction, null);
  const targetRole: UserRole = currentRole === 'LEAGUE_ADMIN' ? 'PLAYER' : 'LEAGUE_ADMIN';
  const buttonLabel = targetRole === 'LEAGUE_ADMIN' ? 'Promover a Admin de liga' : 'Bajar a Jugador';
  return (
    <form action={formAction} className="flex flex-col sm:flex-row sm:items-center gap-3">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={targetRole} />
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 bg-brand-navy text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {pending ? 'Aplicando…' : buttonLabel}
      </button>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state?.success && <p className="text-xs text-emerald-700">Rol actualizado.</p>}
    </form>
  );
}
