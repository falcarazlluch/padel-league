'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { registerAction } from './actions';
import { PasswordInput } from '../_components/password-input';

export function RegistroForm({
  defaultCode = '',
  /** Tournament inscription link — replaces the registration code. */
  inviteToken = '',
  /** Partner invite link — also replaces the registration code. */
  partnerToken = '',
  /** True when one of the tokens above is valid, so no code is asked for. */
  codeless = false,
  defaultEmail = '',
  defaultName = '',
  /** Where to land after signing up (defaults to the dashboard). */
  next = '',
}: {
  defaultCode?: string;
  inviteToken?: string;
  partnerToken?: string;
  codeless?: boolean;
  defaultEmail?: string;
  defaultName?: string;
  next?: string;
}) {
  const [state, formAction] = useActionState<{ error?: string }, FormData>(
    async (_prev, formData) => {
      const result = await registerAction(_prev, formData);
      return result ?? {};
    },
    {},
  );

  const loginHref = next
    ? (`/login?next=${encodeURIComponent(next)}` as Route)
    : ('/login' as Route);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {state.error}
        </div>
      )}
      {inviteToken && <input type="hidden" name="inviteToken" value={inviteToken} />}
      {partnerToken && <input type="hidden" name="partnerToken" value={partnerToken} />}
      {next && <input type="hidden" name="next" value={next} />}

      {!codeless && (
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
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base sm:text-sm uppercase tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
          <p className="text-xs text-slate-500 mt-1">Te lo entregó un administrador.</p>
        </div>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={defaultEmail}
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">Nombre y apellido</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          defaultValue={defaultName}
          placeholder="Ej: Juan García"
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
        <PasswordInput id="password" name="password" required autoComplete="new-password" />
        <p className="text-xs text-slate-500 mt-1">Mínimo 10 caracteres con al menos un número y una letra.</p>
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">Confirmar contraseña</label>
        <PasswordInput id="confirmPassword" name="confirmPassword" required autoComplete="new-password" />
      </div>
      <SubmitButton codeless={codeless} />
      <Link
        href={loginHref}
        className="text-sm text-center text-brand-navy/60 hover:text-brand-navy transition-colors"
      >
        ¿Ya tienes cuenta? Inicia sesión
      </Link>
    </form>
  );
}

function SubmitButton({ codeless }: { codeless: boolean }) {
  const { pending } = useFormStatus();
  const label = codeless ? 'Crear cuenta y continuar' : 'Crear cuenta';
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity shadow-lg mt-1 flex items-center justify-center gap-2"
    >
      {pending && (
        <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />
      )}
      {pending ? 'Creando cuenta…' : label}
    </button>
  );
}
