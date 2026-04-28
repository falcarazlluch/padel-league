import { resetPasswordAction } from './actions';

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <>
      <h1 className="text-xl font-bold text-brand-navy mb-6">Nueva contraseña</h1>
      <form
        action={(async (formData: FormData) => {
          'use server';
          return resetPasswordAction(token, formData);
        }) as unknown as (formData: FormData) => Promise<void>}
        className="flex flex-col gap-4"
      >
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
            Nueva contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
            Confirmar contraseña
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity shadow-lg"
        >
          Cambiar contraseña
        </button>
      </form>
    </>
  );
}
