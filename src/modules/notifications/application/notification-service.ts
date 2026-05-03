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
]);

const LEAGUE_TYPES = new Set<NotificationType>([
  'LEAGUE_STARTING',
  'LEAGUE_FINISHED',
  'LEAGUE_REGISTRATION_OPEN',
  'LEAGUE_REGISTRATION_ADDED',
  'LEAGUE_REGISTRATION_REMOVED',
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
  if (type === 'TEAM_INVITATION' || type === 'TEAM_INVITATION_ACCEPTED' || type === 'TEAM_INVITATION_REJECTED') {
    return teamId ? `/equipos/${teamId}` : null;
  }
  if (type === 'DISPUTE_OPENED' || type === 'DISPUTE_RESOLVED') {
    return '/admin/disputas';
  }
  if (type === 'CATEGORY_CHANGE_PROPOSED') {
    return '/dashboard';
  }
  return null;
}

export const NotificationService = {
  async create(input: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  },

  async createMany(inputs: Array<{
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }>): Promise<void> {
    if (inputs.length === 0) return;
    await prisma.notification.createMany({
      data: inputs.map((n) => ({
        userId: n.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata: n.metadata as Prisma.InputJsonValue | undefined,
      })),
    });
  },

  async getUnread(userId: string): Promise<{ count: number; items: NotificationItem[] }> {
    const [rawItems, count] = await prisma.$transaction([
      prisma.notification.findMany({
        where: { userId, readAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, title: true, body: true, metadata: true, createdAt: true },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
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
      if (leagueId && LEAGUE_TYPES.has(n.type) && !leagueSlug) leagueIds.add(leagueId);
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

  async markAllRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  },
} as const;
