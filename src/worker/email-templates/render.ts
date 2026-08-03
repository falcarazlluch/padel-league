// HTML email templates rendered as plain strings — no React, no
// react-dom/server. Avoids the dual-package hazard caused by Next bundling a
// different React instance than the one resolved at runtime.
//
// All templates share `wrapEmail()` for the navy header w/ logo, white card
// body and brand footer. Email-safe HTML: tables for structure, inline CSS,
// 600px max width, no flex/grid.

const COLORS = {
  navy: '#0D1E45',
  navyLight: '#1A3268',
  yellow: '#F9C920',
  yellowDark: '#E0B218',
  blue: '#5BB8D4',
  green: '#16A34A',
  red: '#DC2626',
  text: '#334155',
  textBold: '#0D1E45',
  muted: '#64748B',
  mutedLight: '#94A3B8',
  bg: '#F0F4FB',
  border: '#E2E8F0',
  cardBg: '#FFFFFF',
  footerBg: '#F8FAFC',
};

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

interface WrapArgs {
  content: string;
  preheader?: string;
  appUrl: string;
  /**
   * Whitelabel co-branding. When a tenant (e.g. RACC) sends the mail, the header
   * shows Padel League on the left and the club on the right, and every link
   * points at the tenant's own subdomain. The club never replaces the platform
   * mark — a player invited to a RACC tournament should recognise the club, and
   * still see who runs the platform.
   */
  brand?: {
    name: string;
    logoUrl?: string;
    /** Tenant origin used for the header link and the footer. */
    url?: string;
  };
}

