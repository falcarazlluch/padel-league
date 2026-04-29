'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { registerAction } from './actions';

export function RegistroForm({ defaultCode = '' }: { defaultCode?: string }) {
  const [state, formAction] = useActionState<{ error?: string }, FormData>(
    async (_prev, formData) => {
      const result = await registerAction(_prev, formData);
      return result ?? {};
    },
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {state.error}
        </div>
      )}
      <div>
        <label htmlFor="invitationCode" className="block text-sm font-medium text-slate-700 mb-1">
          Código de invitación
        </label>
        <input
          id="invitationCode"
          name="invitationCode"
          type="text"
          required
          autoComplete="off"
          defaultValue={defaultCode}
          placeholder="XXXX-XXXX"
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm uppercase tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
        <p className="text-xs text-slate-500 mt-1">Te lo entregó un administrador.</p>
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
        <p className="text-xs text-slate-500 mt-1">Mínimo 10 caracteres con al menos un número y una letra.</p>
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">Confirmar contraseña</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>
      <SubmitButton />
      <Link
        href={'/login' as Route}
        className="text-sm text-center text-brand-navy/60 hover:text-brand-navy transition-colors"
      >
        ¿Ya tienes cuenta? Inicia sesión
      </Link>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity shadow-lg mt-1 flex items-center justify-center gap-2"
    >
      {pending && (
        <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />
      )}
      {pending ? 'Creando cuenta…' : 'Crear cuenta'}
    </button>
  );
}
