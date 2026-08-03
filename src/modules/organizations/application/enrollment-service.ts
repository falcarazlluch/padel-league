import { randomBytes } from 'node:crypto';
import type { Prisma, TeamCategory } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import {
  AuthorizationError,
  ConflictError,
  DomainError,
  NotFoundError,
} from '@/shared/errors';
import { originForTenant } from '@/shared/tenant/host';
import { queue } from '@/shared/queue/client';
import { logger } from '@/shared/logger';
import type {
  ChecklistItem,
  EnrollmentView,
  PartnerInviteView,
} from '../domain/types';
import { InviteLinkService } from './invite-link-service';
import { OrganizationService } from './organization-service';

const PARTNER_INVITE_TTL_DAYS = 14;
const MAX_TEAM_SIZE = 2;

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Guided tournament enrolment.
 *
 * The wizard's promise to the player is that they always know where they stand,
 * so every mutation ends with the `TournamentEnrollment` row telling the whole
 * truth: which team, which partner, whether the `LeagueRegistration` exists.
 * `getView` derives the visible checklist from that row alone — there is no
 * client-side wizard state that can drift from the database.
 */
export const EnrollmentService = {
  /**
   * Step 0 → 1. Validates the invite link, joins the tenant and creates (or
   * resumes) the enrollment. Idempotent: re-opening the link never duplicates
   * anything and never re-counts a use.
   */
  async start(
    token: string,
    userId: string,
  ): Promise<{ enrollmentId: string; leagueId: string; organizationId: string; resumed: boolean }> {
    const { linkId, leagueId, organizationId } = await InviteLinkService.resolveForEnrollment(token);

    const existing = await prisma.tournamentEnrollment.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { id: true, status: true },
    });

    if (existing && existing.status !== 'CANCELLED') {
      // Membership is re-asserted on every entry: a user could have been
      // removed from the org between two visits to the same link.
      await OrganizationService.ensureMember(organizationId, userId);
      return { enrollmentId: existing.id, leagueId, organizationId, resumed: true };
    }

    const enrollmentId = await prisma.$transaction(async (tx) => {
      await OrganizationService.ensureMember(organizationId, userId, 'ORG_PLAYER', tx);
      if (existing) {
        const revived = await tx.tournamentEnrollment.update({
          where: { id: existing.id },
          data: { status: 'AWAITING_PARTNER', inviteLinkId: linkId, completedAt: null },
          select: { id: true },
        });
        return revived.id;
      }
      const created = await tx.tournamentEnrollment.create({
        data: { leagueId, userId, inviteLinkId: linkId, status: 'AWAITING_PARTNER' },
        select: { id: true },
      });
      return created.id;
    });

    // Usage counts *players who started*, so it only ticks on a fresh row.
    if (!existing) await InviteLinkService.recordUse(linkId);

    return { enrollmentId, leagueId, organizationId, resumed: false };
  },

  /** Step 2. The profile fields the club needs before a player can compete. */
  async saveProfile(
    userId: string,
    input: { name: string; phone: string; category: TeamCategory },
  ): Promise<void> {
    const name = input.name.trim();
    if (name.length < 3) {
      throw new DomainError('INVALID_NAME', 'Escribe tu nombre y apellido (mínimo 3 caracteres).');
    }
    const phone = input.phone.trim();
    // Deliberately permissive: international formats, spaces and dashes all
    // pass. We only reject values that clearly are not a phone number.
    if (phone.replace(/[^\d]/g, '').length < 6) {
      throw new DomainError('INVALID_PHONE', 'Escribe un teléfono de contacto válido.');
    }
    await prisma.user.update({
      where: { id: userId },
      data: { name, phone, category: input.category },
    });
  },

  /**
   * Step 3, branch A — "ya tenemos pareja en la app". Registers an existing
   * complete team. Enrollment and registration land in one transaction so the
   * player can never see "apuntado" without a registration behind it.
   */
  async registerWithExistingTeam(
    input: { leagueId: string; teamId: string; userId: string },
  ): Promise<{ registrationId: string; partnerUserId: string | null }> {
    const enrollment = await requireEnrollment(input.leagueId, input.userId);
    await assertProfileComplete(input.userId);

    const [league, team] = await Promise.all([
      prisma.league.findUnique({
        where: { id: input.leagueId },
        select: {
          id: true, name: true, slug: true, status: true, organizationId: true,
          registrationStart: true, registrationEnd: true,
        },
      }),
      prisma.team.findUnique({
        where: { id: input.teamId },
        select: {
          id: true, name: true, organizationId: true,
          members: { select: { userId: true, user: { select: { name: true } } } },
        },
      }),
    ]);
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Competición no encontrada.');
    if (!team) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');
    if (!team.members.some((m) => m.userId === input.userId)) {
      throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro de este equipo.');
    }
    if (team.members.length < MAX_TEAM_SIZE) {
      throw new DomainError(
        'TEAM_INCOMPLETE',
        'Esa pareja está incompleta. Invita a tu compañero/a antes de apuntaros.',
      );
    }
    // A team from another tenant must not be dragged into this one.
    if (team.organizationId !== league.organizationId) {
      throw new DomainError(
        'TEAM_WRONG_ORG',
        'Esa pareja pertenece a otro entorno y no puede apuntarse a esta competición.',
      );
    }
    assertRegistrationOpen(league);

    const actor = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { name: true },
    });
    const partner = team.members.find((m) => m.userId !== input.userId) ?? null;

    const registrationId = await prisma.$transaction(async (tx) => {
      const regId = await createRegistrationTx(tx, {
        leagueId: league.id,
        teamId: team.id,
        actorUserId: input.userId,
      });
      await tx.tournamentEnrollment.update({
        where: { id: enrollment.id },
        data: {
          teamId: team.id,
          registrationId: regId,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      // The partner did not act, so they get told — the actor sees the wizard's
      // confirmation screen instead.
      if (partner) {
        await upsertCompletedEnrollmentTx(tx, {
          leagueId: league.id,
          userId: partner.userId,
          teamId: team.id,
          registrationId: regId,
          inviteLinkId: enrollment.inviteLinkId,
        });
        await tx.notification.create({
          data: {
            userId: partner.userId,
            organizationId: league.organizationId,
            type: 'TOURNAMENT_ENROLLMENT_COMPLETED',
            title: 'Estáis apuntados',
            body: `${actor?.name ?? 'Tu compañero/a'} os ha apuntado como pareja "${team.name}" a ${league.name}.`,
            metadata: {
              leagueId: league.id,
              leagueSlug: league.slug,
              teamId: team.id,
              registrationId: regId,
            },
          },
        });
      }
      return regId;
    });

    return { registrationId, partnerUserId: partner?.userId ?? null };
  },

  /**
   * Step 3, branch B — "tengo pareja pero aún no está apuntada". Creates the
   * team with the player as its only member and issues the partner invite
   * (in-app notification when the partner already has an account, email when
   * we only know their address, plus a shareable link in every case).
   */
  async invitePartner(
    input: {
      leagueId: string;
      userId: string;
      teamName?: string;
      /** Existing platform user picked from the search box. */
      partnerUserId?: string;
      /** Free-text invite for someone who is not on the platform yet. */
      partnerEmail?: string;
      partnerName?: string;
    },
  ): Promise<{ inviteId: string; shareUrl: string; teamId: string; notifiedInApp: boolean }> {
    const enrollment = await requireEnrollment(input.leagueId, input.userId);
    await assertProfileComplete(input.userId);

    const league = await prisma.league.findUnique({
      where: { id: input.leagueId },
      select: {
        id: true, name: true, status: true, organizationId: true, category: true,
        registrationStart: true, registrationEnd: true,
        organization: { select: { slug: true, name: true, logoUrl: true } },
      },
    });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Competición no encontrada.');
    assertRegistrationOpen(league);

    const me = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, email: true, category: true },
    });
    if (!me) throw new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado.');

    // Resolve the invitee. Either an existing account or a bare email.
    let partnerUser: { id: string; name: string; email: string } | null = null;
    let partnerEmail: string | null = null;
    let partnerName: string;

    if (input.partnerUserId) {
      if (input.partnerUserId === input.userId) {
        throw new DomainError('CANNOT_INVITE_SELF', 'No puedes invitarte a ti mismo como pareja.');
      }
      const found = await prisma.user.findUnique({
        where: { id: input.partnerUserId },
        select: { id: true, name: true, email: true, deletedAt: true },
      });
      if (!found || found.deletedAt) {
        throw new NotFoundError('USER_NOT_FOUND', 'No encontramos a ese jugador.');
      }
      partnerUser = { id: found.id, name: found.name, email: found.email };
      partnerEmail = found.email;
      partnerName = found.name;
    } else {
      const email = input.partnerEmail?.trim().toLowerCase();
      if (!email) {
        throw new DomainError('PARTNER_REQUIRED', 'Indica quién es tu pareja para el torneo.');
      }
      if (email === me.email.toLowerCase()) {
        throw new DomainError('CANNOT_INVITE_SELF', 'Ese es tu propio email.');
      }
      // The address may already belong to an account — bind it so the partner
      // gets an in-app notification instead of only an email.
      const found = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, deletedAt: true },
      });
      if (found && !found.deletedAt) {
        partnerUser = { id: found.id, name: found.name, email: found.email };
        partnerName = input.partnerName?.trim() || found.name;
      } else {
        partnerName = input.partnerName?.trim() || email;
      }
      partnerEmail = email;
    }

    if (partnerUser) {
      const alreadyIn = await prisma.leagueRegistration.findFirst({
        where: {
          leagueId: league.id,
          withdrawnAt: null,
          team: { members: { some: { userId: partnerUser.id } } },
        },
        select: { id: true },
      });
      if (alreadyIn) {
        throw new ConflictError(
          'PARTNER_ALREADY_REGISTERED',
          `${partnerName} ya está apuntado/a a esta competición con otra pareja.`,
        );
      }
    }

    const teamCategory: TeamCategory = me.category;
    const result = await prisma.$transaction(async (tx) => {
      // Reuse the enrollment's team across retries so changing your mind about
      // the partner doesn't leave orphan teams behind.
      let teamId = enrollment.teamId;
      if (teamId) {
        const stillThere = await tx.team.findUnique({
          where: { id: teamId },
          select: { id: true, members: { select: { userId: true } } },
        });
        if (!stillThere || !stillThere.members.some((m) => m.userId === input.userId)) {
          teamId = null;
        } else if (stillThere.members.length >= MAX_TEAM_SIZE) {
          throw new ConflictError('TEAM_FULL', 'Esa pareja ya está completa.');
        }
      }
      if (!teamId) {
        const name = await uniqueTeamNameTx(tx, input.userId, input.teamName?.trim() || `${me.name} y ${partnerName}`);
        const team = await tx.team.create({
          data: {
            name,
            category: teamCategory,
            organizationId: league.organizationId,
            createdByUserId: input.userId,
            members: { create: { userId: input.userId } },
          },
          select: { id: true },
        });
        teamId = team.id;
      } else if (input.teamName?.trim()) {
        await tx.team.update({ where: { id: teamId }, data: { name: input.teamName.trim() } });
      }

      // Only one live invite per enrollment — superseding is how "cambiar de
      // pareja" works.
      await tx.tournamentPartnerInvite.updateMany({
        where: { enrollmentId: enrollment.id, status: 'PENDING' },
        data: { status: 'CANCELLED', respondedAt: new Date() },
      });

      const invite = await tx.tournamentPartnerInvite.create({
        data: {
          token: newToken(),
          enrollmentId: enrollment.id,
          leagueId: league.id,
          teamId,
          invitedByUserId: input.userId,
          invitedUserId: partnerUser?.id ?? null,
          invitedEmail: partnerEmail,
          invitedName: partnerName,
          expiresAt: earliest(
            new Date(Date.now() + PARTNER_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
            league.registrationEnd,
          ),
        },
        select: { id: true, token: true },
      });

      await tx.tournamentEnrollment.update({
        where: { id: enrollment.id },
        data: { teamId, status: 'AWAITING_PARTNER_ACCEPT' },
      });

      if (partnerUser) {
        await tx.notification.create({
          data: {
            userId: partnerUser.id,
            organizationId: league.organizationId,
            type: 'TOURNAMENT_PARTNER_INVITE',
            title: 'Te invitan como pareja',
            body: `${me.name} quiere apuntarse contigo a ${league.name}. Acepta para completar la inscripción.`,
            metadata: {
              partnerInviteId: invite.id,
              partnerInviteToken: invite.token,
              leagueId: league.id,
              teamId,
            },
          },
        });
      }

      return { inviteId: invite.id, token: invite.token, teamId };
    });

    const shareUrl = `${originForTenant(league.organization?.slug ?? null)}/pareja/${result.token}`;

    if (partnerEmail) {
      // Best-effort: a queue hiccup must not undo an enrolment that is already
      // committed. The share link is shown on screen either way.
      try {
        await queue().publish('send-email', {
          template: 'tournament-partner-invite',
          to: partnerEmail,
          data: {
            inviterName: me.name,
            partnerName,
            competitionName: league.name,
            acceptUrl: shareUrl,
            brandName: league.organization?.name ?? 'Padel League',
            brandLogoUrl: league.organization?.logoUrl ?? '',
            brandUrl: originForTenant(league.organization?.slug ?? null),
          },
          dedupKey: `partner-invite:${result.inviteId}`,
        });
      } catch (err) {
        logger().error({ err, inviteId: result.inviteId }, 'partner-invite.email.enqueue-failed');
      }
    }

    return {
      inviteId: result.inviteId,
      shareUrl,
      teamId: result.teamId,
      notifiedInApp: partnerUser !== null,
    };
  },

  /** Withdraws the pending partner invite and drops back to step 3. */
  async cancelPartnerInvite(input: { leagueId: string; userId: string }): Promise<void> {
    const enrollment = await requireEnrollment(input.leagueId, input.userId);
    const invite = await prisma.tournamentPartnerInvite.findFirst({
      where: { enrollmentId: enrollment.id, status: 'PENDING' },
      select: { id: true, invitedUserId: true, invitedName: true },
    });
    if (!invite) return;

    await prisma.$transaction(async (tx) => {
      await tx.tournamentPartnerInvite.update({
        where: { id: invite.id },
        data: { status: 'CANCELLED', respondedAt: new Date() },
      });
      await tx.tournamentEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'AWAITING_PARTNER' },
      });
    });
  },

  /** Abandons the enrollment. Any registration already made is withdrawn. */
  async cancel(input: { leagueId: string; userId: string }): Promise<void> {
    const enrollment = await requireEnrollment(input.leagueId, input.userId);
    const league = await prisma.league.findUnique({
      where: { id: input.leagueId },
      select: {
        id: true, name: true, status: true, organizationId: true,
        registrationStart: true, registrationEnd: true,
      },
    });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Competición no encontrada.');
    assertRegistrationOpen(league);
    const leagueOrganizationId = league.organizationId;

    const actor = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { name: true },
    });

    await prisma.$transaction(async (tx) => {
      if (enrollment.registrationId) {
        const reg = await tx.leagueRegistration.findUnique({
          where: { id: enrollment.registrationId },
          select: { id: true, teamId: true, withdrawnAt: true },
        });
        if (reg && reg.withdrawnAt === null) {
          await tx.leagueRegistration.update({
            where: { id: reg.id },
            data: { withdrawnAt: new Date(), withdrawnByUserId: input.userId },
          });
          if (reg.teamId) {
            const others = await tx.teamMember.findMany({
              where: { teamId: reg.teamId, userId: { not: input.userId } },
              select: { userId: true },
            });
            await tx.notification.createMany({
              data: others.map((m) => ({
                userId: m.userId,
                organizationId: leagueOrganizationId,
                type: 'LEAGUE_REGISTRATION_REMOVED' as const,
                title: 'Inscripción anulada',
                body: `${actor?.name ?? 'Tu compañero/a'} ha anulado vuestra inscripción a ${league.name}.`,
                metadata: { leagueId: league.id, teamId: reg.teamId },
              })),
            });
            // The partner's mirrored enrollment must not keep claiming they are in.
            await tx.tournamentEnrollment.updateMany({
              where: { leagueId: league.id, userId: { in: others.map((m) => m.userId) } },
              data: { status: 'CANCELLED', registrationId: null, completedAt: null },
            });
          }
        }
      }
      await tx.tournamentPartnerInvite.updateMany({
        where: { enrollmentId: enrollment.id, status: 'PENDING' },
        data: { status: 'CANCELLED', respondedAt: new Date() },
      });
      await tx.tournamentEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'CANCELLED', registrationId: null, completedAt: null },
      });
    });
  },

  // ─── Lado de la pareja invitada ─────────────────────────────────────────

  /**
   * Everything the partner sees before deciding. `viewerUserId` is optional so
   * the page can render for a visitor who has not logged in yet.
   */
  async getPartnerInvite(
    token: string,
    viewerUserId: string | null,
    now: Date = new Date(),
  ): Promise<PartnerInviteView | null> {
    const invite = await prisma.tournamentPartnerInvite.findUnique({
      where: { token },
      include: {
        invitedBy: { select: { id: true, name: true, avatarUrl: true } },
        team: { select: { id: true, name: true, members: { select: { userId: true } } } },
        league: {
          select: {
            id: true, slug: true, name: true, type: true, status: true,
            startDate: true, endDate: true, registrationStart: true, registrationEnd: true,
            organization: { select: { id: true, slug: true, name: true, logoUrl: true, isActive: true } },
          },
        },
      },
    });
    if (!invite) return null;

    let blockedReason: PartnerInviteView['blockedReason'] = null;
    if (invite.status !== 'PENDING') blockedReason = 'ALREADY_RESOLVED';
    else if (invite.expiresAt.getTime() < now.getTime()) blockedReason = 'EXPIRED';
    else if (invite.team.members.length >= MAX_TEAM_SIZE) blockedReason = 'TEAM_FULL';
    else if (
      invite.league.status !== 'DRAFT' ||
      now.getTime() > invite.league.registrationEnd.getTime()
    ) {
      blockedReason = 'REGISTRATION_CLOSED';
    } else if (
      viewerUserId !== null &&
      invite.invitedUserId !== null &&
      invite.invitedUserId !== viewerUserId
    ) {
      blockedReason = 'WRONG_ACCOUNT';
    }

    return {
      id: invite.id,
      token: invite.token,
      status: invite.status,
      expiresAt: invite.expiresAt,
      invitedName: invite.invitedName ?? invite.invitedEmail ?? 'Jugador/a',
      invitedEmail: invite.invitedEmail,
      invitedUserId: invite.invitedUserId,
      inviter: invite.invitedBy,
      team: {
        id: invite.team.id,
        name: invite.team.name,
        memberCount: invite.team.members.length,
      },
      competition: {
        id: invite.league.id,
        slug: invite.league.slug,
        name: invite.league.name,
        type: invite.league.type,
        startDate: invite.league.startDate,
        endDate: invite.league.endDate,
        registrationEnd: invite.league.registrationEnd,
      },
      organization: invite.league.organization?.isActive
        ? {
            id: invite.league.organization.id,
            slug: invite.league.organization.slug,
            name: invite.league.organization.name,
            logoUrl: invite.league.organization.logoUrl,
          }
        : null,
      blockedReason,
    };
  },

  /**
   * The partner accepts: they join the team, the pair gets registered and both
   * enrollments flip to COMPLETED — one transaction, so there is no window in
   * which one of the two believes they are in and the other does not.
   */
  async acceptPartnerInvite(
    token: string,
    userId: string,
  ): Promise<{ leagueId: string; leagueSlug: string; teamId: string; registrationId: string }> {
    const view = await EnrollmentService.getPartnerInvite(token, userId);
    if (!view) throw new NotFoundError('INVITE_NOT_FOUND', 'Esta invitación no existe.');
    if (view.blockedReason) {
      throw new DomainError(view.blockedReason, PARTNER_BLOCKED_MESSAGE[view.blockedReason]);
    }

    const invite = await prisma.tournamentPartnerInvite.findUnique({
      where: { token },
      select: {
        id: true, enrollmentId: true, leagueId: true, teamId: true, invitedByUserId: true,
        league: {
          select: {
            id: true, slug: true, name: true, status: true, organizationId: true,
            registrationStart: true, registrationEnd: true,
          },
        },
        enrollment: { select: { id: true, inviteLinkId: true } },
      },
    });
    if (!invite) throw new NotFoundError('INVITE_NOT_FOUND', 'Esta invitación no existe.');
    assertRegistrationOpen(invite.league);

    if (userId === invite.invitedByUserId) {
      throw new DomainError('CANNOT_ACCEPT_OWN_INVITE', 'No puedes aceptar tu propia invitación.');
    }

    const clash = await prisma.leagueRegistration.findFirst({
      where: {
        leagueId: invite.leagueId,
        withdrawnAt: null,
        team: { members: { some: { userId } } },
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictError(
        'ALREADY_REGISTERED',
        'Ya estás apuntado/a a esta competición con otra pareja.',
      );
    }

    const accepter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const registrationId = await prisma.$transaction(async (tx) => {
      if (invite.league.organizationId) {
        await OrganizationService.ensureMember(invite.league.organizationId, userId, 'ORG_PLAYER', tx);
      }

      // Re-read membership inside the TX: two people holding the same link must
      // not both squeeze into a 2-player team.
      const members = await tx.teamMember.findMany({
        where: { teamId: invite.teamId },
        select: { userId: true },
      });
      if (members.length >= MAX_TEAM_SIZE) {
        throw new ConflictError('TEAM_FULL', 'Esa pareja ya está completa.');
      }
      if (!members.some((m) => m.userId === userId)) {
        await tx.teamMember.create({ data: { teamId: invite.teamId, userId } });
      }

      const regId = await createRegistrationTx(tx, {
        leagueId: invite.leagueId,
        teamId: invite.teamId,
        actorUserId: userId,
      });

      await tx.tournamentPartnerInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      await tx.tournamentEnrollment.update({
        where: { id: invite.enrollmentId },
        data: { registrationId: regId, status: 'COMPLETED', completedAt: new Date() },
      });
      await upsertCompletedEnrollmentTx(tx, {
        leagueId: invite.leagueId,
        userId,
        teamId: invite.teamId,
        registrationId: regId,
        inviteLinkId: invite.enrollment.inviteLinkId,
      });

      await tx.notification.create({
        data: {
          userId: invite.invitedByUserId,
          organizationId: invite.league.organizationId,
          type: 'TOURNAMENT_PARTNER_ACCEPTED',
          title: '¡Inscripción completada!',
          body: `${accepter?.name ?? 'Tu pareja'} ha aceptado. Ya estáis apuntados a ${invite.league.name}.`,
          metadata: {
            leagueId: invite.leagueId,
            leagueSlug: invite.league.slug,
            teamId: invite.teamId,
            registrationId: regId,
          },
        },
      });

      return regId;
    });

    return {
      leagueId: invite.leagueId,
      leagueSlug: invite.league.slug,
      teamId: invite.teamId,
      registrationId,
    };
  },

  async declinePartnerInvite(token: string, userId: string): Promise<{ leagueName: string }> {
    const invite = await prisma.tournamentPartnerInvite.findUnique({
      where: { token },
      select: {
        id: true, status: true, enrollmentId: true, leagueId: true,
        invitedByUserId: true, invitedUserId: true,
        league: { select: { name: true, slug: true, organizationId: true } },
      },
    });
    if (!invite) throw new NotFoundError('INVITE_NOT_FOUND', 'Esta invitación no existe.');
    if (invite.status !== 'PENDING') {
      throw new DomainError('ALREADY_RESOLVED', 'Esta invitación ya estaba resuelta.');
    }
    if (invite.invitedUserId !== null && invite.invitedUserId !== userId) {
      throw new AuthorizationError('WRONG_ACCOUNT', 'Esta invitación no es para tu cuenta.');
    }

    const decliner = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.tournamentPartnerInvite.update({
        where: { id: invite.id },
        data: { status: 'DECLINED', respondedAt: new Date() },
      });
      await tx.tournamentEnrollment.update({
        where: { id: invite.enrollmentId },
        data: { status: 'AWAITING_PARTNER' },
      });
      await tx.notification.create({
        data: {
          userId: invite.invitedByUserId,
          organizationId: invite.league.organizationId,
          type: 'TOURNAMENT_PARTNER_DECLINED',
          title: 'Tu pareja ha rechazado la invitación',
          body: `${decliner?.name ?? 'La persona invitada'} no jugará contigo en ${invite.league.name}. Puedes invitar a otra pareja.`,
          metadata: { leagueId: invite.leagueId, leagueSlug: invite.league.slug },
        },
      });
    });

    return { leagueName: invite.league.name };
  },

  // ─── Lectura ────────────────────────────────────────────────────────────

  /**
   * The single source of truth behind both the wizard and the status page.
   * Never throws for a missing enrollment — it reports `NOT_STARTED`.
   */
  async getView(leagueId: string, userId: string): Promise<EnrollmentView> {
    const [enrollment, user, league] = await Promise.all([
      prisma.tournamentEnrollment.findUnique({
        where: { leagueId_userId: { leagueId, userId } },
        include: {
          team: { select: { id: true, name: true, members: { select: { userId: true, user: { select: { id: true, name: true, email: true } } } } } },
          invites: {
            where: { status: { in: ['PENDING', 'ACCEPTED'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, phone: true, category: true },
      }),
      prisma.league.findUnique({
        where: { id: leagueId },
        select: { organization: { select: { slug: true } } },
      }),
    ]);

    const missingProfileFields: string[] = [];
    if (!user?.name || user.name.trim().length < 3) missingProfileFields.push('Nombre y apellido');
    if (!user?.phone || user.phone.replace(/[^\d]/g, '').length < 6) {
      missingProfileFields.push('Teléfono de contacto');
    }
    const profileComplete = missingProfileFields.length === 0;

    if (!enrollment || enrollment.status === 'CANCELLED') {
      return {
        enrollmentId: enrollment?.id ?? null,
        status: enrollment?.status ?? 'NOT_STARTED',
        currentStep: profileComplete ? 3 : 2,
        profileComplete,
        missingProfileFields,
        team: null,
        partner: null,
        pendingInvite: null,
        registrationId: null,
        completedAt: null,
        checklist: buildChecklist({
          profileComplete,
          partnerState: 'missing',
          registered: false,
          partnerName: null,
        }),
      };
    }

    const liveInvite = enrollment.invites[0] ?? null;
    const pending = liveInvite?.status === 'PENDING' ? liveInvite : null;
    const partnerMember = enrollment.team?.members.find((m) => m.userId !== userId) ?? null;

    const registered = enrollment.status === 'COMPLETED' && enrollment.registrationId !== null;
    const partnerState: PartnerState = registered
      ? 'confirmed'
      : pending
        ? 'invited'
        : 'missing';

    const origin = originForTenant(league?.organization?.slug ?? null);

    return {
      enrollmentId: enrollment.id,
      status: enrollment.status,
      currentStep: !profileComplete ? 2 : registered ? 4 : 3,
      profileComplete,
      missingProfileFields,
      team: enrollment.team
        ? {
            id: enrollment.team.id,
            name: enrollment.team.name,
            memberCount: enrollment.team.members.length,
          }
        : null,
      partner: partnerMember
        ? {
            userId: partnerMember.userId,
            name: partnerMember.user.name,
            email: partnerMember.user.email,
            accepted: true,
          }
        : pending
          ? {
              userId: pending.invitedUserId,
              name: pending.invitedName ?? pending.invitedEmail ?? 'Tu pareja',
              email: pending.invitedEmail,
              accepted: false,
            }
          : null,
      pendingInvite: pending
        ? {
            id: pending.id,
            token: pending.token,
            invitedName: pending.invitedName ?? pending.invitedEmail ?? 'Tu pareja',
            invitedEmail: pending.invitedEmail,
            expiresAt: pending.expiresAt,
            shareUrl: `${origin}/pareja/${pending.token}`,
          }
        : null,
      registrationId: enrollment.registrationId,
      completedAt: enrollment.completedAt,
      checklist: buildChecklist({
        profileComplete,
        partnerState,
        registered,
        partnerName:
          partnerMember?.user.name ?? pending?.invitedName ?? pending?.invitedEmail ?? null,
      }),
    };
  },

  /** Enrollments of the current user that still need something. Feeds the
   *  "te falta terminar una inscripción" banner on the dashboard. */
  async listUnfinishedForUser(userId: string, organizationId: string | null) {
    const rows = await prisma.tournamentEnrollment.findMany({
      where: {
        userId,
        status: { in: ['AWAITING_PARTNER', 'AWAITING_PARTNER_ACCEPT'] },
        league: { organizationId, status: 'DRAFT' },
      },
      include: {
        league: { select: { id: true, slug: true, name: true, registrationEnd: true } },
        inviteLink: { select: { token: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => ({
      enrollmentId: r.id,
      status: r.status,
      leagueId: r.league.id,
      leagueSlug: r.league.slug,
      leagueName: r.league.name,
      registrationEnd: r.league.registrationEnd,
      resumeToken: r.inviteLink?.token ?? null,
    }));
  },

  /** Admin view: who is in, who is half-way through. */
  async listForLeague(leagueId: string, actorUserId: string) {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { organizationId: true },
    });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Competición no encontrada.');
    if (league.organizationId) {
      await OrganizationService.assertOrgAdmin(league.organizationId, actorUserId);
    }
    const rows = await prisma.tournamentEnrollment.findMany({
      where: { leagueId, status: { not: 'CANCELLED' } },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } },
        team: { select: { id: true, name: true, _count: { select: { members: true } } } },
        invites: { where: { status: 'PENDING' }, take: 1, select: { invitedName: true, invitedEmail: true, expiresAt: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      user: r.user,
      teamName: r.team?.name ?? null,
      teamMemberCount: r.team?._count.members ?? 0,
      pendingPartner: r.invites[0]
        ? {
            name: r.invites[0].invitedName ?? r.invites[0].invitedEmail ?? '—',
            email: r.invites[0].invitedEmail,
            expiresAt: r.invites[0].expiresAt,
          }
        : null,
      completedAt: r.completedAt,
    }));
  },
} as const;

export const PARTNER_BLOCKED_MESSAGE: Record<
  NonNullable<PartnerInviteView['blockedReason']>,
  string
> = {
  ALREADY_RESOLVED: 'Esta invitación ya se había aceptado, rechazado o cancelado.',
  EXPIRED: 'Esta invitación ha caducado. Pide a tu pareja que te envíe una nueva.',
  TEAM_FULL: 'Esa pareja ya está completa.',
  REGISTRATION_CLOSED: 'El plazo de inscripción de esta competición ya se ha cerrado.',
  WRONG_ACCOUNT: 'Esta invitación es para otra cuenta. Cierra sesión y entra con la cuenta invitada.',
};

// ─── Helpers ──────────────────────────────────────────────────────────────

type PartnerState = 'missing' | 'invited' | 'confirmed';

function buildChecklist(input: {
  profileComplete: boolean;
  partnerState: PartnerState;
  registered: boolean;
  partnerName: string | null;
}): ChecklistItem[] {
  const partner: ChecklistItem =
    input.partnerState === 'confirmed'
      ? {
          key: 'partner',
          label: 'Pareja confirmada',
          state: 'done',
          detail: input.partnerName ? `Juegas con ${input.partnerName}.` : 'Pareja completa.',
        }
      : input.partnerState === 'invited'
        ? {
            key: 'partner',
            label: 'Pareja pendiente de aceptar',
            state: 'pending',
            detail: `Hemos avisado a ${input.partnerName ?? 'tu pareja'}. En cuanto acepte, quedaréis inscritos automáticamente.`,
          }
        : {
            key: 'partner',
            label: 'Falta elegir pareja',
            state: 'blocked',
            detail: 'Esta competición se juega por parejas: elige o invita a tu compañero/a.',
          };

  return [
    {
      key: 'profile',
      label: input.profileComplete ? 'Perfil completo' : 'Falta completar tu perfil',
      state: input.profileComplete ? 'done' : 'blocked',
      detail: input.profileComplete
        ? 'Tus datos de contacto están listos.'
        : 'Necesitamos tu nombre y un teléfono para avisarte de horarios.',
    },
    partner,
    {
      key: 'registration',
      label: input.registered ? 'Inscripción confirmada' : 'Inscripción sin confirmar',
      state: input.registered ? 'done' : input.partnerState === 'invited' ? 'pending' : 'blocked',
      detail: input.registered
        ? 'Estáis dentro del cuadro. No tienes que hacer nada más.'
        : 'Se confirma automáticamente en cuanto la pareja esté completa.',
    },
  ];
}

async function requireEnrollment(leagueId: string, userId: string) {
  const enrollment = await prisma.tournamentEnrollment.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    select: { id: true, status: true, teamId: true, registrationId: true, inviteLinkId: true },
  });
  if (!enrollment || enrollment.status === 'CANCELLED') {
    throw new NotFoundError(
      'ENROLLMENT_NOT_FOUND',
      'No hay una inscripción en curso. Vuelve a abrir el enlace de inscripción.',
    );
  }
  return enrollment;
}

async function assertProfileComplete(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, phone: true },
  });
  if (!user?.name || user.name.trim().length < 3 || !user.phone || user.phone.replace(/[^\d]/g, '').length < 6) {
    throw new DomainError(
      'PROFILE_INCOMPLETE',
      'Completa tu perfil (nombre y teléfono) antes de continuar.',
    );
  }
}

