import { prisma } from '@/shared/db/client';
import { AuthorizationError, DomainError, NotFoundError } from '@/shared/errors';
import { CATEGORY_LABEL } from '../domain/category';
import { calculateCategoryProposals } from './category-evolution';
import { calculateStandings } from './standings-calculator';

type PendingProposal = {
  id: string;
  teamId: string;
  teamName: string;
  leagueId: string;
  leagueName: string;
  leagueSlug: string;
  fromCategory: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  toCategory: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  reason: 'PROMOTION' | 'DEMOTION';
  createdAt: Date;
};

export const CategoryProposalService = {
  /**
   * Compute and persist category-change proposals for a finalized league.
   * Skips teams that already have an open PROPOSED proposal.
   * Idempotent: safe to call multiple times.
   */
  async createProposalsForLeague(leagueId: string): Promise<{ created: number }> {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        id: true,
        name: true,
        pointsWin: true,
        teams: {
          select: {
            id: true,
            name: true,
            category: true,
            members: { select: { userId: true } },
          },
        },
      },
    });
    if (!league) return { created: 0 };

    const teamNames = Object.fromEntries(league.teams.map((t) => [t.id, t.name]));

    const matches = await prisma.match.findMany({
      where: {
        leagueId,
        status: { in: ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'] },
      },
      include: { confirmedResult: { include: { sets: true } } },
    });

    const standings = calculateStandings(
      teamNames,
      matches.map((m) => ({
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        status: m.status as 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED',
        winnerTeamId: m.winnerTeamId,
        sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
      })),
    );

    const teamCategoryMap = new Map(league.teams.map((t) => [t.id, t.category]));
    const proposalCandidates = calculateCategoryProposals(
      standings.map((s) => ({
        teamId: s.teamId,
        category: teamCategoryMap.get(s.teamId)!,
        points: s.points,
      })),
      league.pointsWin,
    );

    if (proposalCandidates.length === 0) return { created: 0 };

    const teamsWithOpenProposal = await prisma.teamCategoryChangeProposal.findMany({
      where: {
        teamId: { in: proposalCandidates.map((p) => p.teamId) },
        status: 'PROPOSED',
      },
      select: { teamId: true },
    });
    const skippedTeamIds = new Set(teamsWithOpenProposal.map((p) => p.teamId));

    const toCreate = proposalCandidates.filter((p) => !skippedTeamIds.has(p.teamId));
    if (toCreate.length === 0) return { created: 0 };

    await prisma.$transaction(async (tx) => {
      const created = await Promise.all(
        toCreate.map((p) =>
          tx.teamCategoryChangeProposal.create({
            data: {
              teamId: p.teamId,
              leagueId,
              fromCategory: p.fromCategory,
              toCategory: p.toCategory,
              reason: p.reason,
            },
          }),
        ),
      );

      const memberPayloads: Array<{
        userId: string;
        type: 'CATEGORY_CHANGE_PROPOSED';
        title: string;
        body: string;
        metadata: { proposalId: string; teamId: string; leagueId: string };
      }> = [];

      for (const proposal of created) {
        const team = league.teams.find((t) => t.id === proposal.teamId);
        if (!team) continue;
        const verb = proposal.reason === 'PROMOTION' ? 'subir' : 'bajar';
        const title =
          proposal.reason === 'PROMOTION'
            ? `Propuesta de ascenso a ${CATEGORY_LABEL[proposal.toCategory]}`
            : `Propuesta de descenso a ${CATEGORY_LABEL[proposal.toCategory]}`;
        const body = `Se propone ${verb} al equipo "${team.name}" a categoría ${CATEGORY_LABEL[proposal.toCategory]} tras los resultados de la liga "${league.name}".`;
        for (const m of team.members) {
          memberPayloads.push({
            userId: m.userId,
            type: 'CATEGORY_CHANGE_PROPOSED',
            title,
            body,
            metadata: { proposalId: proposal.id, teamId: team.id, leagueId },
          });
        }
      }

      if (memberPayloads.length > 0) {
        await tx.notification.createMany({ data: memberPayloads });
      }
    });

    return { created: toCreate.length };
  },

  async listPendingForUser(userId: string): Promise<PendingProposal[]> {
    const rows = await prisma.teamCategoryChangeProposal.findMany({
      where: {
        status: 'PROPOSED',
        team: { members: { some: { userId } } },
      },
      include: {
        team: { select: { id: true, name: true } },
        league: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      teamId: r.teamId,
      teamName: r.team.name,
      leagueId: r.league.id,
      leagueName: r.league.name,
      leagueSlug: r.league.slug,
      fromCategory: r.fromCategory,
      toCategory: r.toCategory,
      reason: r.reason,
      createdAt: r.createdAt,
    }));
  },

  async accept(proposalId: string, userId: string): Promise<void> {
    await this._resolve(proposalId, userId, 'ACCEPTED');
  },

  async reject(proposalId: string, userId: string): Promise<void> {
    await this._resolve(proposalId, userId, 'REJECTED');
  },

  async _resolve(
    proposalId: string,
    userId: string,
    decision: 'ACCEPTED' | 'REJECTED',
  ): Promise<void> {
    const proposal = await prisma.teamCategoryChangeProposal.findUnique({
      where: { id: proposalId },
      include: { team: { include: { members: { select: { userId: true } } } } },
    });
    if (!proposal) throw new NotFoundError('PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');
    if (proposal.status !== 'PROPOSED') {
      throw new DomainError('PROPOSAL_ALREADY_RESOLVED', 'Esta propuesta ya fue resuelta.');
    }
    const isMember = proposal.team.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new AuthorizationError('NOT_TEAM_MEMBER', 'Solo miembros del equipo pueden resolver la propuesta.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.teamCategoryChangeProposal.update({
        where: { id: proposalId },
        data: { status: decision, resolvedByUserId: userId, resolvedAt: new Date() },
      });
      if (decision === 'ACCEPTED') {
        await tx.team.update({
          where: { id: proposal.teamId },
          data: { category: proposal.toCategory },
        });
      }
    });
  },
} as const;
