import { prisma } from '@/shared/db/client';
import { NotFoundError, AuthorizationError, DomainError, ConflictError } from '@/shared/errors';
import type { TeamCategory, Prisma } from '@prisma/client';
import type { CreateLeagueInput, LeagueRow, TeamRow, MatchRow } from '../domain/types';
import { generateFixtures } from './fixture-generator';
import {
  generateRotatingIndividualAmericana,
  distributeAcrossCourts,
} from './americana-generator';
import {
  distributeIntoGroups,
  generateGroupRoundRobin,
  generateGoldBracket,
  generateSilverBracket,
} from './tournament-generator';

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
          include: {
            team: { include: { members: true } },
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Competición no encontrada.');
    if (league.status !== 'DRAFT')
      throw new DomainError('LEAGUE_NOT_DRAFT', 'La competición ya está activa o finalizada.');

    const requester = await prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { role: true },
    });
    const isLeagueAdmin =
      requester?.role === 'LEAGUE_ADMIN' && league.createdByUserId === requestingUserId;
    if (requester?.role !== 'SUPER_ADMIN' && !isLeagueAdmin) {
      throw new AuthorizationError('NOT_LEAGUE_ADMIN', 'Solo el admin de la competición puede activarla.');
    }

    // Ramificación por tipo. Cada path valida sus inscripciones y crea los
    // matches con la forma adecuada (teams o participants individuales).
    if (league.type === 'AMERICANA') {
      await activateAmericana(league);
      return;
    }
    if (league.type === 'TOURNAMENT') {
      await activateTournament(league);
      return;
    }

    // LEAGUE clásica: round-robin entre teams.
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

  /**
   * Materializa los brackets Oro + Plata de un Torneo con fase de grupos
   * ya jugada. Se llama desde una acción admin (`materializeTournamentBracketAction`)
   * cuando todas las parejas han terminado su round-robin de grupo.
   *
   * Validaciones:
   *  - league.type === 'TOURNAMENT' && hasGroupPhase
   *  - status === 'ACTIVE'
   *  - Caller es admin (createdByUserId) o SUPER_ADMIN
   *  - No existe ya bracket (no Match con bracketSide set)
   *  - Todos los matches de grupo están finalizados (CONFIRMED / ADMIN_RESOLVED /
   *    EXPIRED_UNPLAYED). Si hay PENDING_VALIDATION o partidos sin jugar, se
   *    aborta para no tomar standings inestables.
   *
   * Orden de qualifiers para `generateGoldBracket`: agrupados por posición
   * dentro del grupo (todos los 1º primero, luego todos los 2º, etc) y
   * dentro de cada nivel ordenados por groupIndex. Con linear pairing
   * (slot i vs slot N-1-i) esto cruza 1º de un grupo contra 2º del grupo
   * opuesto, evitando que dos primeros se enfrenten en primera ronda.
   */
  async materializeTournamentBracket(
    leagueId: string,
    requestingUserId: string,
  ): Promise<void> {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        groups: {
          orderBy: { index: 'asc' },
          include: {
            registrations: { include: { team: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Competición no encontrada.');
    if (league.type !== 'TOURNAMENT') {
      throw new DomainError('NOT_A_TOURNAMENT', 'Esta operación solo aplica a torneos.');
    }
    if (!league.hasGroupPhase) {
      throw new DomainError(
        'NO_GROUP_PHASE',
        'El bracket de un torneo sin fase de grupos se materializa al activarlo.',
      );
    }
    if (league.status !== 'ACTIVE') {
      throw new DomainError('LEAGUE_NOT_ACTIVE', 'El torneo debe estar activo para generar el bracket.');
    }

    const requester = await prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { role: true },
    });
    const isLeagueAdmin =
      requester?.role === 'LEAGUE_ADMIN' && league.createdByUserId === requestingUserId;
    if (requester?.role !== 'SUPER_ADMIN' && !isLeagueAdmin) {
      throw new AuthorizationError('NOT_LEAGUE_ADMIN', 'Solo el admin del torneo puede generar el bracket.');
    }

    // Bloquea doble ejecución: si ya hay matches de bracket, salir.
    const existingBracket = await prisma.match.count({
      where: { leagueId, bracketSide: { not: null } },
    });
    if (existingBracket > 0) {
      throw new DomainError('BRACKET_ALREADY_EXISTS', 'El bracket ya está generado.');
    }

    // Valida que todos los matches de grupo estén finalizados.
    const FINAL_STATUSES = ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'] as const;
    const groupMatches = await prisma.match.findMany({
      where: { leagueId, competitionGroupId: { not: null } },
      include: { confirmedResult: { include: { sets: true } } },
    });
    const unfinished = groupMatches.filter((m) => !FINAL_STATUSES.includes(m.status as (typeof FINAL_STATUSES)[number]));
    if (unfinished.length > 0) {
      throw new DomainError(
        'GROUP_PHASE_NOT_FINISHED',
        `Quedan ${unfinished.length} partidos de fase de grupos sin finalizar. No se puede generar el bracket todavía.`,
      );
    }

    if (!league.qualifiersPerGroup) {
      throw new DomainError('QUALIFIERS_MISSING', 'Falta el número de clasificados por grupo.');
    }
    const K = league.qualifiersPerGroup;

    // Standings por grupo → top K teamIds.
    // Importamos calculateStandings de forma local para evitar dependencia
    // circular en el top del archivo.
    const { calculateStandings } = await import('./standings-calculator');

    const topByGroup: string[][] = []; // topByGroup[groupIndex][rankInGroup] = teamId
    for (const group of league.groups) {
      const teamRegs = group.registrations.filter(
        (r): r is typeof r & { team: NonNullable<typeof r.team> } => r.team !== null,
      );
      const teamNames = Object.fromEntries(teamRegs.map((r) => [r.team.id, r.team.name]));
      const matchesOfGroup = groupMatches
        .filter((m) => m.competitionGroupId === group.id)
        .filter((m): m is typeof m & { teamAId: string; teamBId: string } =>
          m.teamAId != null && m.teamBId != null,
        );
      const standings = calculateStandings(
        teamNames,
        matchesOfGroup.map((m) => ({
          teamAId: m.teamAId,
          teamBId: m.teamBId,
          status: m.status as 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED',
          winnerTeamId: m.winnerTeamId,
          sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
        })),
      );
      if (standings.length < K) {
        throw new DomainError(
          'NOT_ENOUGH_TEAMS_IN_GROUP',
          `El grupo ${group.name} tiene menos de ${K} parejas. Imposible escoger ${K} clasificados.`,
        );
      }
      topByGroup.push(standings.slice(0, K).map((s) => s.teamId));
    }

    // Ordena qualifiers: nivel de clasificación (0=1º, 1=2º…) × groupIndex.
    // Con linear pairing del bracket (slot i vs slot N-1-i), 1º grupo A
    // termina cruzándose contra el último 2º (de otro grupo).
    const qualifiers: string[] = [];
    for (let k = 0; k < K; k++) {
      for (let g = 0; g < topByGroup.length; g++) {
        qualifiers.push(topByGroup[g]![k]!);
      }
    }

    const { generateGoldBracket, generateSilverBracket } = await import('./tournament-generator');
    const { matches: goldDescriptors, round0LoserSources } = generateGoldBracket(qualifiers);
    const silverDescriptors = generateSilverBracket(round0LoserSources);

    // Persistencia topológica: GOLD R0 → GOLD R1+ → SILVER R0 → SILVER R1+
    const allDescriptors = [...goldDescriptors, ...silverDescriptors].sort((a, b) => {
      if (a.side !== b.side) return a.side === 'GOLD' ? -1 : 1;
      if (a.round !== b.round) return a.round - b.round;
      return a.position - b.position;
    });

    await prisma.$transaction(async (tx) => {
      const keyToId = new Map<string, string>();
      const keyOf = (side: string, round: number, position: number) =>
        `${side}:${round}:${position}`;

      for (const d of allDescriptors) {
        const sourceAId = d.sourceA
          ? (keyToId.get(keyOf(d.sourceA.side, d.sourceA.round, d.sourceA.position)) ?? null)
          : null;
        const sourceBId = d.sourceB
          ? (keyToId.get(keyOf(d.sourceB.side, d.sourceB.round, d.sourceB.position)) ?? null)
          : null;
        const m = await tx.match.create({
          data: {
            leagueId: league.id,
            teamAId: d.teamAId,
            teamBId: d.teamBId,
            deadlineAt: league.endDate,
            bracketSide: d.side,
            bracketRound: d.round,
            bracketPosition: d.position,
            sourceMatchAId: sourceAId,
            sourceMatchBId: sourceBId,
          },
        });
        keyToId.set(keyOf(d.side, d.round, d.position), m.id);
      }
    });
  },

  /**
   * Sustituye uno de los slots iniciales (teamA o teamB) de un match del
   * bracket por otra pareja inscrita. Solo aplica a la primera ronda
   * (bracketRound=0) y solo si el match aún no se ha jugado. Las llaves
   * ya resueltas son inmutables — decisión del plan #10.
   *
   * Casos de uso:
   *  - Una pareja se baja antes de empezar el bracket; el admin la sustituye
   *    por otra ya inscrita pero que no entró al cuadro (p.ej. el "primer
   *    no-clasificado" en tournament con grupos).
   *  - Una pareja se equivocó y hay que cambiarla por la correcta antes de
   *    que jueguen su primer partido.
   *
   * Restricciones:
   *  - league.type = TOURNAMENT
   *  - Match.bracketRound = 0 y status en SCHEDULED/DATE_PROPOSED/DATE_CONFIRMED
   *  - Caller es league admin o SUPER_ADMIN
   *  - newTeam existe, tiene 2 miembros, no está ya en otro slot del bracket
   *    actual (evita duplicados en el mismo bracket).
   */
  async substituteBracketSlot(
    matchId: string,
    slot: 'A' | 'B',
    newTeamId: string,
    requestingUserId: string,
  ): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { league: { select: { id: true, type: true, createdByUserId: true } } },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.league.type !== 'TOURNAMENT') {
      throw new DomainError('NOT_A_TOURNAMENT', 'La sustitución solo aplica a torneos.');
    }
    if (match.bracketSide == null || match.bracketRound !== 0) {
      throw new DomainError(
        'NOT_INITIAL_BRACKET_SLOT',
        'Solo se pueden sustituir slots de la primera ronda del bracket.',
      );
    }
    if (
      match.status !== 'SCHEDULED' &&
      match.status !== 'DATE_PROPOSED' &&
      match.status !== 'DATE_CONFIRMED'
    ) {
      throw new DomainError(
        'MATCH_ALREADY_PLAYED',
        'No se puede sustituir un slot de un partido ya jugado o en validación.',
      );
    }

    const requester = await prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { role: true },
    });
    const isAdmin =
      requester?.role === 'SUPER_ADMIN' ||
      (requester?.role === 'LEAGUE_ADMIN' && match.league.createdByUserId === requestingUserId);
    if (!isAdmin) {
      throw new AuthorizationError('NOT_LEAGUE_ADMIN', 'Solo el admin del torneo puede sustituir slots.');
    }

    const newTeam = await prisma.team.findUnique({
      where: { id: newTeamId },
      include: { members: { select: { userId: true } } },
    });
    if (!newTeam) throw new NotFoundError('TEAM_NOT_FOUND', 'Pareja nueva no encontrada.');
    if (newTeam.members.length !== 2) {
      throw new DomainError('TEAM_SIZE_INVALID', 'La pareja nueva debe tener exactamente 2 jugadores.');
    }

    // ¿Está ya esa pareja en otro slot del bracket actual?
    const duplicate = await prisma.match.findFirst({
      where: {
        leagueId: match.league.id,
        bracketSide: { not: null },
        id: { not: matchId },
        OR: [{ teamAId: newTeamId }, { teamBId: newTeamId }],
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(
        'TEAM_ALREADY_IN_BRACKET',
        'Esa pareja ya está en otro slot del bracket.',
      );
    }

    await prisma.match.update({
      where: { id: matchId },
      data: slot === 'A' ? { teamAId: newTeamId } : { teamBId: newTeamId },
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

// Tipo del league con registrations + team + user, tal cual lo recibe el
// activate path. Lo derivamos del payload de prisma usando GetPayload.
type LeagueForActivation = Prisma.LeagueGetPayload<{
  include: {
    registrations: {
      include: {
        team: { include: { members: true } };
        user: { select: { id: true; name: true } };
      };
    };
  };
}>;

// Activación de una Americana. Ramifica según variant: ROTATING_INDIVIDUAL
// crea matches con teamA/B null + MatchParticipant por jugador; FIXED_PAIRS
// reusa el round-robin de generateFixtures y reparte en pistas.
async function activateAmericana(league: LeagueForActivation): Promise<void> {
  if (!league.americanaVariant) {
    throw new DomainError('AMERICANA_VARIANT_MISSING', 'Falta la variante de la Americana.');
  }
  const courts = league.americanaCourts ?? 1;

  if (league.americanaVariant === 'ROTATING_INDIVIDUAL') {
    // Inscripciones por usuario (userId set, teamId null).
    const userIds = league.registrations
      .filter((r) => r.userId != null)
      .map((r) => r.userId!);
    if (userIds.length < 4) {
      throw new DomainError(
        'NOT_ENOUGH_PLAYERS',
        'La Americana necesita al menos 4 jugadores apuntados para activarse.',
      );
    }
    if (userIds.length > 16) {
      throw new DomainError(
        'TOO_MANY_PLAYERS',
        'La Americana admite como máximo 16 jugadores.',
      );
    }

    const fixtures = generateRotatingIndividualAmericana(userIds, courts);

    await prisma.$transaction(async (tx) => {
      const existingCount = await tx.match.count({ where: { leagueId: league.id } });
      if (existingCount > 0) {
        await tx.league.update({ where: { id: league.id }, data: { status: 'ACTIVE' } });
        return; // idempotente: si ya hay matches no regeneramos.
      }
      // Las Americanas son evento de un día; el deadline de cada match es el
      // mismo startDate (cuando termine la jornada). Esto evita que el
      // auto-approve de +7d se dispare a destiempo.
      const deadlineAt = league.startDate;
      for (const f of fixtures) {
        const match = await tx.match.create({
          data: {
            leagueId: league.id,
            teamAId: null,
            teamBId: null,
            deadlineAt,
            americanaRound: f.round,
            americanaCourt: f.court,
          },
        });
        await tx.matchParticipant.createMany({
          data: [
            { matchId: match.id, userId: f.sideAUsers[0], side: 'A', partnerIndex: 1 },
            { matchId: match.id, userId: f.sideAUsers[1], side: 'A', partnerIndex: 2 },
            { matchId: match.id, userId: f.sideBUsers[0], side: 'B', partnerIndex: 1 },
            { matchId: match.id, userId: f.sideBUsers[1], side: 'B', partnerIndex: 2 },
          ],
        });
      }
      await tx.league.update({ where: { id: league.id }, data: { status: 'ACTIVE' } });
    });
    return;
  }

  // FIXED_PAIRS: round-robin entre Teams + distribución en pistas.
  const teams = league.registrations
    .map((r) => r.team)
    .filter((t): t is NonNullable<typeof t> => t !== null);
  if (teams.length < 2) {
    throw new DomainError(
      'NOT_ENOUGH_TEAMS',
      'La Americana de parejas necesita al menos 2 parejas para activarse.',
    );
  }
  const wrongSize = teams.filter((t) => t.members.length !== 2);
  if (wrongSize.length > 0) {
    const names = wrongSize.map((t) => t.name).join(', ');
    throw new DomainError(
      'TEAM_SIZE_INVALID',
      `Las siguientes parejas no tienen exactamente 2 jugadores: ${names}.`,
    );
  }

  const baseFixtures = generateFixtures(teams.map((t) => t.id), league.startDate, 0);
  const distributed = distributeAcrossCourts(
    baseFixtures.map((f) => ({ round: f.round, teamAId: f.teamAId, teamBId: f.teamBId })),
    courts,
  );

  await prisma.$transaction(async (tx) => {
    const existingCount = await tx.match.count({ where: { leagueId: league.id } });
    if (existingCount > 0) {
      await tx.league.update({ where: { id: league.id }, data: { status: 'ACTIVE' } });
      return;
    }
    await tx.match.createMany({
      data: distributed.map((f) => ({
        leagueId: league.id,
        teamAId: f.teamAId,
        teamBId: f.teamBId,
        deadlineAt: league.startDate,
        americanaRound: f.round,
        americanaCourt: f.court,
      })),
    });
    await tx.league.update({ where: { id: league.id }, data: { status: 'ACTIVE' } });
  });
}

// Activación de un Torneo. Dos caminos:
//  - hasGroupPhase = false: bracket Oro + Plata directos desde la lista de
//    inscritos. Cada match del bracket se crea con sus referencias
//    `sourceMatchAId/BId` ya resueltas a IDs reales.
//  - hasGroupPhase = true: solo creamos los matches de la fase de grupos +
//    las filas `CompetitionGroup`. El bracket se materializa más adelante
//    (función `materializeTournamentBracket`, llamada por el admin cuando
//    cierre la fase de grupos — añadible en una iteración posterior).
async function activateTournament(league: LeagueForActivation): Promise<void> {
  const teams = league.registrations
    .map((r) => r.team)
    .filter((t): t is NonNullable<typeof t> => t !== null);
  if (teams.length < 2) {
    throw new DomainError(
      'NOT_ENOUGH_TEAMS',
      'El torneo necesita al menos 2 parejas para activarse.',
    );
  }
  const wrongSize = teams.filter((t) => t.members.length !== 2);
  if (wrongSize.length > 0) {
    const names = wrongSize.map((t) => t.name).join(', ');
    throw new DomainError(
      'TEAM_SIZE_INVALID',
      `Las siguientes parejas no tienen exactamente 2 jugadores: ${names}.`,
    );
  }

  const teamIds = teams.map((t) => t.id);

  await prisma.$transaction(async (tx) => {
    const existingCount = await tx.match.count({ where: { leagueId: league.id } });
    if (existingCount > 0) {
      await tx.league.update({ where: { id: league.id }, data: { status: 'ACTIVE' } });
      return;
    }

    if (league.hasGroupPhase) {
      if (!league.groupCount || !league.teamsPerGroup) {
        throw new DomainError(
          'GROUP_CONFIG_REQUIRED',
          'Falta configuración de grupos para activar el torneo.',
        );
      }
      const distributed = distributeIntoGroups(teamIds, league.groupCount, league.teamsPerGroup);
      // Crear CompetitionGroup rows.
      const groupRows: { id: string; index: number }[] = [];
      for (let i = 0; i < distributed.length; i++) {
        const g = await tx.competitionGroup.create({
          data: {
            leagueId: league.id,
            name: `Grupo ${String.fromCharCode(65 + i)}`,
            index: i,
          },
        });
        groupRows.push({ id: g.id, index: i });
      }
      // Asignar cada registration a su grupo + crear matches.
      for (let i = 0; i < distributed.length; i++) {
        const groupId = groupRows[i]!.id;
        const teamsInGroup = distributed[i]!;
        await tx.leagueRegistration.updateMany({
          where: { leagueId: league.id, teamId: { in: teamsInGroup } },
          data: { competitionGroupId: groupId },
        });
        const fixtures = generateGroupRoundRobin(i, teamsInGroup);
        if (fixtures.length > 0) {
          await tx.match.createMany({
            data: fixtures.map((f) => ({
              leagueId: league.id,
              teamAId: f.teamAId,
              teamBId: f.teamBId,
              deadlineAt: league.endDate,
              competitionGroupId: groupId,
              round: f.round,
            })),
          });
        }
      }
    } else {
      // Sin fase de grupos: bracket directo desde los inscritos en orden de
      // registro (AUTO seeding por defecto; MANUAL queda como follow-up).
      const { matches: goldDescriptors, round0LoserSources } = generateGoldBracket(teamIds);
      const silverDescriptors = generateSilverBracket(round0LoserSources);

      // Persistencia en orden topológico: GOLD R0, GOLD R1+, SILVER R0, SILVER R1+
      // de modo que cuando llegamos a un descriptor con sourceA/sourceB, el
      // match referenciado ya existe y tenemos su id.
      const allDescriptors = [...goldDescriptors, ...silverDescriptors].sort((a, b) => {
        if (a.side !== b.side) return a.side === 'GOLD' ? -1 : 1;
        if (a.round !== b.round) return a.round - b.round;
        return a.position - b.position;
      });

      const keyToId = new Map<string, string>();
      const keyOf = (side: string, round: number, position: number) =>
        `${side}:${round}:${position}`;

      for (const d of allDescriptors) {
        const sourceAId = d.sourceA
          ? (keyToId.get(keyOf(d.sourceA.side, d.sourceA.round, d.sourceA.position)) ?? null)
          : null;
        const sourceBId = d.sourceB
          ? (keyToId.get(keyOf(d.sourceB.side, d.sourceB.round, d.sourceB.position)) ?? null)
          : null;
        const m = await tx.match.create({
          data: {
            leagueId: league.id,
            teamAId: d.teamAId,
            teamBId: d.teamBId,
            deadlineAt: league.endDate,
            bracketSide: d.side,
            bracketRound: d.round,
            bracketPosition: d.position,
            sourceMatchAId: sourceAId,
            sourceMatchBId: sourceBId,
          },
        });
        keyToId.set(keyOf(d.side, d.round, d.position), m.id);
      }
    }

    await tx.league.update({ where: { id: league.id }, data: { status: 'ACTIVE' } });
  });
}