function assertRegistrationOpen(league: {
  status: string;
  registrationStart: Date;
  registrationEnd: Date;
}): void {
  if (league.status !== 'DRAFT') {
    throw new DomainError('COMPETITION_STARTED', 'La competición ya ha empezado.');
  }
  const now = Date.now();
  if (now < league.registrationStart.getTime()) {
    throw new DomainError('REGISTRATION_NOT_OPEN_YET', 'La inscripción todavía no está abierta.');
  }
  if (now > league.registrationEnd.getTime()) {
    throw new DomainError('REGISTRATION_CLOSED', 'El plazo de inscripción ya se ha cerrado.');
  }
}

/**
 * Creates (or revives) the `LeagueRegistration` for a pair. Shared by both
 * completion paths so "apuntado" always means the same row shape.
 */
async function createRegistrationTx(
  tx: Prisma.TransactionClient,
  input: { leagueId: string; teamId: string; actorUserId: string },
): Promise<string> {
  const existing = await tx.leagueRegistration.findUnique({
    where: { leagueId_teamId: { leagueId: input.leagueId, teamId: input.teamId } },
    select: { id: true, withdrawnAt: true },
  });
  if (existing) {
    if (existing.withdrawnAt === null) return existing.id;
    const revived = await tx.leagueRegistration.update({
      where: { id: existing.id },
      data: {
        registeredByUserId: input.actorUserId,
        registeredAt: new Date(),
        withdrawnAt: null,
        withdrawnByUserId: null,
      },
      select: { id: true },
    });
    return revived.id;
  }
  const created = await tx.leagueRegistration.create({
    data: {
      leagueId: input.leagueId,
      teamId: input.teamId,
      registeredByUserId: input.actorUserId,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Mirrors a COMPLETED enrollment onto the partner so their own status page
 * reads "inscripción confirmada" without them ever opening the wizard.
 */
async function upsertCompletedEnrollmentTx(
  tx: Prisma.TransactionClient,
  input: {
    leagueId: string;
    userId: string;
    teamId: string;
    registrationId: string;
    inviteLinkId: string | null;
  },
): Promise<void> {
  await tx.tournamentEnrollment.upsert({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
    create: {
      leagueId: input.leagueId,
      userId: input.userId,
      teamId: input.teamId,
      registrationId: input.registrationId,
      inviteLinkId: input.inviteLinkId,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
    update: {
      teamId: input.teamId,
      registrationId: input.registrationId,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });
}

/** `Team` is unique on (createdByUserId, name) — dedupe with a numeric suffix. */
async function uniqueTeamNameTx(
  tx: Prisma.TransactionClient,
  userId: string,
  desired: string,
): Promise<string> {
  const base = desired.slice(0, 60) || 'Mi pareja';
  const taken = await tx.team.findMany({
    where: { createdByUserId: userId, name: { startsWith: base } },
    select: { name: true },
  });
  if (!taken.some((t) => t.name === base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base} ${i}`;
    if (!taken.some((t) => t.name === candidate)) return candidate;
  }
  return `${base} ${Date.now()}`;
}

function earliest(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}
