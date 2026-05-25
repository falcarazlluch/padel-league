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
    const creator = await prisma.user.findUnique({
      where: { id: input.createdByUserId },
      select: { role: true },
    });
    if (creator?.role !== 'SUPER_ADMIN' && creator?.role !== 'LEAGUE_ADMIN') {
      throw new AuthorizationError(
        'NOT_LEAGUE_ADMIN',
        'Solo los administradores de liga pueden crear competiciones.',
      );
    }

    validateLeagueDates({
      registrationStart: input.registrationStart,
      registrationEnd: input.registrationEnd,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    const type = input.type ?? 'LEAGUE';

    // Validación cruzada del bloque de configuración específico del tipo.
    if (type === 'AMERICANA') {
      if (!input.americana) {
        throw new DomainError('AMERICANA_CONFIG_REQUIRED', 'Falta la configuración de la Americana.');
      }
      if (input.americana.americanaCourts < 1 || input.americana.americanaCourts > 4) {
        throw new DomainError('INVALID_COURTS', 'El número de pistas debe estar entre 1 y 4.');
      }
      if (
        input.americana.americanaRoundFormat === 'FIRST_TO_GAMES' &&
        input.americana.americanaTargetGames !== undefined &&
        (input.americana.americanaTargetGames < 4 || input.americana.americanaTargetGames > 16)
      ) {
        throw new DomainError('INVALID_TARGET_GAMES', 'El objetivo de games por ronda debe estar entre 4 y 16.');
      }
      if (
        input.americana.americanaRoundFormat === 'BY_TIME' &&
        input.americana.americanaRoundMinutes !== undefined &&
        (input.americana.americanaRoundMinutes < 5 || input.americana.americanaRoundMinutes > 90)
      ) {
        throw new DomainError('INVALID_ROUND_MINUTES', 'La duración de cada ronda debe estar entre 5 y 90 minutos.');
      }
    }
    if (type === 'TOURNAMENT') {
      if (!input.tournament) {
        throw new DomainError('TOURNAMENT_CONFIG_REQUIRED', 'Falta la configuración del Torneo.');
      }
      if (input.tournament.hasGroupPhase) {
        const { groupCount, teamsPerGroup, qualifiersPerGroup } = input.tournament;
        if (!groupCount || !teamsPerGroup || !qualifiersPerGroup) {
          throw new DomainError(
            'GROUP_CONFIG_REQUIRED',
            'Si el torneo tiene fase de grupos hay que indicar grupos, parejas por grupo y clasificados por grupo.',
          );
        }
        if (qualifiersPerGroup >= teamsPerGroup) {
          throw new DomainError(
            'INVALID_QUALIFIERS',
            'El número de clasificados por grupo debe ser menor que el total de parejas del grupo.',
          );
        }
      }
    }

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
        type,
        matchFormat: input.matchFormat ?? 'FLEXIBLE',
        defaultDeadlineDays: input.defaultDeadlineDays ?? 21,
        createdByUserId: input.createdByUserId,
        // Americana
        americanaVariant: input.americana?.americanaVariant ?? null,
        americanaRoundFormat: input.americana?.americanaRoundFormat ?? null,
        americanaTargetGames:
          input.americana?.americanaRoundFormat === 'FIRST_TO_GAMES'
            ? (input.americana.americanaTargetGames ?? 8)
            : null,
        americanaRoundMinutes:
          input.americana?.americanaRoundFormat === 'BY_TIME'
            ? (input.americana.americanaRoundMinutes ?? 20)
            : null,
        americanaCourts: input.americana?.americanaCourts ?? null,
        // Tournament
        hasGroupPhase: input.tournament?.hasGroupPhase ?? false,
        groupCount: input.tournament?.hasGroupPhase ? (input.tournament.groupCount ?? null) : null,
        teamsPerGroup: input.tournament?.hasGroupPhase ? (input.tournament.teamsPerGroup ?? null) : null,
        qualifiersPerGroup: input.tournament?.hasGroupPhase
          ? (input.tournament.qualifiersPerGroup ?? null)
          : null,
        bracketSeedingMode: type === 'TOURNAMENT' ? (input.tournament?.bracketSeedingMode ?? 'AUTO') : null,
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

  /** Returns teams currently registered (not withdrawn) in the league. Solo
   * devuelve registros con `team` (no incluye inscripciones individuales de
   * Americana ROTATING_INDIVIDUAL — esas viven en su propio path). */
  async getTeams(leagueId: string): Promise<TeamRow[]> {
    const registrations = await prisma.leagueRegistration.findMany({
      where: { leagueId, withdrawnAt: null, teamId: { not: null } },
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
    return registrations
      .filter((r): r is typeof r & { team: NonNullable<typeof r.team> } => r.team !== null)
      .map((r) => ({
        id: r.team.id,
        leagueId,
        name: r.team.name,
        category: r.team.category,
        logoUrl: r.team.logoUrl,
        members: r.team.members.map((m) => ({
          userId: m.userId,
          user: { id: m.user.id, name: m.user.name, email: m.user.email },
        })),
      }));
  },

  /** Solo matches entre dos equipos. Para Americana ROTATING_INDIVIDUAL hay
   * un fetch específico que enumera `MatchParticipant` por ronda. */
  async getMatches(leagueId: string): Promise<MatchRow[]> {
    const matches = await prisma.match.findMany({
      where: { leagueId, teamAId: { not: null }, teamBId: { not: null } },
      include: {
        teamA: { select: { id: true, name: true } },
        teamB: { select: { id: true, name: true } },
      },
      orderBy: [{ round: 'asc' }, { deadlineAt: 'asc' }],
    });
    return matches
      .filter(
        (m): m is typeof m & { teamAId: string; teamBId: string; teamA: { id: string; name: string }; teamB: { id: string; name: string } } =>
          m.teamAId != null && m.teamBId != null && m.teamA != null && m.teamB != null,
      )
      .map((m) => ({
        id: m.id,
        leagueId: m.leagueId,
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        status: m.status,
        scheduledAt: m.scheduledAt,
        deadlineAt: m.deadlineAt,
        round: m.round,
        teamA: m.teamA,
        teamB: m.teamB,
      }));
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

    const requester = await prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { role: true },
    });
    const isLeagueAdmin =
      requester?.role === 'LEAGUE_ADMIN' && league.createdByUserId === requestingUserId;
    if (requester?.role !== 'SUPER_ADMIN' && !isLeagueAdmin) {
      throw new AuthorizationError('NOT_LEAGUE_ADMIN', 'Solo el admin de la liga puede activarla.');
    }

    const registeredTeams = league.registrations
      .map((r) => r.team)
      .filter((t): t is NonNullable<typeof t> => t !== null);
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
      startDate?: Date;
      endDate?: Date;
      category?: TeamCategory;
    },
  ): Promise<LeagueRow> {
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Liga no encontrada.');

    const requester = await prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { role: true },
    });
    const isLeagueAdmin =
      requester?.role === 'LEAGUE_ADMIN' && league.createdByUserId === requestingUserId;
    if (requester?.role !== 'SUPER_ADMIN' && !isLeagueAdmin) {
      throw new AuthorizationError('NOT_LEAGUE_ADMIN', 'Solo el admin de la liga puede editarla.');
    }

    if (input.name !== undefined && input.name.trim().length === 0) {
      throw new DomainError('INVALID_NAME', 'El nombre no puede estar vacío.');
    }

    const merged = {
      registrationStart: input.registrationStart ?? league.registrationStart,
      registrationEnd: input.registrationEnd ?? league.registrationEnd,
      startDate: input.startDate ?? league.startDate,
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
        ...(input.startDate !== undefined && { startDate: input.startDate }),
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
