import * as React from 'react';

interface Props {
  organizerName: string;
  matchName: string;
  matchUrl: string;
  scheduledAt?: string;
  location?: string;
  addToCalendarUrl?: string;
}

export function IndMatchInviteEmail({
  organizerName,
  matchName,
  matchUrl,
  scheduledAt,
  location,
  addToCalendarUrl,
}: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Te invitan a un partido de pádel</h1>
      <p><strong>{organizerName}</strong> te invita a unirte al partido <strong>&ldquo;{matchName}&rdquo;</strong>.</p>
      {scheduledAt && <p>Fecha: {scheduledAt}</p>}
      {location && <p>Lugar: {location}</p>}
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
        Ver partido y unirme
      </a>
      {addToCalendarUrl && (
        <p style={{ marginTop: '0.75rem' }}>
          <a
            href={addToCalendarUrl}
            style={{
              display: 'inline-block',
              padding: '0.5rem 1rem',
              border: '1px solid #cbd5e1',
              color: '#475569',
              textDecoration: 'none',
              borderRadius: '4px',
              fontSize: '0.875rem',
            }}
          >
            📅 Añadir al calendario
          </a>
        </p>
      )}
      <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
        El enlace es válido durante 7 días. Si no esperabas esta invitación, puedes ignorar este email.
      </p>
    </div>
  );
}

export const indMatchInviteSubject = 'Te invitan a un partido de pádel';
