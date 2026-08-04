import { prisma } from '@/shared/db/client';
import {
  NotFoundError,
  AuthorizationError,
  DomainError,
  ConflictError,
} from '@/shared/errors';
import { NotificationService } from '@/modules/notifications';
import { SignedTokenService, SignedTokenPurpose } from '@/shared/auth/signed-tokens';
import { queue } from '@/shared/queue/client';
import { scheduleEmailFlush } from '@/shared/queue/email';
import { env } from '@/shared/config/env';
import type {
  CreateOpenMatchInput,
  IndependentMatchDetail,
  IndependentMatchRow,
} from '../domain/types';


const MATCH_DETAIL_INCLUDE = {
  organizer: { select: { id: true, name: true } },
  hostTeam: { select: { id: true, name: true, logoUrl: true } },
  league: { select: { id: true, name: true, slug: true } },
  participants: {
    where: { status: 'ACCEPTED' as const },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  },
  invitations: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      invitedUser: { select: { id: true, name: true } },
      invitedTeam: { select: { id: true, name: true, logoUrl: true } },
    },
  },
} as const;

export function calculateAvailableSlots(maxPlayers: number, confirmedCount: number): number {
  return Math.max(0, maxPlayers - confirmedCount);
}

/** True if the match has a scheduledAt in the past (i.e. already happened). */
export function isMatchPast(match: { scheduledAt?: Date | null }): boolean {
  // Use `!= null` so both undefined (test mocks) and null (no date set) skip
  // the past check without crashing on .getTime().
  return match.scheduledAt != null && match.scheduledAt.getTime() < Date.now();
}

function assertMatchNotPast(match: { scheduledAt?: Date | null; name: string }): void {
  if (isMatchPast(match)) {
    throw new DomainError('MATCH_PAST', `"${match.name}" ya ha pasado y no admite cambios.`);
  }
}

