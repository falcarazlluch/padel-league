import { prisma } from '@/shared/db/client';
import { NotFoundError, AuthorizationError, DomainError } from '@/shared/errors';
import type { TeamCategory } from '@prisma/client';
import type { CreateLeagueInput, LeagueRow, TeamRow, MatchRow } from '../domain/types';
import { generateFixtures } from './fixture-generator';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function validateLeagueDates(input: {
  registrationStart: Date;
  registrationEnd: Date;
  startDate: Date;
  endDate: Date;
}): void {
  if (input.registrationStart.getTime() >= input.registrationEnd.getTime()) {
    throw new DomainError('INVALID_REGISTRATION_WINDOW', 'El cierre de inscripción debe ser posterior a su apertura.');
  }
  if (input.registrationEnd.getTime() > input.startDate.getTime()) {
    throw new DomainError('INVALID_REGISTRATION_WINDOW', 'El cierre de inscripción debe ser anterior o igual al inicio de la liga.');
  }
  if (input.startDate.getTime() >= input.endDate.getTime()) {
    throw new DomainError('INVALID_END_DATE', 'La fecha fin debe ser posterior al inicio de la liga.');
  }
}

export const LeagueService = {
  async create(input: CreateLeagueInput): Promise<LeagueRow> {
    validateLeagueDates({
      registrationStart: input.registrationStart,
      registrationEnd: input.registrationEnd,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    const baseSlug = toSlug(input.name);
    const existing = await prisma.league.findMany({ where: { slug: { startsWith: baseSlug } } });
    const slug = existing.length === 0 ? baseSlug : `${baseSlug}-${existing.length + 1}`;

    const league = await prisma.league.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        registrationStart: input.registrationStart,
        registrationEnd: input.registrationEnd,
        startDate: input.startDate,
        endDate: input.endDate,
        category: input.category ?? 'INTERMEDIATE',
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

  /** Returns teams currently registered (not withdrawn) in the league. */
  async getTeams(leagueId: string): Promise<TeamRow[]> {
    const registrations = await prisma.leagueRegistration.findMany({
      where: { leagueId, withdrawnAt: null },
      include: {
        team: {
          include: {
            members: {
              include: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        },
      },
      orderBy: { team: { name: 'asc' } },
    });
    return registrations.map((r) => ({
      id: r.team.id,
      leagueId,
      name: r.team.name,
      category: r.team.category,
      members: r.team.members.map((m) => ({
        userId: m.userId,
        user: { id: m.user.id, name: m.user.name, email: m.user.email },
      })),
    }));
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

  async activateLeague(leagueId: string, requestingUserId: string): Promise<void> {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        registrations: {
          where: { withdrawnAt: null },
          include: { team: { include: { members: true } } },
        },
      },
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

    const registeredTeams = league.registrations.map((r) => r.team);
    if (registeredTeams.length < 2)
      throw new DomainError('NOT_ENOUGH_TEAMS', 'La liga necesita al menos 2 equipos apuntados para activarse.');

    const teamsWithWrongSize = registeredTeams.filter((t) => t.members.length !== 2);
    if (teamsWithWrongSize.length > 0) {
      const names = teamsWithWrongSize.map((t) => t.name).join(', ');
      throw new DomainError('TEAM_SIZE_INVALID', `Los siguientes equipos no tienen exactamente 2 jugadores: ${names}.`);
    }

    await prisma.$transaction(async (tx) => {
      // Guard: skip fixture generation if matches already exist (idempotency)
      const existingCount = await tx.match.count({ where: { leagueId } });
      if (existingCount === 0) {
        const teamIds = registeredTeams.map((t) => t.id);
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
    input: {
      name?: string;
      description?: string | null;
      registrationStart?: Date;
      registrationEnd?: Date;
      endDate?: Date;
      category?: TeamCategory;
    },
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

    const merged = {
      registrationStart: input.registrationStart ?? league.registrationStart,
      registrationEnd: input.registrationEnd ?? league.registrationEnd,
      startDate: league.startDate,
      endDate: input.endDate ?? league.endDate,
    };
    validateLeagueDates(merged);

    return prisma.league.update({
      where: { id: leagueId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.registrationStart !== undefined && { registrationStart: input.registrationStart }),
        ...(input.registrationEnd !== undefined && { registrationEnd: input.registrationEnd }),
        ...(input.endDate !== undefined && { endDate: input.endDate }),
        ...(input.category !== undefined && { category: input.category }),
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

    // Cascade deletes: registrations, matches, results, sets, scheduling/extension proposals,
    // commentaries, league_members all have ON DELETE CASCADE on their FK to leagues/teams/matches.
    await prisma.league.delete({ where: { id: leagueId } });
  },
} as const;
