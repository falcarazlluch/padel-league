// HTML email templates rendered as plain strings — no React, no
// react-dom/server. Avoids the dual-package hazard caused by Next bundling a
// different React instance than the one resolved at runtime.

const containerStyle = 'font-family: sans-serif; max-width: 600px; margin: 0 auto;';
const primaryButton = (bg: string) =>
  `display: inline-block; padding: 0.75rem 1.5rem; background: ${bg}; color: white; text-decoration: none; border-radius: 4px; margin-top: 1rem;`;
const secondaryButton =
  'display: inline-block; padding: 0.5rem 1rem; border: 1px solid #cbd5e1; color: #475569; text-decoration: none; border-radius: 4px; font-size: 0.875rem;';
const footerNote = 'margin-top: 1.5rem; font-size: 0.875rem; color: #6b7280;';

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function attr(value: string): string {
  return escapeHtml(value);
}

interface InvitationProps {
  name: string;
  inviteUrl: string;
}
export const invitationSubject = 'Invitación a PadelLeague';
export function renderInvitation({ name, inviteUrl }: InvitationProps): string {
  return `
    <div style="${containerStyle}">
      <h1>Bienvenido a PadelLeague, ${escapeHtml(name)}</h1>
      <p>Has sido invitado/a a unirte a la plataforma de gestión de ligas de pádel.</p>
      <p>Haz clic en el enlace para crear tu cuenta. El enlace es válido durante 7 días.</p>
      <a href="${attr(inviteUrl)}" style="${primaryButton('#2563eb')}">Aceptar invitación</a>
      <p style="${footerNote}">Si no esperabas esta invitación, puedes ignorar este email.</p>
    </div>
  `.trim();
}

interface PasswordResetProps {
  name: string;
  resetUrl: string;
}
export const passwordResetSubject = 'Restablecer contraseña — PadelLeague';
export function renderPasswordReset({ name, resetUrl }: PasswordResetProps): string {
  return `
    <div style="${containerStyle}">
      <h1>Restablecer contraseña</h1>
      <p>Hola ${escapeHtml(name)},</p>
      <p>Hemos recibido una solicitud para restablecer tu contraseña. Haz clic en el enlace (válido 1 hora):</p>
      <a href="${attr(resetUrl)}" style="${primaryButton('#2563eb')}">Restablecer contraseña</a>
      <p style="${footerNote}">Si no solicitaste este cambio, ignora este email. Tu contraseña no se modificará.</p>
    </div>
  `.trim();
}

interface ResultSubmittedProps {
  matchTeamA: string;
  matchTeamB: string;
  submitterTeam: string;
  matchUrl: string;
}
export const resultSubmittedSubject = 'Resultado de partido enviado — pendiente de confirmación';
export function renderResultSubmitted({ matchTeamA, matchTeamB, submitterTeam, matchUrl }: ResultSubmittedProps): string {
  return `
    <div style="${containerStyle}">
      <h1>Resultado enviado</h1>
      <p>El equipo <strong>${escapeHtml(submitterTeam)}</strong> ha enviado el resultado del partido <strong>${escapeHtml(matchTeamA)} vs ${escapeHtml(matchTeamB)}</strong>.</p>
      <p>Tienes <strong>7 días</strong> para confirmar o disputar el resultado. Si no actúas, se confirmará automáticamente.</p>
      <a href="${attr(matchUrl)}" style="${primaryButton('#2563eb')}">Ver resultado</a>
      <p style="${footerNote}">Si tienes dudas, usa el botón de arriba para acceder al partido y confirmar o disputar el resultado.</p>
    </div>
  `.trim();
}

interface ResultConfirmedProps {
  matchTeamA: string;
  matchTeamB: string;
  winnerTeamName: string | null;
  matchUrl: string;
}
export const resultConfirmedSubject = 'Resultado de partido confirmado';
export function renderResultConfirmed({ matchTeamA, matchTeamB, winnerTeamName, matchUrl }: ResultConfirmedProps): string {
  const outcome = winnerTeamName
    ? `<p>Ganador: <strong>${escapeHtml(winnerTeamName)}</strong></p>`
    : `<p>El partido terminó en <strong>empate</strong>.</p>`;
  return `
    <div style="${containerStyle}">
      <h1>Resultado confirmado</h1>
      <p>El resultado del partido <strong>${escapeHtml(matchTeamA)} vs ${escapeHtml(matchTeamB)}</strong> ha sido confirmado.</p>
      ${outcome}
      <a href="${attr(matchUrl)}" style="${primaryButton('#16a34a')}">Ver partido</a>
      <p style="${footerNote}">Los puntos han sido actualizados en la tabla de clasificación.</p>
    </div>
  `.trim();
}

