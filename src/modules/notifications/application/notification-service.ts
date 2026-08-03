import { prisma } from '@/shared/db/client';
import type { NotificationType, Prisma } from '@prisma/client';

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  href: string | null;
};

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

// Enrolment notifications that resolve to `/inscripcion/estado/<leagueSlug>`,
// so they need the same leagueId → slug batch lookup as LEAGUE_TYPES.
const ENROLLMENT_TYPES = new Set<NotificationType>([
  'TOURNAMENT_PARTNER_ACCEPTED',
  'TOURNAMENT_PARTNER_DECLINED',
  'TOURNAMENT_ENROLLMENT_COMPLETED',
]);

function readString(metadata: Record<string, unknown> | null, key: string): string | undefined {
  const v = metadata?.[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function resolveHref(
  type: NotificationType,
  metadata: Record<string, unknown> | null,
  matchToSlug: Map<string, string>,
  leagueIdToSlug: Map<string, string>,
): string | null {
  const matchId = readString(metadata, 'matchId');
  const leagueId = readString(metadata, 'leagueId');
  const leagueSlug = readString(metadata, 'leagueSlug');
  const teamId = readString(metadata, 'teamId');
  const matchKind = readString(metadata, 'matchKind');

  // Photo notifications carry both the match kind and id in metadata so we can
  // route them to the right detail page without needing to hit the DB.
  if (type === 'MATCH_PHOTO_UPLOADED' || type === 'MATCH_PHOTO_COMMENT' || type === 'MATCH_PHOTO_MENTION') {
    if (!matchId) return null;
    if (matchKind === 'independent') return `/jugar/${matchId}`;
    if (matchKind === 'league') {
      const slug = leagueSlug ?? matchToSlug.get(matchId);
      return slug ? `/ligas/${slug}/partidos/${matchId}` : null;
    }
    return null;
  }

  if (INDEPENDENT_MATCH_TYPES.has(type)) {
    return matchId ? `/jugar/${matchId}` : null;
  }
  if (LEAGUE_MATCH_TYPES.has(type)) {
    if (!matchId) return null;
    const slug = leagueSlug ?? matchToSlug.get(matchId);
    return slug ? `/ligas/${slug}/partidos/${matchId}` : null;
  }
  if (LEAGUE_TYPES.has(type)) {
    const slug = leagueSlug ?? (leagueId ? leagueIdToSlug.get(leagueId) : undefined);
    return slug ? `/ligas/${slug}` : null;
  }
  // Guided tournament enrolment. The partner invite needs its own accept page
  // (the invitee is not a team member yet); the rest land on the enrolment
  // status page, which is the one screen that states plainly whether the pair
  // is in and what — if anything — is still missing.
  if (type === 'TOURNAMENT_PARTNER_INVITE') {
    const inviteToken = readString(metadata, 'partnerInviteToken');
    return inviteToken ? `/pareja/${inviteToken}` : '/dashboard';
  }
  if (
    type === 'TOURNAMENT_PARTNER_ACCEPTED' ||
    type === 'TOURNAMENT_PARTNER_DECLINED' ||
    type === 'TOURNAMENT_ENROLLMENT_COMPLETED'
  ) {
    const slug = leagueSlug ?? (leagueId ? leagueIdToSlug.get(leagueId) : undefined);
    return slug ? `/inscripcion/estado/${slug}` : '/dashboard';
  }
  if (type === 'TEAM_INVITATION') {
    // The invitee isn't a member of the team yet, so /equipos/[id] would 404
    // (ensureMember rejects non-members). The pending invitation is listed on
    // /equipos itself, where they can accept or reject it.
    return '/equipos';
  }
  if (type === 'TEAM_INVITATION_ACCEPTED' || type === 'TEAM_INVITATION_REJECTED' || type === 'TEAM_MEMBER_LEFT') {
    return teamId ? `/equipos/${teamId}` : '/equipos';
  }
  if (type === 'DISPUTE_OPENED' || type === 'DISPUTE_RESOLVED') {
    return '/admin/disputas';
  }
  if (type === 'CATEGORY_CHANGE_PROPOSED') {
    return '/dashboard';
  }
  return null;
}

/**
 * Resolves the tenant a notification belongs to from the entity that caused it.
 *
 * Callers pass whichever id they already have; we look up its organization. This
 * keeps the tenant derivation in one place instead of threading an
 * `organizationId` through every one of the ~11 services that emit
 * notifications, each of which would have to remember to do it.
 *
 * Returns `null` for the public platform — which is also the safe default, since
 * a mis-resolved notification then shows on the public app rather than leaking
 * into somebody's private club.
 */
export type NotificationScope =
  | { leagueId: string }
  | { teamId: string }
  | { matchId: string }
  | { independentMatchId: string }
  /** Already known — skips the lookup. */
  | { organizationId: string | null };

export async function resolveNotificationOrg(
  ref: NotificationScope,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string | null> {
  if ('organizationId' in ref) return ref.organizationId;
  if ('leagueId' in ref) {
    const row = await tx.league.findUnique({
      where: { id: ref.leagueId },
      select: { organizationId: true },
    });
    return row?.organizationId ?? null;
  }
  if ('teamId' in ref) {
    const row = await tx.team.findUnique({
      where: { id: ref.teamId },
      select: { organizationId: true },
    });
    return row?.organizationId ?? null;
  }
  if ('matchId' in ref) {
    const row = await tx.match.findUnique({
      where: { id: ref.matchId },
      select: { league: { select: { organizationId: true } } },
    });
    return row?.league.organizationId ?? null;
  }
  const row = await tx.independentMatch.findUnique({
    where: { id: ref.independentMatchId },
    select: { organizationId: true },
  });
  return row?.organizationId ?? null;
}

export const NotificationService = {
  // `excludeActorId` filtra al usuario que dispara la acción para que no reciba
  // su propia notificación (ej: tú confirmas un resultado → solo se notifica al
  // resto, no a ti mismo). Sin él, la API es retro-compatible.
  async create(
    input: {
      userId: string;
      type: NotificationType;
      title: string;
      body: string;
      metadata?: Record<string, unknown>;
    },
    options?: { excludeActorId?: string; scope?: NotificationScope },
  ): Promise<void> {
    if (options?.excludeActorId && options.excludeActorId === input.userId) return;
    // No scope → public platform. That is the safe default: a notification that
    // should have been tenant-scoped is merely missing from the tenant's panel,
    // never leaked into somebody else's private environment.
    const organizationId = options?.scope ? await resolveNotificationOrg(options.scope) : null;
    await prisma.notification.create({
      data: {
        userId: input.userId,
        organizationId,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  },

  async createMany(
    inputs: Array<{
      userId: string;
      type: NotificationType;
      title: string;
      body: string;
      metadata?: Record<string, unknown>;
    }>,
    options?: { excludeActorId?: string; scope?: NotificationScope },
  ): Promise<void> {
    const filtered = options?.excludeActorId
      ? inputs.filter((n) => n.userId !== options.excludeActorId)
      : inputs;
    if (filtered.length === 0) return;
    // Resolved once for the whole batch — every notification in a batch comes
    // from the same event, so they share a tenant.
    const organizationId = options?.scope ? await resolveNotificationOrg(options.scope) : null;
    await prisma.notification.createMany({
      data: filtered.map((n) => ({
        userId: n.userId,
        organizationId,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata: n.metadata as Prisma.InputJsonValue | undefined,
      })),
    });
  },

  /**
   * `organizationId` is a REQUIRED tenant scope (`null` = public platform).
   * Both the list and the badge count are filtered, so a RACC member browsing
   * racc.mypadelleague.es never sees a public-platform notification and the
   * unread count matches what the panel actually shows.
   */
  async getUnread(
    userId: string,
    organizationId: string | null,
  ): Promise<{ count: number; items: NotificationItem[] }> {
    const where = { userId, readAt: null, organizationId };
    const [rawItems, count] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, title: true, body: true, metadata: true, createdAt: true },
      }),
      prisma.notification.count({ where }),
    ]);

    const items = rawItems.map((n) => ({
      ...n,
      metadata: n.metadata as Record<string, unknown> | null,
    }));

    // Batch lookups for slugs we need to build hrefs.
    const matchIds = new Set<string>();
    const leagueIds = new Set<string>();
    for (const n of items) {
      const meta = n.metadata;
      const matchId = readString(meta, 'matchId');
      const leagueSlug = readString(meta, 'leagueSlug');
      const leagueId = readString(meta, 'leagueId');
      if (matchId && LEAGUE_MATCH_TYPES.has(n.type) && !leagueSlug) matchIds.add(matchId);
      if (leagueId && (LEAGUE_TYPES.has(n.type) || ENROLLMENT_TYPES.has(n.type)) && !leagueSlug) {
        leagueIds.add(leagueId);
      }
    }

    const [matches, leagues] = await Promise.all([
      matchIds.size > 0
        ? prisma.match.findMany({
            where: { id: { in: [...matchIds] } },
            select: { id: true, league: { select: { slug: true } } },
          })
        : Promise.resolve([]),
      leagueIds.size > 0
        ? prisma.league.findMany({
            where: { id: { in: [...leagueIds] } },
            select: { id: true, slug: true },
          })
        : Promise.resolve([]),
    ]);

    const matchToSlug = new Map(matches.map((m) => [m.id, m.league.slug]));
    const leagueIdToSlug = new Map(leagues.map((l) => [l.id, l.slug]));

    return {
      count,
      items: items.map((n) => ({
        ...n,
        href: resolveHref(n.type, n.metadata, matchToSlug, leagueIdToSlug),
      })),
    };
  },

  async markRead(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
  },

  /** Scoped too: "marcar todas como leídas" inside a tenant must not silently
   *  clear the user's public-platform notifications. */
  async markAllRead(userId: string, organizationId: string | null): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, readAt: null, organizationId },
      data: { readAt: new Date() },
    });
  },
} as const;
