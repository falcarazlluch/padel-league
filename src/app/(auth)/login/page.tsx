import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = '/dashboard' } = await searchParams;

  return (
    <>
      <h1 className="text-xl font-bold text-brand-navy mb-1">Iniciar sesión</h1>
      <p className="text-sm text-slate-400 mb-6">Accede a tu cuenta para gestionar tus ligas</p>
      <LoginForm next={next} />
    </>
  );
}
