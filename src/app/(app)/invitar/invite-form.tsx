'use client';

import { useActionState } from 'react';
import { inviteFriendAction } from './actions';

type ActionResult = { error: string } | { success: true; email: string };

export function InviteForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => inviteFriendAction(_prev, formData),
    null,
  );

  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="email" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
          Email del amigo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="amigo@ejemplo.com"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? 'Enviando…' : 'Enviar invitación'}
      </button>

      {state && 'error' in state && (
        <p className="text-sm text-rose-600">{state.error}</p>
      )}
      {state && 'success' in state && (
        <p className="text-sm text-emerald-700">
          Invitación enviada a <strong>{state.email}</strong>. Recibirá un email con un enlace para crear cuenta.
        </p>
      )}
    </form>
  );
}
