import * as React from 'react';

interface Props {
  matchTeamA: string;
  matchTeamB: string;
  submitterTeam: string;
  matchUrl: string;
}

export function ResultSubmittedEmail({ matchTeamA, matchTeamB, submitterTeam, matchUrl }: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Resultado enviado</h1>
      <p>
        El equipo <strong>{submitterTeam}</strong> ha enviado el resultado del partido{' '}
        <strong>
          {matchTeamA} vs {matchTeamB}
        </strong>
        .
      </p>
      <p>
        Tienes <strong>7 días</strong> para confirmar o disputar el resultado. Si no actúas, se confirmará
        automáticamente.
      </p>
      <a
        href={matchUrl}
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
        Ver resultado
      </a>
      <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
        Si tienes dudas, usa el botón de arriba para acceder al partido y confirmar o disputar el resultado.
      </p>
    </div>
  );
}

export const resultSubmittedSubject = 'Resultado de partido enviado — pendiente de confirmación';
