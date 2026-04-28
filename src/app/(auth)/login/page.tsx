import Link from 'next/link';
import type { Route } from 'next';
import { loginAction } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = '/dashboard' } = await searchParams;
  const formAction = loginAction as unknown as (formData: FormData) => Promise<void>;

  return (
    <>
      <h1 className="text-xl font-bold text-brand-navy mb-1">Iniciar sesión</h1>
      <p className="text-sm text-slate-400 mb-6">Accede a tu cuenta para gestionar tus ligas</p>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
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
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity shadow-lg mt-1"
        >
          Entrar
        </button>
        <Link
          href={'/recuperar-password' as Route}
          className="text-sm text-center text-brand-navy/60 hover:text-brand-navy transition-colors"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </>
  );
}
