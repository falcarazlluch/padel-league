import Link from 'next/link';
import type { Route } from 'next';
import { requestPasswordResetAction } from './actions';

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 style={{ marginBottom: '0.5rem' }}>Recuperar contraseña</h1>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
        Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.
      </p>
      <form
        action={requestPasswordResetAction as unknown as (formData: FormData) => Promise<void>}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <input name="email" type="email" required placeholder="tu@email.com"
          style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        <button type="submit"
          style={{ padding: '0.625rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
          Enviar enlace
        </button>
        <Link href={'/login' as Route} style={{ fontSize: '0.875rem', textAlign: 'center', color: '#6b7280' }}>Volver al login</Link>
      </form>
    </div>
  );
}
