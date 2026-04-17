import * as React from 'react';

interface Props {
  name: string;
  resetUrl: string;
}

export function PasswordResetEmail({ name, resetUrl }: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Restablecer contraseña</h1>
      <p>Hola {name},</p>
      <p>
        Hemos recibido una solicitud para restablecer tu contraseña. Haz clic en el enlace (válido
        1 hora):
      </p>
      <a
        href={resetUrl}
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
        Restablecer contraseña
      </a>
      <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
        Si no solicitaste este cambio, ignora este email. Tu contraseña no se modificará.
      </p>
    </div>
  );
}

export const passwordResetSubject = 'Restablecer contraseña — PadelLeague';