interface IndMatchInviteProps {
  organizerName: string;
  matchName: string;
  matchUrl: string;
  scheduledAt?: string;
  location?: string;
  addToCalendarUrl?: string;
}
export const indMatchInviteSubject = 'Te invitan a un partido de pádel';
export function renderIndMatchInvite({
  organizerName,
  matchName,
  matchUrl,
  scheduledAt,
  location,
  addToCalendarUrl,
}: IndMatchInviteProps): string {
  const when = scheduledAt ? `<p>Fecha: ${escapeHtml(scheduledAt)}</p>` : '';
  const where = location ? `<p>Lugar: ${escapeHtml(location)}</p>` : '';
  const calendar = addToCalendarUrl
    ? `<p style="margin-top: 0.75rem;"><a href="${attr(addToCalendarUrl)}" style="${secondaryButton}">📅 Añadir al calendario</a></p>`
    : '';
  return `
    <div style="${containerStyle}">
      <h1>Te invitan a un partido de pádel</h1>
      <p><strong>${escapeHtml(organizerName)}</strong> te invita a unirte al partido <strong>&ldquo;${escapeHtml(matchName)}&rdquo;</strong>.</p>
      ${when}
      ${where}
      <a href="${attr(matchUrl)}" style="${primaryButton('#0D1E45')}">Ver partido y unirme</a>
      ${calendar}
      <p style="${footerNote}">El enlace es válido durante 7 días. Si no esperabas esta invitación, puedes ignorar este email.</p>
    </div>
  `.trim();
}

interface IndMatchChallengeProps {
  organizerTeamName: string;
  matchName: string;
  matchUrl: string;
  scheduledAt?: string;
  location?: string;
}
export const indMatchChallengeSubject = 'Reto de pádel recibido';
export function renderIndMatchChallenge({
  organizerTeamName,
  matchName,
  matchUrl,
  scheduledAt,
  location,
}: IndMatchChallengeProps): string {
  const when = scheduledAt ? `<p>Fecha propuesta: ${escapeHtml(scheduledAt)}</p>` : '';
  const where = location ? `<p>Lugar: ${escapeHtml(location)}</p>` : '';
  return `
    <div style="${containerStyle}">
      <h1>Reto de pádel recibido</h1>
      <p>El equipo <strong>${escapeHtml(organizerTeamName)}</strong> os reta a un partido amistoso: <strong>&ldquo;${escapeHtml(matchName)}&rdquo;</strong>.</p>
      ${when}
      ${where}
      <p>Cualquier miembro de tu equipo puede aceptar o rechazar el reto.</p>
      <a href="${attr(matchUrl)}" style="${primaryButton('#0D1E45')}">Ver reto</a>
    </div>
  `.trim();
}

interface IndMatchChallengeResponseProps {
  challengedTeamName: string;
  matchName: string;
  accepted: boolean;
  matchUrl: string;
}
export const indMatchChallengeResponseSubject = (accepted: boolean): string =>
  accepted ? 'Tu reto fue aceptado' : 'Tu reto fue rechazado';
export function renderIndMatchChallengeResponse({
  challengedTeamName,
  matchName,
  accepted,
  matchUrl,
}: IndMatchChallengeResponseProps): string {
  const cta = accepted
    ? `<a href="${attr(matchUrl)}" style="${primaryButton('#0D1E45')}">Ver partido</a>`
    : '';
  const verb = accepted ? 'aceptado' : 'rechazado';
  return `
    <div style="${containerStyle}">
      <h1>${accepted ? 'Reto aceptado' : 'Reto rechazado'}</h1>
      <p>El equipo <strong>${escapeHtml(challengedTeamName)}</strong> ha ${verb} tu reto <strong>&ldquo;${escapeHtml(matchName)}&rdquo;</strong>.</p>
      ${cta}
    </div>
  `.trim();
}
