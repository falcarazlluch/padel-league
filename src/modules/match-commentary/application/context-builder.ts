import { prisma } from '@/shared/db/client';
import { calculateStandings } from '@/modules/leagues';
import { NotFoundError } from '@/shared/errors';
import type { CommentaryContext, CommentaryType, RecentCategoryChange } from '../domain/types';

const RECENT_LIMIT = 3;
const CATEGORY_CHANGE_WINDOW_DAYS = 90;

async function getRecentCategoryChange(teamId: string): Promise<RecentCategoryChange | undefined> {
  const since = new Date(Date.now() - CATEGORY_CHANGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const proposal = await prisma.teamCategoryChangeProposal.findFirst({
    where: {
      teamId,
      status: 'ACCEPTED',
      resolvedAt: { gte: since },
    },
    orderBy: { resolvedAt: 'desc' },
    select: { fromCategory: true, toCategory: true, reason: true },
  });
  if (!proposal) return undefined;
  return {
    fromCategory: proposal.fromCategory,
    toCategory: proposal.toCategory,
    reason: proposal.reason,
  };
}

async function getRecentResults(
  teamId: string,
  excludeMatchId: string,
  teamNamesById: Map<string, string>,
): Promise<Array<{ won: boolean; opponent: string }>> {
  const matches = await prisma.match.findMany({
    where: {
      id: { not: excludeMatchId },
      status: { in: ['CONFIRMED', 'ADMIN_RESOLVED'] },
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    select: {
      teamAId: true,
      teamBId: true,
      winnerTeamId: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: RECENT_LIMIT,
  });

  return matches.map((m) => {
    const opponentId = m.teamAId === teamId ? m.teamBId : m.teamAId;
    const opponent = teamNamesById.get(opponentId) ?? 'Equipo desconocido';
    const won = m.winnerTeamId === teamId;
    return { won, opponent };
  });
}

export async function buildContext(
  matchId: string,
  type: CommentaryType,
): Promise<CommentaryContext> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      league: { select: { id: true, name: true } },
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
      confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
    },
  });
  if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');

  const allTeams = await prisma.team.findMany({
    where: { leagueId: match.league.id },
    select: { id: true, name: true },
  });
  const teamNamesById = new Map(allTeams.map((t) => [t.id, t.name]));
  const teamNamesMap = Object.fromEntries(allTeams.map((t) => [t.id, t.name]));

  const standingsMatches = await prisma.match.findMany({
    where: {
      leagueId: match.league.id,
      status: { in: ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'] },
    },
    include: { confirmedResult: { include: { sets: true } } },
  });

  const standings = calculateStandings(
    teamNamesMap,
    standingsMatches.map((m) => ({
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      status: m.status as 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED',
      winnerTeamId: m.winnerTeamId,
      sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
    })),
  );

  function rankAndPoints(teamId: string): { rank: number | null; points: number } {
    const idx = standings.findIndex((s) => s.teamId === teamId);
    const entry = standings[idx];
    if (!entry || entry.played === 0) return { rank: null, points: entry?.points ?? 0 };
    return { rank: idx + 1, points: entry.points };
  }

  const [recentA, recentB, categoryChangeA, categoryChangeB] = await Promise.all([
    getRecentResults(match.teamAId, matchId, teamNamesById),
    getRecentResults(match.teamBId, matchId, teamNamesById),
    getRecentCategoryChange(match.teamAId),
    getRecentCategoryChange(match.teamBId),
  ]);

  const ctx: CommentaryContext = {
    type,
    league: { name: match.league.name },
    teamA: {
      name: match.teamA.name,
      ...rankAndPoints(match.teamAId),
      recent: recentA,
      ...(categoryChangeA && { recentCategoryChange: categoryChangeA }),
    },
    teamB: {
      name: match.teamB.name,
      ...rankAndPoints(match.teamBId),
      recent: recentB,
      ...(categoryChangeB && { recentCategoryChange: categoryChangeB }),
    },
  };

  if (type === 'RECAP' && match.confirmedResult) {
    const sets = match.confirmedResult.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB }));
    const winnerTeam: 'A' | 'B' | 'DRAW' =
      match.winnerTeamId === match.teamAId
        ? 'A'
        : match.winnerTeamId === match.teamBId
          ? 'B'
          : 'DRAW';
    ctx.result = { sets, winnerTeam };
  }

  if (type === 'PREVIEW' && match.scheduledAt) {
    ctx.scheduledAt = match.scheduledAt;
  }

  return ctx;
}
