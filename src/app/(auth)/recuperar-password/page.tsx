import Link from 'next/link';
import type { Route } from 'next';
import { requestPasswordResetAction } from './actions';

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-brand-navy mb-1">Recuperar contraseña</h1>
      <p className="text-sm text-slate-400 mb-6">
        Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.
      </p>
      <form
        action={requestPasswordResetAction as unknown as (formData: FormData) => Promise<void>}
        className="flex flex-col gap-4"
      >
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="tu@email.com"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity shadow-lg"
        >
          Enviar enlace
        </button>
        <Link
          href={'/login' as Route}
          className="text-sm text-center text-slate-400 hover:text-brand-navy transition-colors"
        >
          Volver al login
        </Link>
      </form>
    </>
  );
}
