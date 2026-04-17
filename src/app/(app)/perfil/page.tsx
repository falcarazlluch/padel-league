import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { updateProfileAction, changePasswordAction, revokeAllSessionsAction } from './actions';

export default async function PerfilPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null; // layout will redirect
  const user = await getValidatedSession(token);

  return (
    <div style={{ maxWidth: '560px' }}>
      <h1>Mi perfil</h1>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Datos personales</h2>
        <form
          action={updateProfileAction as unknown as (formData: FormData) => Promise<void>}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Nombre</label>
            <input name="name" type="text" required defaultValue={user.name}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Email</label>
            <input type="email" defaultValue={user.email} disabled
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '4px', background: '#f9fafb', color: '#6b7280', boxSizing: 'border-box' }} />
          </div>
          <button type="submit"
            style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', alignSelf: 'flex-start' }}>
            Guardar
          </button>
        </form>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Cambiar contraseña</h2>
        <form
          action={changePasswordAction as unknown as (formData: FormData) => Promise<void>}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <input name="currentPassword" type="password" required placeholder="Contraseña actual"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
          <input name="newPassword" type="password" required placeholder="Nueva contraseña (mín. 10 chars)"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
          <button type="submit"
            style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', alignSelf: 'flex-start' }}>
            Cambiar contraseña
          </button>
        </form>
      </section>

      <section>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Sesiones</h2>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          Cierra sesión en todos tus dispositivos.
        </p>
        <form action={revokeAllSessionsAction}>
          <button type="submit"
            style={{ padding: '0.5rem 1rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Cerrar todas las sesiones
          </button>
        </form>
      </section>
    </div>
  );
}
