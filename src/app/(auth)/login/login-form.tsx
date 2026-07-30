'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction } from './actions';
import { PasswordInput } from '../_components/password-input';

/**
 * `/inscripcion/<token>` and `/pareja/<token>` are the two entry points where a
 * signup needs no registration code — the token in the path IS the invitation.
 * Lift it out of `next` and hand it to /registro so switching from login to
 * signup doesn't dead-end on "necesitas un código".
 */
function buildRegistroHref(next: string): Route {
  const params = new URLSearchParams();
  const inscripcion = /^\/inscripcion\/([^/?#]+)/.exec(next);
  const pareja = /^\/pareja\/([^/?#]+)/.exec(next);
  if (inscripcion?.[1]) params.set('inviteToken', decodeURIComponent(inscripcion[1]));
  if (pareja?.[1]) params.set('partnerToken', decodeURIComponent(pareja[1]));
  if (next && next !== '/dashboard') params.set('next', next);
  const qs = params.toString();
  return (qs ? `/registro?${qs}` : '/registro') as Route;
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<{ error?: string }, FormData>(
    async (_prev, formData) => {
      const result = await loginAction(formData);
      return result ?? {};
    },
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {state.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {state.error}
        </div>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
          Email
        </label>
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
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
          Contraseña
        </label>
        <PasswordInput id="password" name="password" required autoComplete="current-password" />
      </div>
      <SubmitButton />
      <Link
        href={'/recuperar-password' as Route}
        className="text-sm text-center text-brand-navy/60 hover:text-brand-navy transition-colors"
      >
        ¿Olvidaste tu contraseña?
      </Link>
      {/* Carry `next` across the switch so someone who lands on login from an
          inscription link and then picks "regístrate" still ends up back in the
          wizard. The registro page derives the invite token from `next`. */}
      <Link
        href={buildRegistroHref(next)}
        className="text-sm text-center text-brand-navy hover:underline"
      >
        ¿No tienes cuenta? Regístrate
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
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  );
}
