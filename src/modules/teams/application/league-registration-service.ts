import { prisma } from '@/shared/db/client';
import {
  AuthorizationError,
  ConflictError,
  DomainError,
  NotFoundError,
} from '@/shared/errors';

export type RegistrationRow = {
  id: string;
  leagueId: string;
  teamId: string;
  registeredAt: Date;
  withdrawnAt: Date | null;
};

function isWithinRegistrationWindow(now: Date, start: Date, end: Date): boolean {
  return now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
}

async function ensureTeamMember(teamId: string, userId: string): Promise<void> {
  const member = await prisma.teamMember.findFirst({
    where: { teamId, userId },
    select: { id: true },
  });
  if (!member) {
    throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro de este equipo.');
  }
}

export const LeagueRegistrationService = {
  /**
   * Self-register the current user (no team) to a Competición tipo
   * AMERICANA ROTATING_INDIVIDUAL. Devuelve el id de la fila creada.
   */
  async registerIndividual(input: { leagueId: string; userId: string }): Promise<{ id: string }> {
    const league = await prisma.league.findUnique({ where: { id: input.leagueId } });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Competición no encontrada.');
    if (league.type !== 'AMERICANA' || league.americanaVariant !== 'ROTATING_INDIVIDUAL') {
      throw new DomainError(
        'INDIVIDUAL_REGISTRATION_NOT_ALLOWED',
        'La inscripción individual solo aplica a Americanas de rotación individual.',
      );
    }
    if (league.status !== 'DRAFT') {
      throw new DomainError('LEAGUE_NOT_DRAFT', 'La competición ya no admite inscripciones.');
    }
    if (!isWithinRegistrationWindow(new Date(), league.registrationStart, league.registrationEnd)) {
      throw new DomainError('OUT_OF_REGISTRATION_WINDOW', 'Fuera del periodo de inscripción.');
    }

    const existing = await prisma.leagueRegistration.findUnique({
      where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
    });
    if (existing && existing.withdrawnAt === null) {
      throw new ConflictError('ALREADY_REGISTERED', 'Ya estás apuntado a esta Americana.');
    }
    const reg = existing
      ? await prisma.leagueRegistration.update({
          where: { id: existing.id },
          data: {
            registeredByUserId: input.userId,
            registeredAt: new Date(),
            withdrawnAt: null,
            withdrawnByUserId: null,
          },
        })
      : await prisma.leagueRegistration.create({
          data: {
            leagueId: input.leagueId,
            userId: input.userId,
            registeredByUserId: input.userId,
          },
        });
    return { id: reg.id };
  },

  /** Da de baja la inscripción individual del usuario actual. */
  async withdrawIndividual(input: { leagueId: string; userId: string }): Promise<void> {
    const reg = await prisma.leagueRegistration.findUnique({
      where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
    });
    if (!reg || reg.withdrawnAt !== null) {
      throw new NotFoundError('REGISTRATION_NOT_FOUND', 'No estás apuntado a esta Americana.');
    }
    const league = await prisma.league.findUnique({ where: { id: input.leagueId } });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Competición no encontrada.');
    if (league.status !== 'DRAFT') {
      throw new DomainError('LEAGUE_NOT_DRAFT', 'La competición ya empezó; no se puede dar de baja.');
    }
    if (!isWithinRegistrationWindow(new Date(), league.registrationStart, league.registrationEnd)) {
      throw new DomainError('OUT_OF_REGISTRATION_WINDOW', 'Fuera del periodo de inscripción.');
    }
    await prisma.leagueRegistration.update({
      where: { id: reg.id },
      data: { withdrawnAt: new Date(), withdrawnByUserId: input.userId },
    });
  },

  /**
   * Register a team to a league.
   * Requirements:
   * - User must be a member of the team.
   * - League must be in DRAFT status.
   * - Now must be inside the registration window.
   * - Team must not already be actively registered.
   */
  async register(input: { leagueId: string; teamId: string; userId: string }): Promise<{ id: string }> {
    await ensureTeamMember(input.teamId, input.userId);

    const [league, team] = await Promise.all([
      prisma.league.findUnique({ where: { id: input.leagueId } }),
      prisma.team.findUnique({
        where: { id: input.teamId },
        include: { members: { select: { userId: true } } },
      }),
    ]);
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Liga no encontrada.');
    if (!team) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');

    if (league.status !== 'DRAFT') {
      throw new DomainError('LEAGUE_NOT_DRAFT', 'La liga ya no admite inscripciones.');
    }
    if (!isWithinRegistrationWindow(new Date(), league.registrationStart, league.registrationEnd)) {
      throw new DomainError('OUT_OF_REGISTRATION_WINDOW', 'Fuera del periodo de inscripción.');
    }
    if (team.members.length < 2) {
      throw new DomainError('TEAM_INCOMPLETE', 'El equipo necesita 2 jugadores antes de apuntarse.');
    }

    const existing = await prisma.leagueRegistration.findUnique({
      where: { leagueId_teamId: { leagueId: input.leagueId, teamId: input.teamId } },
    });
    if (existing && existing.withdrawnAt === null) {
      throw new ConflictError('ALREADY_REGISTERED', 'El equipo ya está apuntado a esta liga.');
    }

    const registration = await prisma.$transaction(async (tx) => {
      const reg = existing
        ? await tx.leagueRegistration.update({
            where: { id: existing.id },
            data: {
              registeredByUserId: input.userId,
              registeredAt: new Date(),
              withdrawnAt: null,
              withdrawnByUserId: null,
            },
          })
        : await tx.leagueRegistration.create({
            data: {
              leagueId: input.leagueId,
              teamId: input.teamId,
              registeredByUserId: input.userId,
            },
          });

      const actor = await tx.user.findUnique({
        where: { id: input.userId },
        select: { name: true },
      });
      await tx.notification.createMany({
        // El actor (quien apunta al equipo) no necesita un push de su propia
        // acción — solo el compañero de equipo que no realizó el alta.
        data: team.members
          .filter((m) => m.userId !== input.userId)
          .map((m) => ({
            userId: m.userId,
            organizationId: league.organizationId,
            type: 'LEAGUE_REGISTRATION_ADDED' as const,
            title: 'Equipo apuntado a liga',
            body: `${actor?.name ?? 'Un compañero'} ha apuntado al equipo "${team.name}" a la liga "${league.name}".`,
            metadata: { teamId: team.id, leagueId: league.id, registrationId: reg.id },
          })),
      });
      return reg;
    });
    return { id: registration.id };
  },

  /**
   * Withdraw an active registration.
   * Same checks as register: user must be a member, league must be DRAFT, now within window.
   */
  async withdraw(input: { leagueId: string; teamId: string; userId: string }): Promise<void> {
    await ensureTeamMember(input.teamId, input.userId);

    const [league, team, registration] = await Promise.all([
      prisma.league.findUnique({ where: { id: input.leagueId } }),
      prisma.team.findUnique({
        where: { id: input.teamId },
        include: { members: { select: { userId: true } } },
      }),
      prisma.leagueRegistration.findUnique({
        where: { leagueId_teamId: { leagueId: input.leagueId, teamId: input.teamId } },
      }),
    ]);
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Liga no encontrada.');
    if (!team) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');
    if (!registration || registration.withdrawnAt !== null) {
      throw new NotFoundError('REGISTRATION_NOT_FOUND', 'El equipo no está apuntado a esta liga.');
    }
    if (league.status !== 'DRAFT') {
      throw new DomainError('LEAGUE_NOT_DRAFT', 'La liga ya empezó; no se puede borrar el equipo.');
    }
    if (!isWithinRegistrationWindow(new Date(), league.registrationStart, league.registrationEnd)) {
      throw new DomainError('OUT_OF_REGISTRATION_WINDOW', 'Fuera del periodo de inscripción.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.leagueRegistration.update({
        where: { id: registration.id },
        data: { withdrawnAt: new Date(), withdrawnByUserId: input.userId },
      });
      const actor = await tx.user.findUnique({
        where: { id: input.userId },
        select: { name: true },
      });
      await tx.notification.createMany({
        // El actor que se da de baja no necesita push de su propia acción.
        data: team.members
          .filter((m) => m.userId !== input.userId)
          .map((m) => ({
            userId: m.userId,
            organizationId: league.organizationId,
            type: 'LEAGUE_REGISTRATION_REMOVED' as const,
            title: 'Equipo dado de baja',
            body: `${actor?.name ?? 'Un compañero'} ha dado de baja al equipo "${team.name}" de la liga "${league.name}".`,
            metadata: { teamId: team.id, leagueId: league.id, registrationId: registration.id },
          })),
      });
    });
  },

  /** All teams currently registered (active) in a league. */
  async listActiveTeamsForLeague(leagueId: string) {
    return prisma.leagueRegistration.findMany({
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
      orderBy: { registeredAt: 'asc' },
    });
  },

  /**
   * Returns the current registration row for a (league, team) — useful for UI to
   * decide whether to show "Apuntarse", "Apuntado", or nothing. Returns null if
   * the team has never been registered.
   */
  async findFor(leagueId: string, teamId: string) {
    return prisma.leagueRegistration.findUnique({
      where: { leagueId_teamId: { leagueId, teamId } },
    });
  },
} as const;
