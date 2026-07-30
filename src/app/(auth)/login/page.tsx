import { LoginForm } from './login-form';
import { getTenant } from '@/shared/tenant/context';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = '/dashboard' } = await searchParams;
  const tenant = await getTenant();
  // Coming from an inscription or partner link, say so — otherwise the login
  // screen looks like a dead end rather than a step in the flow.
  const returningToFlow = next.startsWith('/inscripcion/') || next.startsWith('/pareja/');

  return (
    <>
      <h1 className="text-xl font-bold text-brand-navy mb-1">Iniciar sesión</h1>
      <p className="text-sm text-slate-400 mb-6">
        {returningToFlow
          ? 'Entra y te devolvemos a tu inscripción justo donde estabas.'
          : tenant
            ? `Accede al entorno de ${tenant.name}`
            : 'Accede a tu cuenta para gestionar tus ligas'}
      </p>
      <LoginForm next={next} />
    </>
  );
}
