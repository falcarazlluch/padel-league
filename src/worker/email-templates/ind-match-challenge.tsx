import * as React from 'react';

interface Props {
  organizerTeamName: string;
  matchName: string;
  matchUrl: string;
  scheduledAt?: string;
  location?: string;
}

export function IndMatchChallengeEmail({ organizerTeamName, matchName, matchUrl, scheduledAt, location }: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Reto de pádel recibido</h1>
      <p>El equipo <strong>{organizerTeamName}</strong> os reta a un partido amistoso: <strong>&ldquo;{matchName}&rdquo;</strong>.</p>
      {scheduledAt && <p>Fecha propuesta: {scheduledAt}</p>}
      {location && <p>Lugar: {location}</p>}
      <p>Cualquier miembro de tu equipo puede aceptar o rechazar el reto.</p>
      <a
        href={matchUrl}
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          background: '#0D1E45',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px',
          marginTop: '1rem',
        }}
      >
        Ver reto
      </a>
    </div>
  );
}

export const indMatchChallengeSubject = 'Reto de pádel recibido';