function wrapEmail({ content, preheader, appUrl, brand }: WrapArgs): string {
  const brandName = brand?.name ?? 'Padel League';
  const brandUrl = brand?.url?.trim() || appUrl;
  const platformLogo = `${appUrl.replace(/\/+$/, '')}/logo.png`;
  // The club logo never replaces the platform one: both ride in the header,
  // Padel League on the left. Same rule as the app shell.
  const tenantLogo = brand?.logoUrl?.trim() || '';
  const footerTagline = brand
    ? `Competiciones de pádel · en Padel League`
    : 'Tu plataforma de ligas y partidos de pádel';
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(brandName)}</title>
  <!--[if mso]><style>*{font-family:Arial,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;font-size:1px;color:${COLORS.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ''}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${COLORS.bg};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background-color:${COLORS.cardBg};border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(13,30,69,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,${COLORS.navy} 0%,${COLORS.navyLight} 100%);padding:28px 24px;text-align:center;">
              <a href="${attr(brandUrl)}" style="text-decoration:none;display:inline-block;">
                <img src="${attr(platformLogo)}" alt="Padel League" width="140" style="display:inline-block;max-width:140px;height:auto;border:0;vertical-align:middle;" />
              </a>${
                tenantLogo
                  ? `<span style="display:inline-block;width:1px;height:28px;background-color:rgba(255,255,255,0.28);margin:0 14px;vertical-align:middle;"></span>
              <a href="${attr(brandUrl)}" style="text-decoration:none;display:inline-block;">
                <img src="${attr(tenantLogo)}" alt="${attr(brandName)}" height="30" style="display:inline-block;max-height:30px;width:auto;border:0;vertical-align:middle;" />
              </a>`
                  : brand
                    ? `<span style="display:inline-block;width:1px;height:28px;background-color:rgba(255,255,255,0.28);margin:0 14px;vertical-align:middle;"></span>
              <span style="display:inline-block;color:#FFFFFF;font-size:16px;font-weight:700;vertical-align:middle;">${escapeHtml(brandName)}</span>`
                    : ''
              }
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:${COLORS.footerBg};border-top:1px solid ${COLORS.border};text-align:center;">
              <p style="margin:0;font-size:12px;color:${COLORS.mutedLight};line-height:1.5;">
                <a href="${attr(brandUrl)}" style="color:${COLORS.muted};text-decoration:none;font-weight:600;">${escapeHtml(brandName)}</a>
                · ${escapeHtml(footerTagline)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Building blocks ─────────────────────────────────────────────────────────

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:${COLORS.textBold};line-height:1.3;">${escapeHtml(text)}</h1>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;color:${COLORS.text};line-height:1.6;">${html}</p>`;
}

function cta(href: string, label: string, variant: 'navy' | 'yellow' | 'green' = 'navy'): string {
  const bg = variant === 'yellow' ? COLORS.yellow : variant === 'green' ? COLORS.green : COLORS.navy;
  const fg = variant === 'yellow' ? COLORS.navy : '#FFFFFF';
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
    <tr><td align="center" style="background-color:${bg};border-radius:12px;">
      <a href="${attr(href)}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:${fg};text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

function secondaryLink(href: string, label: string): string {
  return `<p style="margin:12px 0 0;"><a href="${attr(href)}" style="display:inline-block;padding:8px 16px;font-size:13px;font-weight:600;color:${COLORS.muted};border:1px solid ${COLORS.border};border-radius:8px;text-decoration:none;">${escapeHtml(label)}</a></p>`;
}

function infoBox(rows: Array<[string, string]>): string {
  if (rows.length === 0) return '';
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;font-size:14px;color:${COLORS.muted};width:90px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;color:${COLORS.textBold};font-weight:600;">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;background-color:${COLORS.bg};border-radius:12px;width:100%;">
    <tr><td style="padding:16px 20px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">${cells}</table></td></tr>
  </table>`;
}

function codeBlock(code: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;">
    <tr><td style="padding:14px 24px;background-color:${COLORS.bg};border:2px dashed ${COLORS.navy};border-radius:12px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:18px;font-weight:700;color:${COLORS.textBold};letter-spacing:2px;">${escapeHtml(code)}</td></tr>
  </table>`;
}

function smallNote(html: string): string {
  return `<p style="margin:24px 0 0;font-size:13px;color:${COLORS.mutedLight};line-height:1.5;">${html}</p>`;
}

// ── Templates ────────────────────────────────────────────────────────────────

interface CommonProps {
  appUrl: string;
}

interface InvitationProps extends CommonProps {
  name: string;
  inviteUrl: string;
}
export const invitationSubject = 'Bienvenido a Padel League';
export function renderInvitation({ name, inviteUrl, appUrl }: InvitationProps): string {
  return wrapEmail({
    appUrl,
    preheader: `Has sido invitado a Padel League. El enlace es válido durante 7 días.`,
    content: `
      ${heading(`¡Bienvenido, ${name}!`)}
      ${paragraph('Has sido invitado/a a unirte a la plataforma de gestión de ligas de pádel.')}
      ${paragraph('Crea tu cuenta haciendo clic en el botón. El enlace es válido durante 7 días.')}
      ${cta(inviteUrl, 'Aceptar invitación', 'yellow')}
      ${smallNote('Si no esperabas esta invitación, puedes ignorar este email.')}
    `,
  });
}

interface PasswordResetProps extends CommonProps {
  name: string;
  resetUrl: string;
}
export const passwordResetSubject = 'Restablecer contraseña — Padel League';
export function renderPasswordReset({ name, resetUrl, appUrl }: PasswordResetProps): string {
  return wrapEmail({
    appUrl,
    preheader: 'Solicitud de restablecimiento de contraseña.',
    content: `
      ${heading('Restablecer contraseña')}
      ${paragraph(`Hola <strong>${escapeHtml(name)}</strong>,`)}
      ${paragraph('Hemos recibido una solicitud para restablecer tu contraseña. Pulsa el botón para crear una nueva (enlace válido 1 hora):')}
      ${cta(resetUrl, 'Restablecer contraseña', 'navy')}
      ${smallNote('Si no solicitaste este cambio, ignora este email. Tu contraseña no se modificará.')}
    `,
  });
}

interface ResultSubmittedProps extends CommonProps {
  matchTeamA: string;
  matchTeamB: string;
  submitterTeam: string;
  matchUrl: string;
}
export const resultSubmittedSubject = 'Resultado pendiente de confirmación';
export function renderResultSubmitted({
  matchTeamA, matchTeamB, submitterTeam, matchUrl, appUrl,
}: ResultSubmittedProps): string {
  return wrapEmail({
    appUrl,
    preheader: `${submitterTeam} ha enviado el resultado del partido contra tu equipo. Tienes 7 días para confirmar.`,
    content: `
      ${heading('Resultado enviado')}
      ${paragraph(`El equipo <strong>${escapeHtml(submitterTeam)}</strong> ha enviado el resultado del partido <strong>${escapeHtml(matchTeamA)} vs ${escapeHtml(matchTeamB)}</strong>.`)}
      ${paragraph('Tienes <strong>7 días</strong> para confirmar o disputar el resultado. Si no actúas, se confirmará automáticamente.')}
      ${cta(matchUrl, 'Revisar resultado', 'navy')}
      ${smallNote('Si tienes dudas, accede al partido desde el botón para confirmar o disputar el resultado.')}
    `,
  });
}

interface ResultConfirmedProps extends CommonProps {
  matchTeamA: string;
  matchTeamB: string;
  winnerTeamName: string | null;
  matchUrl: string;
}
export const resultConfirmedSubject = 'Resultado confirmado';
export function renderResultConfirmed({
  matchTeamA, matchTeamB, winnerTeamName, matchUrl, appUrl,
}: ResultConfirmedProps): string {
  const outcome = winnerTeamName
    ? paragraph(`Ganador: <strong>${escapeHtml(winnerTeamName)}</strong>.`)
    : paragraph('El partido terminó en <strong>empate</strong>.');
  return wrapEmail({
    appUrl,
    preheader: `Resultado confirmado del partido ${matchTeamA} vs ${matchTeamB}.`,
    content: `
      ${heading('Resultado confirmado')}
      ${paragraph(`El resultado del partido <strong>${escapeHtml(matchTeamA)} vs ${escapeHtml(matchTeamB)}</strong> ha sido confirmado.`)}
      ${outcome}
      ${cta(matchUrl, 'Ver partido', 'green')}
      ${smallNote('Los puntos ya están reflejados en la clasificación.')}
    `,
  });
}

interface IndMatchInviteProps extends CommonProps {
  organizerName: string;
  matchName: string;
  matchUrl: string;
  scheduledAt?: string;
  location?: string;
  addToCalendarUrl?: string;
}
export const indMatchInviteSubject = 'Te invitan a un partido de pádel';
export function renderIndMatchInvite({
  organizerName, matchName, matchUrl, scheduledAt, location, addToCalendarUrl, appUrl,
}: IndMatchInviteProps): string {
  const info: Array<[string, string]> = [];
  if (scheduledAt) info.push(['Cuándo', scheduledAt]);
  if (location) info.push(['Dónde', location]);
  return wrapEmail({
    appUrl,
    preheader: `${organizerName} te invita al partido "${matchName}".`,
    content: `
      ${heading(`Te invitan a "${matchName}"`)}
      ${paragraph(`<strong>${escapeHtml(organizerName)}</strong> te invita a unirte al partido.`)}
      ${infoBox(info)}
      ${cta(matchUrl, 'Ver partido y confirmar', 'yellow')}
      ${addToCalendarUrl ? secondaryLink(addToCalendarUrl, '📅 Añadir al calendario') : ''}
      ${smallNote('El enlace es válido durante 7 días. Si no esperabas esta invitación, puedes ignorar este email.')}
    `,
  });
}

interface IndMatchChallengeProps extends CommonProps {
  organizerTeamName: string;
  matchName: string;
  matchUrl: string;
  scheduledAt?: string;
  location?: string;
}
export const indMatchChallengeSubject = 'Reto de pádel recibido';
export function renderIndMatchChallenge({
  organizerTeamName, matchName, matchUrl, scheduledAt, location, appUrl,
}: IndMatchChallengeProps): string {
  const info: Array<[string, string]> = [];
  if (scheduledAt) info.push(['Cuándo', scheduledAt]);
  if (location) info.push(['Dónde', location]);
  return wrapEmail({
    appUrl,
    preheader: `${organizerTeamName} os reta a un partido amistoso.`,
    content: `
      ${heading('Reto recibido')}
      ${paragraph(`El equipo <strong>${escapeHtml(organizerTeamName)}</strong> os reta a un partido amistoso: <strong>${escapeHtml(matchName)}</strong>.`)}
      ${infoBox(info)}
      ${paragraph('Cualquier miembro de tu equipo puede aceptar o rechazar el reto.')}
      ${cta(matchUrl, 'Ver reto', 'navy')}
    `,
  });
}

interface FriendInviteProps extends CommonProps {
  inviterName: string;
  registerUrl: string;
  code: string;
}
export const friendInviteSubject = (inviterName: string): string =>
  `${inviterName} te invita a Padel League`;
export function renderFriendInvite({
  inviterName, registerUrl, code, appUrl,
}: FriendInviteProps): string {
  return wrapEmail({
    appUrl,
    preheader: `${inviterName} te invita a unirte a Padel League. El enlace es válido 14 días.`,
    content: `
      ${heading('Te invitan a Padel League')}
      ${paragraph(`<strong>${escapeHtml(inviterName)}</strong> te invita a Padel League, la app para gestionar ligas y partidos de pádel.`)}
      ${cta(registerUrl, 'Crear cuenta', 'yellow')}
      ${paragraph('Si el botón no funciona, ve a la app y usa este código de invitación:')}
      ${codeBlock(code)}
      ${smallNote('La invitación es válida durante 14 días.')}
    `,
  });
}

interface TournamentPartnerInviteProps extends CommonProps {
  inviterName: string;
  partnerName: string;
  competitionName: string;
  acceptUrl: string;
  brandName: string;
  brandLogoUrl?: string;
  brandUrl?: string;
}
export const tournamentPartnerInviteSubject = (inviterName: string, competitionName: string): string =>
  `${inviterName} te quiere como pareja en ${competitionName}`;
export function renderTournamentPartnerInvite({
  inviterName, partnerName, competitionName, acceptUrl,
  brandName, brandLogoUrl, brandUrl, appUrl,
}: TournamentPartnerInviteProps): string {
  return wrapEmail({
    appUrl,
    brand: { name: brandName, logoUrl: brandLogoUrl, url: brandUrl },
    preheader: `${inviterName} quiere jugar ${competitionName} contigo. Confirma para quedar inscritos.`,
    content: `
      ${heading(`${partnerName}, te quieren como pareja`)}
      ${paragraph(`<strong>${escapeHtml(inviterName)}</strong> se está apuntando a <strong>${escapeHtml(competitionName)}</strong> y quiere jugar contigo.`)}
      ${infoBox([['Competición', competitionName], ['Te invita', inviterName], ['Organiza', brandName]])}
      ${paragraph('Confirma y quedaréis inscritos como pareja automáticamente. <strong>Hasta que aceptes, la inscripción no está cerrada.</strong>')}
      ${cta(acceptUrl, 'Confirmar y apuntarme', 'green')}
      ${secondaryLink(acceptUrl, 'Ver los detalles antes de decidir')}
      ${smallNote('Si no conoces a esta persona, ignora este email: no se te apuntará a nada.')}
    `,
  });
}

interface IndMatchUpdateProps extends CommonProps {
  matchName: string;
  /** First-line headline shown big at the top, e.g. 'Partido cancelado'. */
  headline: string;
  /** Free text body, single paragraph. */
  body: string;
  /** Optional link back to the match page. */
  matchUrl?: string;
}
export const indMatchUpdateSubject = (matchName: string, kind: 'cancelled' | 'left'): string =>
  kind === 'cancelled' ? `Partido cancelado: ${matchName}` : `Cambio en tu partido: ${matchName}`;
export function renderIndMatchUpdate({
  matchName, headline, body, matchUrl, appUrl,
}: IndMatchUpdateProps): string {
  return wrapEmail({
    appUrl,
    preheader: body,
    content: `
      ${heading(headline)}
      ${paragraph(escapeHtml(body))}
      ${infoBox([['Partido', matchName]])}
      ${matchUrl ? cta(matchUrl, 'Ver partido', 'navy') : ''}
    `,
  });
}

interface IndMatchChallengeResponseProps extends CommonProps {
  challengedTeamName: string;
  matchName: string;
  accepted: boolean;
  matchUrl: string;
}
export const indMatchChallengeResponseSubject = (accepted: boolean): string =>
  accepted ? 'Tu reto fue aceptado' : 'Tu reto fue rechazado';
export function renderIndMatchChallengeResponse({
  challengedTeamName, matchName, accepted, matchUrl, appUrl,
}: IndMatchChallengeResponseProps): string {
  const verb = accepted ? 'aceptado' : 'rechazado';
  return wrapEmail({
    appUrl,
    preheader: `${challengedTeamName} ha ${verb} tu reto.`,
    content: `
      ${heading(accepted ? '¡Reto aceptado!' : 'Reto rechazado')}
      ${paragraph(`El equipo <strong>${escapeHtml(challengedTeamName)}</strong> ha ${verb} tu reto <strong>${escapeHtml(matchName)}</strong>.`)}
      ${accepted ? cta(matchUrl, 'Ver partido', 'green') : ''}
    `,
  });
}
