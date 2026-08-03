'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction } from '@/app/(auth)/login/actions';
import { registerAction } from '@/app/(auth)/registro/actions';
import { PasswordInput } from '@/app/(auth)/_components/password-input';

const FIELD =
  'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all';

type State = { error?: string };

/**
 * Step 2 — identify yourself, without leaving the wizard.
 *
 * Both forms post to the very same server actions as /login and /registro, so
 * rate limiting, audit logging, password rehashing and the invite-token
 * entitlement all behave identically; only the redirect target differs (`next`
 * points back at the following wizard step). Re-implementing auth here would
 * have meant re-implementing those protections too.
 */
export function AuthStep({
  token,
  nextHref,
  /** Session present → show who they are and offer to switch account. */
  currentUser,
  organizationName,
}: {
  token: string;
  nextHref: string;
  currentUser: { name: string; email: string } | null;
  organizationName: string;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('register');

  // `loginAction` takes bare FormData; `registerAction` is already
  // useActionState-shaped. Adapt the former rather than the latter so the
  // hardened signatures stay untouched.
  const [loginState, loginFormAction] = useActionState<State, FormData>(
    async (_prev, formData) => (await loginAction(formData)) ?? {},
    {},
  );
  const [registerState, registerFormAction] = useActionState<State, FormData>(
    async (prev, formData) => (await registerAction(prev, formData)) ?? {},
    {},
  );

  if (currentUser) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-brand-navy">Ya estás identificado</h2>
          <p className="text-sm text-slate-600 mt-1">
            Continuarás la inscripción como{' '}
            <strong className="text-slate-800">{currentUser.name}</strong> ({currentUser.email}).
          </p>
        </div>

        <a
          href={nextHref}
          className="block text-center px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
        >
          Continuar
        </a>

        <div className="pt-3 border-t border-slate-100 space-y-2">
          <p className="text-xs text-slate-500">¿No eres tú, o quieres usar otra cuenta?</p>
          {/* Logs out and comes straight back to this step, so the invite
              context is not lost on the way to /login. */}
          <form action="/api/auth/logout" method="post">
            <input type="hidden" name="next" value={`/inscripcion/${token}?paso=2`} />
            <button
              type="submit"
              className="w-full px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cerrar sesión y usar otra cuenta
            </button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-5">
      <div>
        <h2 className="text-base font-bold text-brand-navy">Identifícate</h2>
        <p className="text-sm text-slate-600 mt-1">
          Necesitamos saber quién eres para guardar tu inscripción. Al entrar quedarás dado de alta
          en el entorno de {organizationName}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Entrar o crear cuenta">
        <TabButton active={mode === 'register'} onClick={() => setMode('register')}>
          Soy nuevo
        </TabButton>
        <TabButton active={mode === 'login'} onClick={() => setMode('login')}>
          Ya tengo cuenta
        </TabButton>
      </div>

      {mode === 'register' ? (
        <form action={registerFormAction} className="space-y-3">
          <input type="hidden" name="inviteToken" value={token} />
          <input type="hidden" name="next" value={nextHref} />
          {registerState.error && <ErrorBox>{registerState.error}</ErrorBox>}
          <Field id="reg-email" name="email" type="email" label="Email" autoComplete="email" />
          <Field
            id="reg-name"
            name="name"
            type="text"
            label="Nombre y apellido"
            autoComplete="name"
            placeholder="Ej: Juan García"
          />
          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700 mb-1">
              Contraseña
            </label>
            <PasswordInput id="reg-password" name="password" required autoComplete="new-password" />
            <p className="text-xs text-slate-400 mt-1">
              Mínimo 10 caracteres, con al menos un número y una letra.
            </p>
          </div>
          <div>
            <label htmlFor="reg-confirm" className="block text-sm font-medium text-slate-700 mb-1">
              Repite la contraseña
            </label>
            <PasswordInput
              id="reg-confirm"
              name="confirmPassword"
              required
              autoComplete="new-password"
            />
          </div>
          <SubmitButton idle="Crear cuenta y continuar" busy="Creando cuenta..." />
          <p className="text-xs text-slate-400">
            Con este enlace no necesitas ningún código de invitación.
          </p>
        </form>
      ) : (
        <form action={loginFormAction} className="space-y-3">
          <input type="hidden" name="next" value={nextHref} />
          {loginState.error && <ErrorBox>{loginState.error}</ErrorBox>}
          <Field id="log-email" name="email" type="email" label="Email" autoComplete="email" />
          <div>
            <label htmlFor="log-password" className="block text-sm font-medium text-slate-700 mb-1">
              Contraseña
            </label>
            <PasswordInput
              id="log-password"
              name="password"
              required
              autoComplete="current-password"
            />
          </div>
          <SubmitButton idle="Entrar y continuar" busy="Entrando..." />
          <Link
            href={'/recuperar-password' as Route}
            className="block text-center text-xs text-slate-500 hover:text-slate-700"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </form>
      )}
    </section>
  );
}

function Field({
  id,
  name,
  type,
  label,
  autoComplete,
  placeholder,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={FIELD}
      />
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
      {children}
    </p>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3 py-2 text-sm font-semibold rounded-xl border transition-colors ${
        active
          ? 'bg-brand-navy text-white border-brand-navy'
          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
    >
      {pending ? busy : idle}
    </button>
  );
}
