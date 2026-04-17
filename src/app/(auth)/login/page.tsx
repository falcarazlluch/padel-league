import Link from 'next/link';
import type { Route } from 'next';
import { loginAction } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = '/dashboard' } = await searchParams;

  // loginAction returns { error?: string } for programmatic use; cast to satisfy
  // the form action prop type which expects void | Promise<void>.
  const formAction = loginAction as unknown as (formData: FormData) => Promise<void>;

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>PadelLeague</h1>
      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="email"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
            Contraseña
          </label>
          <input id="password" name="password" type="password" required autoComplete="current-password"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit"
          style={{ padding: '0.625rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
          Entrar
        </button>
        <Link href={'/recuperar-password' as Route} style={{ fontSize: '0.875rem', textAlign: 'center', color: '#2563eb' }}>
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </div>
  );
}
