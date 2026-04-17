import { resetPasswordAction } from './actions';

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Nueva contraseña</h1>
      <form
        action={(async (formData: FormData) => {
          'use server';
          return resetPasswordAction(token, formData);
        }) as unknown as (formData: FormData) => Promise<void>}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <div>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Nueva contraseña</label>
          <input id="password" name="password" type="password" required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Confirmar contraseña</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <button type="submit"
          style={{ padding: '0.625rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
          Cambiar contraseña
        </button>
      </form>
    </div>
  );
}
