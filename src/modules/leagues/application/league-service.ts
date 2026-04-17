import { prisma } from '@/shared/db/client';
import { ConflictError, NotFoundError, AuthorizationError, DomainError } from '@/shared/errors';
import type { CreateLeagueInput, CreateTeamInput, LeagueRow, TeamRow, MatchRow } from '../domain/types';

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
      orderBy: { deadlineAt: 'asc' },
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

    const member = await prisma.leagueMember.findFirst({
      where: { leagueId, userId: requestingUserId, role: 'LEAGUE_ADMIN' },
    });
    if (!member) throw new AuthorizationError('NOT_LEAGUE_ADMIN', 'Solo el admin de liga puede activarla.');

    if (league.teams.length < 2)
      throw new DomainError('NOT_ENOUGH_TEAMS', 'La liga necesita al menos 2 equipos para activarse.');

    const teamsWithWrongSize = league.teams.filter((t) => t.members.length !== 2);
    if (teamsWithWrongSize.length > 0) {
      const names = teamsWithWrongSize.map((t) => t.name).join(', ');
      throw new DomainError('TEAM_SIZE_INVALID', `Los siguientes equipos no tienen exactamente 2 jugadores: ${names}.`);
    }

    await prisma.league.update({ where: { id: leagueId }, data: { status: 'ACTIVE' } });
  },
} as const;
