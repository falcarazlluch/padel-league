import { acceptInvitationAction } from './actions';

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Acepta tu invitación</h1>
      <form
        action={
          (async (formData: FormData) => {
            'use server';
            return acceptInvitationAction(token, formData);
          }) as unknown as (formData: FormData) => Promise<void>
        }
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Crea tu cuenta para unirte a PadelLeague.
        </p>
        <div>
          <label htmlFor="name" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Nombre y apellido</label>
          <input id="name" name="name" type="text" required placeholder="Ej: Juan García"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Contraseña</label>
          <input id="password" name="password" type="password" required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>Mínimo 10 caracteres, al menos un número y una letra.</p>
        </div>
        <div>
          <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Confirmar contraseña</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <button type="submit"
          style={{ padding: '0.625rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
          Crear cuenta e iniciar sesión
        </button>
      </form>
    </div>
  );
}
