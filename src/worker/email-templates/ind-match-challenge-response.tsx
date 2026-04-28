import * as React from 'react';

interface Props {
  challengedTeamName: string;
  matchName: string;
  accepted: boolean;
  matchUrl: string;
}

export function IndMatchChallengeResponseEmail({ challengedTeamName, matchName, accepted, matchUrl }: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>{accepted ? 'Reto aceptado' : 'Reto rechazado'}</h1>
      <p>
        El equipo <strong>{challengedTeamName}</strong> ha{' '}
        {accepted ? 'aceptado' : 'rechazado'} tu reto <strong>&ldquo;{matchName}&rdquo;</strong>.
      </p>
      {accepted && (
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
          Ver partido
        </a>
      )}
    </div>
  );
}

export const indMatchChallengeResponseSubject = (accepted: boolean) =>
  accepted ? 'Tu reto fue aceptado' : 'Tu reto fue rechazado';
