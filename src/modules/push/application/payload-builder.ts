import { prisma } from '@/shared/db/client';
import type { Notification, NotificationType } from '@prisma/client';

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  icon: string;
  badge: string;
};

const ICON_URL = '/logopwa.png';

function readString(meta: unknown, key: string): string | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

const LEAGUE_MATCH_TYPES = new Set<NotificationType>([
  'MATCH_ASSIGNED',
  'DATE_PROPOSED',
  'DATE_ACCEPTED',
  'DATE_REJECTED',
  'EXTENSION_PROPOSED',
  'EXTENSION_ACCEPTED',
  'EXTENSION_REJECTED',
  'RESULT_SUBMITTED',
  'RESULT_CONFIRMED',
  'RESULT_REJECTED',
  'COMMENTARY_GENERATED',
  'DEADLINE_REMINDER',
]);

const INDEPENDENT_MATCH_TYPES = new Set<NotificationType>([
  'INDEPENDENT_MATCH_INVITE',
  'INDEPENDENT_MATCH_JOIN_REQUEST',
  'INDEPENDENT_MATCH_CONFIRMED',
  'INDEPENDENT_MATCH_CANCELLED',
  'INDEPENDENT_MATCH_CHAT',
  'INDEPENDENT_MATCH_DATE_CHANGED',
]);

const LEAGUE_TYPES = new Set<NotificationType>([
  'LEAGUE_STARTING',
  'LEAGUE_FINISHED',
  'LEAGUE_REGISTRATION_OPEN',
  'LEAGUE_REGISTRATION_ADDED',
  'LEAGUE_REGISTRATION_REMOVED',
]);

// Mirrors notification-service.resolveHref but does its own slug lookups so it
// can run on a single notification. We accept the extra DB read because push
// is processed one row at a time.
async function resolveHref(n: Pick<Notification, 'type' | 'metadata'>): Promise<string> {
  const meta = n.metadata as Record<string, unknown> | null;
  const matchId = readString(meta, 'matchId');
  const leagueId = readString(meta, 'leagueId');
  const leagueSlug = readString(meta, 'leagueSlug');
  const teamId = readString(meta, 'teamId');
  const matchKind = readString(meta, 'matchKind');
  const type = n.type;

  // Atajo: si quien crea la notificación marca explícitamente que el match
  // es independent (p.ej. el recordatorio día-antes para un partido suelto),
  // saltamos directo a /jugar/{id} sin pasar por `slugFromMatchId` (que mira
  // la tabla `matches`, no `independent_matches`, y devolvería /dashboard).
  if (matchKind === 'independent' && matchId) {
    return `/jugar/${matchId}`;
  }

  if (type === 'MATCH_PHOTO_UPLOADED' || type === 'MATCH_PHOTO_COMMENT' || type === 'MATCH_PHOTO_MENTION') {
    if (!matchId) return '/dashboard';
    if (matchKind === 'league') {
      const slug = leagueSlug ?? (await slugFromMatchId(matchId));
      return slug ? `/ligas/${slug}/partidos/${matchId}` : '/dashboard';
    }
    return '/dashboard';
  }
  if (INDEPENDENT_MATCH_TYPES.has(type)) {
    return matchId ? `/jugar/${matchId}` : '/dashboard';
  }
  if (LEAGUE_MATCH_TYPES.has(type)) {
    if (!matchId) return '/dashboard';
    const slug = leagueSlug ?? (await slugFromMatchId(matchId));
    return slug ? `/ligas/${slug}/partidos/${matchId}` : '/dashboard';
  }
  if (LEAGUE_TYPES.has(type)) {
    const slug = leagueSlug ?? (leagueId ? await slugFromLeagueId(leagueId) : undefined);
    return slug ? `/ligas/${slug}` : '/dashboard';
  }
  if (type === 'TEAM_INVITATION') return '/equipos';
  if (type === 'TEAM_INVITATION_ACCEPTED' || type === 'TEAM_INVITATION_REJECTED' || type === 'TEAM_MEMBER_LEFT') {
    return teamId ? `/equipos/${teamId}` : '/equipos';
  }
  if (type === 'DISPUTE_OPENED' || type === 'DISPUTE_RESOLVED') return '/admin/disputas';
  if (type === 'CATEGORY_CHANGE_PROPOSED') return '/dashboard';
  return '/dashboard';
}

async function slugFromMatchId(matchId: string): Promise<string | undefined> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: { league: { select: { slug: true } } },
  });
  return m?.league.slug;
}

async function slugFromLeagueId(leagueId: string): Promise<string | undefined> {
  const l = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { slug: true },
  });
  return l?.slug ?? undefined;
}

// Chat messages get a generic body so the message text never appears on a
// device lockscreen. The user taps through to read it inside the app.
function chatBody(): string {
  return 'Tienes un mensaje nuevo';
}

export async function buildPushPayload(
  n: Pick<Notification, 'id' | 'type' | 'title' | 'body' | 'metadata'>,
): Promise<PushPayload> {
  const url = await resolveHref(n);
  const body = n.type === 'INDEPENDENT_MATCH_CHAT' ? chatBody() : n.body;
  return {
    title: n.title,
    body,
    url,
    tag: n.id,
    icon: ICON_URL,
    badge: ICON_URL,
  };
}
