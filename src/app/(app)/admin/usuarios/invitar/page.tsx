import { inviteUserAction } from './actions';

export default function InviteUserPage() {
  // inviteUserAction returns { error?, success? }; cast to satisfy form action prop type.
  const formAction = inviteUserAction as unknown as (formData: FormData) => Promise<void>;

  return (
    <div style={{ maxWidth: '480px' }}>
      <h1>Invitar usuario</h1>
      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Email *</label>
          <input id="email" name="email" type="email" required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label htmlFor="name" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Nombre (opcional)</label>
          <input id="name" name="name" type="text"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <button type="submit"
          style={{ padding: '0.625rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
          Enviar invitación
        </button>
      </form>
    </div>
  );
}