export const IndependentMatchService = {
  async createOpen(input: CreateOpenMatchInput): Promise<IndependentMatchRow> {
    // Host-team validation up-front, outside the TX, to give a fast error path.
    let hostTeamMembers: { userId: string }[] = [];
    if (input.hostTeamId) {
      if (input.maxPlayers !== 4)
        throw new DomainError('TEAM_HOST_REQUIRES_4', 'Un partido como equipo debe tener 4 jugadores.');
      const team = await prisma.team.findUnique({
        where: { id: input.hostTeamId },
        include: { members: { select: { userId: true } } },
      });
      if (!team)
        throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo organizador no encontrado.');
      if (!team.members.some((m) => m.userId === input.organizerId))
        throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro del equipo organizador.');
      hostTeamMembers = team.members;
    }

    const match = await prisma.$transaction(async (tx) => {
      const m = await tx.independentMatch.create({
        data: {
          organizerId: input.organizerId,
          organizationId: input.organizationId ?? null,
          name: input.name,
          visibility: input.visibility,
          hostTeamId: input.hostTeamId ?? null,
          scheduledAt: input.scheduledAt ?? null,
          location: input.location ?? null,
          description: input.description ?? null,
          maxPlayers: input.maxPlayers,
        },
      });

      const seedUserIds = input.hostTeamId
        ? hostTeamMembers.map((mem) => mem.userId)
        : [input.organizerId];

      await tx.independentMatchParticipant.createMany({
        data: seedUserIds.map((userId) => ({
          independentMatchId: m.id,
          userId,
          status: 'ACCEPTED' as const,
        })),
        skipDuplicates: true,
      });

      return m;
    });
    return match;
  },

  /** `organizationId` is a REQUIRED tenant scope (`null` = public platform). */
  async listOpen(
    organizationId: string | null,
  ): Promise<(IndependentMatchRow & { confirmedCount: number })[]> {
    const now = new Date();
    const matches = await prisma.independentMatch.findMany({
      where: {
        organizationId,
        status: 'OPEN',
        visibility: 'PUBLIC',
        // Hide matches whose scheduled time has passed. Matches without a date
        // stay visible until cancelled.
        OR: [{ scheduledAt: null }, { scheduledAt: { gt: now } }],
      },
      include: { _count: { select: { participants: { where: { status: 'ACCEPTED' } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return matches.map((m) => ({
      ...m,
      confirmedCount: m._count.participants,
    }));
  },

  async getForUser(userId: string, organizationId: string | null): Promise<IndependentMatchRow[]> {
    return prisma.independentMatch.findMany({
      where: {
        organizationId,
        status: { notIn: ['CANCELLED', 'REJECTED'] },
        OR: [
          { organizerId: userId },
          { participants: { some: { userId, status: 'ACCEPTED' } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getPendingInvitationsForUser(
    userId: string,
    organizationId: string | null,
  ): Promise<IndependentMatchRow[]> {
    const memberRows = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const userTeamIds = memberRows.map((m) => m.teamId);

    const matches = await prisma.independentMatch.findMany({
      where: {
        organizationId,
        status: 'OPEN',
        invitations: {
          some: {
            acceptedAt: null,
            expiresAt: { gt: new Date() },
            OR: [
              { invitedUserId: userId },
              ...(userTeamIds.length > 0 ? [{ invitedTeamId: { in: userTeamIds } }] : []),
            ],
          },
        },
        NOT: {
          OR: [
            { organizerId: userId },
            { participants: { some: { userId, status: 'ACCEPTED' } } },
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return matches;
  },

  /**
   * `organizationId` is a REQUIRED tenant scope (`null` = public platform).
   * A match id is guessable-ish and appears in shared links, so a cross-tenant
   * read has to 404 rather than render.
   */
  async getById(id: string, organizationId: string | null): Promise<IndependentMatchDetail> {
    const match = await prisma.independentMatch.findUnique({
      where: { id },
      include: MATCH_DETAIL_INCLUDE,
    });
    if (!match || match.organizationId !== organizationId) {
      throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    }
    return match as IndependentMatchDetail;
  },

  async inviteByEmail(
    matchId: string,
    organizerId: string,
    email: string,
  ): Promise<{ invitationId: string; isNew: boolean }> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: { participants: { where: { status: 'ACCEPTED' } } },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede invitar.');
    if (match.status !== 'OPEN')
      throw new DomainError('MATCH_NOT_INVITABLE', 'No se puede invitar a este partido.');
    assertMatchNotPast(match);
    if (calculateAvailableSlots(match.maxPlayers, match.participants.length) === 0)
      throw new DomainError('MATCH_FULL', 'El partido ya está completo.');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const existing = await prisma.independentMatchInvitation.findUnique({
      where: { matchId_email: { matchId, email } },
    });

    if (existing && !existing.acceptedAt && existing.expiresAt > new Date()) {
      return { invitationId: existing.id, isNew: false };
    }

    const invitation = existing
      ? await prisma.independentMatchInvitation.update({
          where: { id: existing.id },
          data: { expiresAt, acceptedAt: null },
        })
      : await prisma.independentMatchInvitation.create({
          data: { matchId, email, expiresAt },
        });

    return { invitationId: invitation.id, isNew: true };
  },

  async inviteUser(
    matchId: string,
    organizerId: string,
    invitedUserId: string,
  ): Promise<{ invitationId: string; isNew: boolean }> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: { participants: { where: { status: 'ACCEPTED' } } },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede invitar.');
    if (match.status !== 'OPEN')
      throw new DomainError('MATCH_NOT_INVITABLE', 'No se puede invitar a este partido.');
    assertMatchNotPast(match);
    if (calculateAvailableSlots(match.maxPlayers, match.participants.length) === 0)
      throw new DomainError('MATCH_FULL', 'El partido ya está completo.');
    if (invitedUserId === organizerId)
      throw new DomainError('CANNOT_INVITE_SELF', 'No puedes invitarte a ti mismo.');
    if (match.participants.some((p) => p.userId === invitedUserId))
      throw new ConflictError('ALREADY_PARTICIPANT', 'Esa persona ya está en el partido.');

    const invitee = await prisma.user.findUnique({
      where: { id: invitedUserId },
      select: { id: true, deletedAt: true },
    });
    if (!invitee || invitee.deletedAt !== null)
      throw new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado.');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const existing = await prisma.independentMatchInvitation.findUnique({
      where: { matchId_invitedUserId: { matchId, invitedUserId } },
    });

    if (existing && !existing.acceptedAt && existing.expiresAt > new Date()) {
      return { invitationId: existing.id, isNew: false };
    }

    const invitation = existing
      ? await prisma.independentMatchInvitation.update({
          where: { id: existing.id },
          data: { expiresAt, acceptedAt: null },
        })
      : await prisma.independentMatchInvitation.create({
          data: { matchId, invitedUserId, expiresAt },
        });

    return { invitationId: invitation.id, isNew: true };
  },

  async inviteTeam(
    matchId: string,
    organizerId: string,
    invitedTeamId: string,
  ): Promise<{ invitationId: string; isNew: boolean }> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: { participants: { where: { status: 'ACCEPTED' } } },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede invitar.');
    if (match.status !== 'OPEN')
      throw new DomainError('MATCH_NOT_INVITABLE', 'No se puede invitar a este partido.');
    assertMatchNotPast(match);
    if (calculateAvailableSlots(match.maxPlayers, match.participants.length) < 2)
      throw new DomainError('NOT_ENOUGH_SLOTS_FOR_TEAM', 'No quedan dos huecos libres para invitar a un equipo.');
    if (match.hostTeamId === invitedTeamId)
      throw new DomainError('CANNOT_INVITE_OWN_TEAM', 'No puedes invitar a tu propio equipo.');

    const team = await prisma.team.findUnique({
      where: { id: invitedTeamId },
      include: { members: { select: { userId: true } } },
    });
    if (!team) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // Use findUnique against the (matchId, invitedTeamId) composite uniq index
    // (imi_match_team_uniq). findFirst worked but is misleading vs. the schema.
    const existing = await prisma.independentMatchInvitation.findUnique({
      where: { matchId_invitedTeamId: { matchId, invitedTeamId } },
    });

    if (existing && !existing.acceptedAt && existing.expiresAt > new Date()) {
      return { invitationId: existing.id, isNew: false };
    }

    const invitation = existing
      ? await prisma.independentMatchInvitation.update({
          where: { id: existing.id },
          data: { expiresAt, acceptedAt: null },
        })
      : await prisma.independentMatchInvitation.create({
          data: { matchId, invitedTeamId, expiresAt },
        });

    return { invitationId: invitation.id, isNew: true };
  },

  async cancelInvitation(matchId: string, invitationId: string, organizerId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      select: { organizerId: true },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede cancelar invitaciones.');

    const invitation = await prisma.independentMatchInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, matchId: true, acceptedAt: true },
    });
    if (!invitation) throw new NotFoundError('INVITATION_NOT_FOUND', 'Invitación no encontrada.');
    if (invitation.matchId !== matchId)
      throw new DomainError('INVITATION_MISMATCH', 'La invitación no pertenece a este partido.');
    if (invitation.acceptedAt)
      throw new DomainError('INVITATION_ALREADY_ACCEPTED', 'Esta invitación ya fue aceptada.');

    await prisma.independentMatchInvitation.delete({ where: { id: invitationId } });
  },

  async acceptInvitation(token: string, userId: string): Promise<string> {
    const { subjectId } = await SignedTokenService.consume(token, SignedTokenPurpose.INDEPENDENT_MATCH_INVITE);
    return acceptInvitationById(subjectId, userId);
  },

  async acceptPendingInvitationByMatchId(matchId: string, userId: string): Promise<string> {
    const invitation = await findPendingInvitationForUser(matchId, userId);
    if (!invitation) throw new NotFoundError('INVITATION_NOT_FOUND', 'No tienes invitación pendiente para este partido.');
    return acceptInvitationById(invitation.id, userId);
  },

  async rejectPendingInvitationByMatchId(matchId: string, userId: string): Promise<void> {
    // Pull the match first so we can refuse rejections on past matches —
    // consistent with cancelMatch / leaveMatch / accept which all assert
    // !matchPast for defense-in-depth.
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      select: { scheduledAt: true, name: true },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    assertMatchNotPast(match);

    const invitation = await findPendingInvitationForUser(matchId, userId);
    if (!invitation) throw new NotFoundError('INVITATION_NOT_FOUND', 'No tienes invitación pendiente para este partido.');
    await prisma.independentMatchInvitation.delete({ where: { id: invitation.id } });
  },

  async _acceptInvitationByIdLegacy(invitationId: string, userId: string): Promise<string> {
    const invitation = await prisma.independentMatchInvitation.findUnique({
      where: { id: invitationId },
      include: {
        match: { include: { participants: { where: { status: 'ACCEPTED' } } } },
        invitedTeam: { include: { members: { select: { userId: true } } } },
      },
    });
    if (!invitation) throw new NotFoundError('INVITATION_NOT_FOUND', 'Invitación no encontrada.');
    if (invitation.acceptedAt) throw new DomainError('ALREADY_ACCEPTED', 'Esta invitación ya fue usada.');

    const { match } = invitation;
    if (match.status === 'CANCELLED') throw new DomainError('MATCH_CANCELLED', 'Este partido fue cancelado.');
    if (match.status === 'CONFIRMED')
      throw new DomainError('MATCH_CONFIRMED', 'Este partido ya está confirmado y completo.');
    assertMatchNotPast(match);

    // Branch on invitation kind.
    if (invitation.invitedTeamId !== null) {
      if (!invitation.invitedTeam)
        throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo invitado no encontrado.');
      const isMember = invitation.invitedTeam.members.some((m) => m.userId === userId);
      if (!isMember)
        throw new AuthorizationError('NOT_INVITEE', 'Esta invitación es para un equipo del que no formas parte.');

      const teamUserIds = invitation.invitedTeam.members.map((m) => m.userId);

      await prisma.$transaction(async (tx) => {
        // Fresh read inside the TX for race-safety. `match.participants` loaded
        // outside the TX may be stale if someone joined between the two reads.
        const currentParticipants = await tx.independentMatchParticipant.findMany({
          where: { independentMatchId: match.id, status: 'ACCEPTED' },
          select: { userId: true },
        });
        const currentIds = new Set(currentParticipants.map((p) => p.userId));
        const newcomers = teamUserIds.filter((uid) => !currentIds.has(uid));

        if (currentIds.size + newcomers.length > match.maxPlayers)
          throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

        await tx.independentMatchInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });

        if (newcomers.length > 0) {
          await tx.independentMatchParticipant.createMany({
            data: newcomers.map((uid) => ({
              independentMatchId: match.id,
              userId: uid,
              status: 'ACCEPTED' as const,
            })),
            skipDuplicates: true,
          });
        }

        const totalAfter = currentIds.size + newcomers.length;
        if (totalAfter >= match.maxPlayers) {
          await tx.independentMatch.update({ where: { id: match.id }, data: { status: 'CONFIRMED' } });
        }
      });

      NotificationService.create(
        {
          userId: match.organizerId,
          type: 'INDEPENDENT_MATCH_CONFIRMED',
          title: 'Equipo aceptó tu invitación',
          body: `${invitation.invitedTeam.name} se unió a "${match.name}".`,
          metadata: { matchId: match.id },
        },
        { excludeActorId: userId, scope: { independentMatchId: match.id } },
      ).catch(() => undefined);

      return match.id;
    }

    // User-targeted invitation (existing behaviour).
    if (invitation.invitedUserId !== null && invitation.invitedUserId !== userId) {
      throw new AuthorizationError('NOT_INVITEE', 'Esta invitación no es para ti.');
    }

    if (calculateAvailableSlots(match.maxPlayers, match.participants.length) === 0)
      throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

    const alreadyParticipant = match.participants.some((p) => p.userId === userId);
    if (alreadyParticipant) {
      await prisma.independentMatchInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return match.id;
    }

    await prisma.$transaction(async (tx) => {
      const confirmedCount = await tx.independentMatchParticipant.count({
        where: { independentMatchId: match.id, status: 'ACCEPTED' },
      });
      if (confirmedCount >= match.maxPlayers)
        throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

      const isFull = confirmedCount + 1 >= match.maxPlayers;

      await tx.independentMatchInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      await tx.independentMatchParticipant.upsert({
        where: { independentMatchId_userId: { independentMatchId: match.id, userId } },
        create: { independentMatchId: match.id, userId, status: 'ACCEPTED' },
        update: { status: 'ACCEPTED' },
      });
      if (isFull) {
        await tx.independentMatch.update({ where: { id: match.id }, data: { status: 'CONFIRMED' } });
      }
    });

    NotificationService.create(
      {
        userId: match.organizerId,
        type: 'INDEPENDENT_MATCH_CONFIRMED',
        title: 'Alguien aceptó tu invitación',
        body: `Un jugador se unió a "${match.name}".`,
        metadata: { matchId: match.id },
      },
      { excludeActorId: userId, scope: { independentMatchId: match.id } },
    ).catch(() => undefined);

    return match.id;
  },

  async joinPublicMatch(matchId: string, userId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: { participants: { where: { status: 'ACCEPTED' } } },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.visibility !== 'PUBLIC')
      throw new DomainError('NOT_PUBLIC', 'Este partido no es público.');
    if (match.status === 'CANCELLED')
      throw new DomainError('MATCH_CANCELLED', 'Este partido fue cancelado.');
    assertMatchNotPast(match);

    if (match.participants.some((p) => p.userId === userId)) return; // idempotent

    await prisma.$transaction(async (tx) => {
      const confirmedCount = await tx.independentMatchParticipant.count({
        where: { independentMatchId: match.id, status: 'ACCEPTED' },
      });
      if (confirmedCount >= match.maxPlayers)
        throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

      const isFull = confirmedCount + 1 >= match.maxPlayers;

      await tx.independentMatchParticipant.upsert({
        where: { independentMatchId_userId: { independentMatchId: match.id, userId } },
        create: { independentMatchId: match.id, userId, status: 'ACCEPTED' },
        update: { status: 'ACCEPTED' },
      });
      if (isFull) {
        await tx.independentMatch.update({ where: { id: match.id }, data: { status: 'CONFIRMED' } });
      }
    });

    NotificationService.create(
      {
        userId: match.organizerId,
        type: 'INDEPENDENT_MATCH_CONFIRMED',
        title: 'Alguien se unió a tu partido',
        body: `Un jugador se unió a "${match.name}".`,
        metadata: { matchId: match.id },
      },
      { excludeActorId: userId, scope: { independentMatchId: match.id } },
    ).catch(() => undefined);
  },

  async cancelMatch(matchId: string, organizerId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: {
        participants: {
          where: { status: 'ACCEPTED' },
          include: { user: { select: { id: true, email: true, name: true } } },
        },
        organizer: { select: { name: true } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede cancelar el partido.');
    if (match.status === 'CANCELLED')
      throw new DomainError('ALREADY_CANCELLED', 'El partido ya está cancelado.');
    assertMatchNotPast(match);

    await prisma.independentMatch.update({
      where: { id: matchId },
      data: { status: 'CANCELLED' },
    });

    const others = match.participants
      .map((p) => p.user)
      .filter((u) => u.id !== organizerId);

    if (others.length === 0) return;

    NotificationService.createMany(
      others.map((u) => ({
        userId: u.id,
        type: 'INDEPENDENT_MATCH_CANCELLED' as const,
        title: 'Partido cancelado',
        body: `${match.organizer.name} ha cancelado el partido "${match.name}".`,
        metadata: { matchId },
      })),
      { excludeActorId: organizerId, scope: { independentMatchId: matchId } },
    ).catch(() => undefined);

    void notifyParticipantsByEmail(others, {
      kind: 'cancelled',
      matchId,
      matchName: match.name,
      headline: 'Partido cancelado',
      body: `${match.organizer.name} ha cancelado el partido "${match.name}".`,
      dedupKeyBase: `ind-cancelled-${matchId}`,
    });
  },

  async listChatMessages(
    matchId: string,
    userId: string,
  ): Promise<
    Array<{
      id: string;
      userId: string;
      userName: string;
      avatarUrl: string | null;
      content: string;
      createdAt: Date;
    }>
  > {
    const allowed = await canAccessChat(matchId, userId);
    if (!allowed) {
      throw new AuthorizationError('NOT_CHAT_MEMBER', 'No tienes acceso al chat de este partido.');
    }
    const rows = await prisma.independentMatchChatMessage.findMany({
      where: { matchId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      userId: m.user.id,
      userName: m.user.name,
      avatarUrl: m.user.avatarUrl,
      content: m.content,
      createdAt: m.createdAt,
    }));
  },

  async postChatMessage(matchId: string, userId: string, content: string): Promise<void> {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new DomainError('EMPTY_MESSAGE', 'El mensaje no puede estar vacío.');
    }
    if (trimmed.length > 2000) {
      throw new DomainError('MESSAGE_TOO_LONG', 'Máximo 2000 caracteres.');
    }
    const allowed = await canAccessChat(matchId, userId);
    if (!allowed) {
      throw new AuthorizationError('NOT_CHAT_MEMBER', 'No tienes acceso al chat de este partido.');
    }

    const match = await prisma.independentMatch.findUniqueOrThrow({
      where: { id: matchId },
      select: { name: true },
    });
    const author = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true },
    });

    await prisma.independentMatchChatMessage.create({
      data: { matchId, userId, content: trimmed },
    });

    // Notify everyone with chat access except the author. We compute that set
    // using the same predicate as canAccessChat: organizer + accepted
    // participants + pending invitees (direct or via team).
    const recipients = await chatRecipientUserIds(matchId);
    const otherIds = [...recipients].filter((uid) => uid !== userId);
    if (otherIds.length === 0) return;

    const preview = trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
    NotificationService.createMany(
      otherIds.map((uid) => ({
        userId: uid,
        type: 'INDEPENDENT_MATCH_CHAT' as const,
        title: `${author.name} en "${match.name}"`,
        body: preview,
        metadata: { matchId },
      })),
      { excludeActorId: userId, scope: { independentMatchId: matchId } },
    ).catch(() => undefined);
  },

  async updateScheduledAt(
    matchId: string,
    organizerId: string,
    scheduledAt: Date | null,
  ): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: {
        participants: {
          where: { status: 'ACCEPTED' },
          include: { user: { select: { id: true, email: true, name: true } } },
        },
        organizer: { select: { name: true } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.organizerId !== organizerId) {
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede editar la fecha.');
    }
    if (match.status === 'CANCELLED') {
      throw new DomainError('MATCH_CANCELLED', 'Este partido fue cancelado.');
    }
    if (scheduledAt && scheduledAt.getTime() < Date.now()) {
      throw new DomainError('DATE_IN_PAST', 'La nueva fecha no puede estar en el pasado.');
    }

    // Skip if value is unchanged.
    const previous = match.scheduledAt?.getTime() ?? null;
    const next = scheduledAt?.getTime() ?? null;
    if (previous === next) return;

    await prisma.independentMatch.update({
      where: { id: matchId },
      data: { scheduledAt },
    });

    const others = match.participants
      .map((p) => p.user)
      .filter((u) => u.id !== organizerId);
    if (others.length === 0) return;

    const formatted = scheduledAt
      ? new Intl.DateTimeFormat('es-ES', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
          timeZone: 'Europe/Madrid',
        }).format(scheduledAt)
      : null;
    const headline = scheduledAt ? 'Nueva fecha del partido' : 'Fecha del partido por definir';
    const body = scheduledAt
      ? `${match.organizer.name} ha programado "${match.name}" para ${formatted}.`
      : `${match.organizer.name} ha dejado "${match.name}" abierto a fechas.`;

    NotificationService.createMany(
      others.map((u) => ({
        userId: u.id,
        type: 'INDEPENDENT_MATCH_DATE_CHANGED' as const,
        title: headline,
        body,
        metadata: { matchId },
      })),
      { excludeActorId: organizerId, scope: { independentMatchId: matchId } },
    ).catch(() => undefined);

    void notifyParticipantsByEmail(others, {
      kind: 'left',
      matchId,
      matchName: match.name,
      headline,
      body,
      dedupKeyBase: `ind-date-${matchId}-${next ?? 'open'}`,
    });
  },

  async leaveMatch(matchId: string, userId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: {
        participants: {
          where: { status: 'ACCEPTED' },
          include: { user: { select: { id: true, email: true, name: true } } },
        },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.status === 'CANCELLED')
      throw new DomainError('MATCH_CANCELLED', 'Este partido fue cancelado.');
    if (match.organizerId === userId)
      throw new DomainError('ORGANIZER_CANNOT_LEAVE', 'Como organizador, debes cancelar el partido en lugar de bajarte.');
    assertMatchNotPast(match);

    const leaver = match.participants.find((p) => p.userId === userId);
    if (!leaver)
      throw new DomainError('NOT_PARTICIPANT', 'No estás apuntado a este partido.');

    await prisma.$transaction(async (tx) => {
      await tx.independentMatchParticipant.delete({
        where: { independentMatchId_userId: { independentMatchId: matchId, userId } },
      });
      // If the match was full (CONFIRMED) and now has free slots, revert to OPEN
      // so others can join again.
      if (match.status === 'CONFIRMED') {
        await tx.independentMatch.update({
          where: { id: matchId },
          data: { status: 'OPEN' },
        });
      }
    });

    const others = match.participants
      .map((p) => p.user)
      .filter((u) => u.id !== userId);
    if (others.length === 0) return;

    const headline = `${leaver.user.name} se ha bajado del partido`;
    const body = `${leaver.user.name} ya no jugará "${match.name}".`;

    NotificationService.createMany(
      others.map((u) => ({
        userId: u.id,
        type: 'INDEPENDENT_MATCH_CANCELLED' as const,
        title: headline,
        body,
        metadata: { matchId },
      })),
      { excludeActorId: userId, scope: { independentMatchId: matchId } },
    ).catch(() => undefined);

    void notifyParticipantsByEmail(others, {
      kind: 'left',
      matchId,
      matchName: match.name,
      headline,
      body,
      dedupKeyBase: `ind-left-${matchId}-${userId}-${Date.now()}`,
    });
  },
} as const;

// Free helpers below — function declarations get hoisted so the service
// methods above can reference them by name. They're not exported because
// only the service's public surface is meant to be consumed.

async function acceptInvitationById(invitationId: string, userId: string): Promise<string> {
  return IndependentMatchService._acceptInvitationByIdLegacy(invitationId, userId);
}

async function notifyParticipantsByEmail(
  recipients: { id: string; email: string; name: string }[],
  args: {
    kind: 'cancelled' | 'left';
    matchId: string;
    matchName: string;
    headline: string;
    body: string;
    dedupKeyBase: string;
  },
): Promise<void> {
  const matchUrl = `${env().APP_URL}/jugar/${args.matchId}`;
  const q = queue();
  await q.start();
  await Promise.all(
    recipients
      .filter((r) => Boolean(r.email))
      .map((r) =>
        q.publish('send-email', {
          template: 'ind-match-update',
          to: r.email,
          data: {
            kind: args.kind,
            matchName: args.matchName,
            headline: args.headline,
            body: args.body,
            matchUrl,
          },
          dedupKey: `${args.dedupKeyBase}-${r.id}`,
        }),
      ),
  );
  scheduleEmailFlush();
}

/**
 * Chat access policy: organizer + ACCEPTED participants + invitees with a
 * pending non-expired invitation (direct or via team membership).
 */
async function canAccessChat(matchId: string, userId: string): Promise<boolean> {
  const match = await prisma.independentMatch.findUnique({
    where: { id: matchId },
    select: { organizerId: true },
  });
  if (!match) return false;
  if (match.organizerId === userId) return true;

  const participating = await prisma.independentMatchParticipant.findFirst({
    where: { independentMatchId: matchId, userId, status: 'ACCEPTED' },
    select: { id: true },
  });
  if (participating) return true;

  const pending = await findPendingInvitationForUser(matchId, userId);
  return !!pending;
}

/** Userids of every chat-enabled user (organizer + participants + pending invitees). */
async function chatRecipientUserIds(matchId: string): Promise<Set<string>> {
  const match = await prisma.independentMatch.findUnique({
    where: { id: matchId },
    select: {
      organizerId: true,
      participants: {
        where: { status: 'ACCEPTED' },
        select: { userId: true },
      },
      invitations: {
        where: { acceptedAt: null, expiresAt: { gt: new Date() } },
        select: {
          invitedUserId: true,
          invitedTeam: { select: { members: { select: { userId: true } } } },
        },
      },
    },
  });
  const set = new Set<string>();
  if (!match) return set;
  set.add(match.organizerId);
  for (const p of match.participants) set.add(p.userId);
  for (const inv of match.invitations) {
    if (inv.invitedUserId) set.add(inv.invitedUserId);
    if (inv.invitedTeam) {
      for (const m of inv.invitedTeam.members) set.add(m.userId);
    }
  }
  return set;
}

async function findPendingInvitationForUser(
  matchId: string,
  userId: string,
): Promise<{ id: string } | null> {
  const memberRows = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  const userTeamIds = memberRows.map((m) => m.teamId);

  return prisma.independentMatchInvitation.findFirst({
    where: {
      matchId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
      OR: [
        { invitedUserId: userId },
        ...(userTeamIds.length > 0 ? [{ invitedTeamId: { in: userTeamIds } }] : []),
      ],
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
}
