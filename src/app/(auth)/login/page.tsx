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
      <h1 className="text-2xl font-bold text-gray-900 mb-1">PadelLeague</h1>
      <p className="text-sm text-gray-500 mb-6">Inicia sesión en tu cuenta</p>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          Entrar
        </button>
        <Link
          href={'/recuperar-password' as Route}
          className="text-sm text-center text-blue-600 hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </>
  );
}
