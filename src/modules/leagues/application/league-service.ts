import { prisma } from '@/shared/db/client';
import { ConflictError, NotFoundError, AuthorizationError, DomainError } from '@/shared/errors';
import type { CreateLeagueInput, CreateTeamInput, LeagueRow, TeamRow, MatchRow } from '../domain/types';
import { generateFixtures } from './fixture-generator';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const LeagueService = {
  async create(input: CreateLeagueInput): Promise<LeagueRow> {
    const baseSlug = toSlug(input.name);
    const existing = await prisma.league.findMany({ where: { slug: { startsWith: baseSlug } } });
    const slug = existing.length === 0 ? baseSlug : `${baseSlug}-${existing.length + 1}`;

    const league = await prisma.league.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        matchFormat: input.matchFormat ?? 'FLEXIBLE',
        defaultDeadlineDays: input.defaultDeadlineDays ?? 21,
        createdByUserId: input.createdByUserId,
        members: {
          create: { userId: input.createdByUserId, role: 'LEAGUE_ADMIN' },
        },
      },
    });
    return league;
  },

  async list(): Promise<LeagueRow[]> {
    return prisma.league.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  async getBySlug(slug: string): Promise<LeagueRow> {
    const league = await prisma.league.findUnique({ where: { slug } });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Liga no encontrada.');
    return league;
  },

  async getTeams(leagueId: string): Promise<TeamRow[]> {
    return prisma.team.findMany({
      where: { leagueId },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
      orderBy: { name: 'asc' },
    });
  },

  async getMatches(leagueId: string): Promise<MatchRow[]> {
    return prisma.match.findMany({
      where: { leagueId },
      include: {
        teamA: { select: { id: true, name: true } },
        teamB: { select: { id: true, name: true } },
      },
      orderBy: [{ round: 'asc' }, { deadlineAt: 'asc' }],
    });
  },

  async createTeam(input: CreateTeamInput): Promise<{ id: string; name: string }> {
    const exists = await prisma.team.findFirst({
      where: { leagueId: input.leagueId, name: input.name },
    });
    if (exists) throw new ConflictError('TEAM_EXISTS', 'Ya existe un equipo con ese nombre en esta liga.');

    return prisma.team.create({ data: { leagueId: input.leagueId, name: input.name } });
  },

  async addTeamMember(teamId: string, userId: string): Promise<void> {
    const team = await prisma.team.findUnique({ where: { id: teamId }, include: { members: true } });
    if (!team) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');
    if (team.members.length >= 2) throw new DomainError('TEAM_FULL', 'El equipo ya tiene 2 miembros.');
    if (team.members.some((m) => m.userId === userId))
      throw new ConflictError('MEMBER_EXISTS', 'El jugador ya es miembro de este equipo.');

    const league = await prisma.league.findUnique({ where: { id: team.leagueId } });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Liga no encontrada.');
    if (league.status !== 'DRAFT')
      throw new DomainError('LEAGUE_NOT_DRAFT', 'No se pueden modificar equipos de una liga activa.');

    await prisma.teamMember.create({ data: { teamId, userId } });
  },

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    const member = await prisma.teamMember.findFirst({ where: { teamId, userId } });
    if (!member) throw new NotFoundError('MEMBER_NOT_FOUND', 'El jugador no es miembro de este equipo.');

    const team = await prisma.team.findUnique({ where: { id: teamId }, include: { league: true } });
    if (team?.league.status !== 'DRAFT')
      throw new DomainError('LEAGUE_NOT_DRAFT', 'No se pueden modificar equipos de una liga activa.');

    await prisma.teamMember.delete({ where: { id: member.id } });
  },

  async activateLeague(leagueId: string, requestingUserId: string): Promise<void> {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: { teams: { include: { members: true } } },
    });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Liga no encontrada.');
    if (league.status !== 'DRAFT')
      throw new DomainError('LEAGUE_NOT_DRAFT', 'La liga ya está activa o finalizada.');

    const [requester, member] = await Promise.all([
      prisma.user.findUnique({ where: { id: requestingUserId }, select: { role: true } }),
      prisma.leagueMember.findFirst({
        where: { leagueId, userId: requestingUserId, role: 'LEAGUE_ADMIN' },
      }),
    ]);
    if (requester?.role !== 'SUPER_ADMIN' && !member) {
      throw new AuthorizationError('NOT_LEAGUE_ADMIN', 'Solo el admin de liga puede activarla.');
    }

    if (league.teams.length < 2)
      throw new DomainError('NOT_ENOUGH_TEAMS', 'La liga necesita al menos 2 equipos para activarse.');

    const teamsWithWrongSize = league.teams.filter((t) => t.members.length !== 2);
    if (teamsWithWrongSize.length > 0) {
      const names = teamsWithWrongSize.map((t) => t.name).join(', ');
      throw new DomainError('TEAM_SIZE_INVALID', `Los siguientes equipos no tienen exactamente 2 jugadores: ${names}.`);
    }

    await prisma.$transaction(async (tx) => {
      // Guard: skip fixture generation if matches already exist (idempotency)
      const existingCount = await tx.match.count({ where: { leagueId } });
      if (existingCount === 0) {
        const teamIds = league.teams.map((t) => t.id);
        const fixtures = generateFixtures(teamIds, league.startDate, league.defaultDeadlineDays);
        if (fixtures.length > 0) {
          await tx.match.createMany({
            data: fixtures.map((f) => ({
              leagueId,
              teamAId: f.teamAId,
              teamBId: f.teamBId,
              deadlineAt: f.deadlineAt,
              round: f.round,
            })),
          });
        }
      }
      await tx.league.update({ where: { id: leagueId }, data: { status: 'ACTIVE' } });
    });
  },

  async updateLeague(
    leagueId: string,
    requestingUserId: string,
    input: { name?: string; description?: string | null; endDate?: Date },
  ): Promise<LeagueRow> {
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Liga no encontrada.');

    const [requester, member] = await Promise.all([
      prisma.user.findUnique({ where: { id: requestingUserId }, select: { role: true } }),
      prisma.leagueMember.findFirst({
        where: { leagueId, userId: requestingUserId, role: 'LEAGUE_ADMIN' },
      }),
    ]);
    if (requester?.role !== 'SUPER_ADMIN' && !member) {
      throw new AuthorizationError('NOT_LEAGUE_ADMIN', 'Solo los admins pueden editar la liga.');
    }

    if (input.name !== undefined && input.name.trim().length === 0) {
      throw new DomainError('INVALID_NAME', 'El nombre no puede estar vacío.');
    }

    if (input.endDate !== undefined && input.endDate.getTime() <= league.startDate.getTime()) {
      throw new DomainError('INVALID_END_DATE', 'La fecha fin debe ser posterior al inicio de la liga.');
    }

    return prisma.league.update({
      where: { id: leagueId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.endDate !== undefined && { endDate: input.endDate }),
      },
    });
  },

  async deleteLeague(leagueId: string, requestingUserId: string): Promise<void> {
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Liga no encontrada.');

    const requester = await prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { role: true },
    });
    if (requester?.role !== 'SUPER_ADMIN') {
      throw new AuthorizationError('FORBIDDEN', 'Solo Super Admin puede borrar ligas.');
    }

    // Cascade deletes: teams, matches, results, sets, scheduling/extension proposals,
    // commentaries, league_members all have ON DELETE CASCADE on their FK to leagues/teams/matches.
    await prisma.league.delete({ where: { id: leagueId } });
  },
} as const;
