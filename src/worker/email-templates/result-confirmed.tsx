import * as React from 'react';

interface Props {
  matchTeamA: string;
  matchTeamB: string;
  winnerTeamName: string | null;
  matchUrl: string;
}

export function ResultConfirmedEmail({ matchTeamA, matchTeamB, winnerTeamName, matchUrl }: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Resultado confirmado</h1>
      <p>
        El resultado del partido{' '}
        <strong>
          {matchTeamA} vs {matchTeamB}
        </strong>{' '}
        ha sido confirmado.
      </p>
      {winnerTeamName ? (
        <p>
          Ganador: <strong>{winnerTeamName}</strong>
        </p>
      ) : (
        <p>
          El partido terminó en <strong>empate</strong>.
        </p>
      )}
      <a
        href={matchUrl}
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          background: '#16a34a',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px',
          marginTop: '1rem',
        }}
      >
        Ver partido
      </a>
      <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
        Los puntos han sido actualizados en la tabla de clasificación.
      </p>
    </div>
  );
}

export const resultConfirmedSubject = 'Resultado de partido confirmado';
