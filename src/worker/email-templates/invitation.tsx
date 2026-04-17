import * as React from 'react';

interface Props {
  name: string;
  inviteUrl: string;
}

export function InvitationEmail({ name, inviteUrl }: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Bienvenido a PadelLeague, {name}</h1>
      <p>Has sido invitado/a a unirte a la plataforma de gestión de ligas de pádel.</p>
      <p>Haz clic en el enlace para crear tu cuenta. El enlace es válido durante 7 días.</p>
      <a
        href={inviteUrl}
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          background: '#2563eb',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px',
          marginTop: '1rem',
        }}
      >
        Aceptar invitación
      </a>
      <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
        Si no esperabas esta invitación, puedes ignorar este email.
      </p>
    </div>
  );
}

export const invitationSubject = 'Invitación a PadelLeague';
