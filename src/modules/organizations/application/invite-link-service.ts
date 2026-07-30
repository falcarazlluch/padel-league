import { randomBytes } from 'node:crypto';
import { prisma } from '@/shared/db/client';
import { DomainError, NotFoundError } from '@/shared/errors';
import { originForTenant } from '@/shared/tenant/host';
import type { InviteLinkPreview } from '../domain/types';
import { OrganizationService } from './organization-service';

/** 24 raw bytes → 32 base64url chars. Unguessable, still short enough to paste. */
function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export interface InviteLinkRow {
  id: string;
  token: string;
  label: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
  revokedAt: Date | null;
  createdAt: Date;
  shareUrl: string;
}

export const InviteLinkService = {
  /**
   * Generates the shareable inscription link for a competition. The link lives
   * on the tenant's own origin so the whole journey (landing → registro/login →
   * wizard) stays inside the whitelabel shell.
   */
  async create(
    input: { leagueId: string; label?: string | null; expiresAt?: Date | null; maxUses?: number | null },
    actorUserId: string,
  ): Promise<InviteLinkRow> {
    const league = await prisma.league.findUnique({
      where: { id: input.leagueId },
      select: { id: true, organizationId: true, registrationEnd: true },
    });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Competición no encontrada.');
    if (!league.organizationId) {
      throw new DomainError(
        'NOT_AN_ORG_COMPETITION',
        'Los enlaces de inscripción solo existen para competiciones de una organización.',
      );
    }
    await OrganizationService.assertOrgAdmin(league.organizationId, actorUserId);

    if (input.maxUses != null && input.maxUses < 1) {
      throw new DomainError('INVALID_MAX_USES', 'El número máximo de usos debe ser 1 o más.');
    }
    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
      throw new DomainError('INVALID_EXPIRY', 'La fecha de caducidad debe ser futura.');
    }

    const link = await prisma.tournamentInviteLink.create({
      data: {
        token: newToken(),
        leagueId: league.id,
        organizationId: league.organizationId,
        label: input.label?.trim() || null,
        // Default: the link dies when the registration window closes, so a
        // forwarded WhatsApp message can never enrol someone late.
        expiresAt: input.expiresAt ?? league.registrationEnd,
        maxUses: input.maxUses ?? null,
        createdByUserId: actorUserId,
      },
    });
    return toRow(link, await orgSlugFor(link.organizationId));
  },

  async listForLeague(leagueId: string, actorUserId: string): Promise<InviteLinkRow[]> {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { organizationId: true },
    });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Competición no encontrada.');
    if (!league.organizationId) return [];
    await OrganizationService.assertOrgAdmin(league.organizationId, actorUserId);

    const [links, slug] = await Promise.all([
      prisma.tournamentInviteLink.findMany({
        where: { leagueId },
        orderBy: { createdAt: 'desc' },
      }),
      orgSlugFor(league.organizationId),
    ]);
    return links.map((l) => toRow(l, slug));
  },

  async revoke(linkId: string, actorUserId: string): Promise<void> {
    const link = await prisma.tournamentInviteLink.findUnique({
      where: { id: linkId },
      select: { id: true, organizationId: true, revokedAt: true },
    });
    if (!link) throw new NotFoundError('LINK_NOT_FOUND', 'Enlace no encontrado.');
    await OrganizationService.assertOrgAdmin(link.organizationId, actorUserId);
    if (link.revokedAt) return;
    await prisma.tournamentInviteLink.update({
      where: { id: linkId },
      data: { revokedAt: new Date() },
    });
  },

  /**
   * Resolves a token into everything the landing page needs. Returns `null`
   * only when the token does not exist at all — every other problem comes back
   * as a populated `blockedReason` so the visitor gets a specific explanation
   * instead of a 404.
   */
  async preview(token: string, now: Date = new Date()): Promise<InviteLinkPreview | null> {
    const link = await prisma.tournamentInviteLink.findUnique({
      where: { token },
      include: {
        organization: {
          select: { id: true, slug: true, name: true, logoUrl: true, tagline: true, isActive: true },
        },
        league: {
          select: {
            id: true, slug: true, name: true, description: true, type: true, category: true,
            status: true, registrationStart: true, registrationEnd: true,
            startDate: true, endDate: true,
          },
        },
        _count: { select: { enrollments: true } },
      },
    });
    if (!link || !link.organization.isActive) return null;

    const registeredCount = await prisma.leagueRegistration.count({
      where: { leagueId: link.leagueId, withdrawnAt: null },
    });

    return {
      linkId: link.id,
      token: link.token,
      organization: {
        id: link.organization.id,
        slug: link.organization.slug,
        name: link.organization.name,
        logoUrl: link.organization.logoUrl,
        tagline: link.organization.tagline,
      },
      competition: {
        id: link.league.id,
        slug: link.league.slug,
        name: link.league.name,
        description: link.league.description,
        type: link.league.type,
        category: link.league.category,
        registrationStart: link.league.registrationStart,
        registrationEnd: link.league.registrationEnd,
        startDate: link.league.startDate,
        endDate: link.league.endDate,
        registeredCount,
      },
      blockedReason: blockedReasonFor(link, now),
    };
  },

  /**
   * Validates a token for actual enrolment and returns the ids needed to build
   * an enrollment. Throws with a user-facing message when unusable.
   */
  async resolveForEnrollment(
    token: string,
    now: Date = new Date(),
  ): Promise<{ linkId: string; leagueId: string; organizationId: string }> {
    const link = await prisma.tournamentInviteLink.findUnique({
      where: { token },
      include: {
        organization: { select: { isActive: true } },
        league: {
          select: { id: true, status: true, registrationStart: true, registrationEnd: true },
        },
      },
    });
    if (!link || !link.organization.isActive) {
      throw new NotFoundError('LINK_NOT_FOUND', 'Este enlace de inscripción no existe.');
    }
    const blocked = blockedReasonFor(link, now);
    if (blocked) {
      throw new DomainError(blocked, BLOCKED_MESSAGE[blocked]);
    }
    return { linkId: link.id, leagueId: link.leagueId, organizationId: link.organizationId };
  },

  /** Bumps the usage counter. Called once, when an enrollment is first created. */
  async recordUse(linkId: string): Promise<void> {
    await prisma.tournamentInviteLink.update({
      where: { id: linkId },
      data: { useCount: { increment: 1 } },
    });
  },
} as const;

export const BLOCKED_MESSAGE: Record<NonNullable<InviteLinkPreview['blockedReason']>, string> = {
  REVOKED: 'El administrador ha desactivado este enlace de inscripción.',
  EXPIRED: 'Este enlace de inscripción ha caducado.',
  MAX_USES_REACHED: 'Este enlace ha alcanzado el número máximo de inscripciones.',
  REGISTRATION_NOT_OPEN_YET: 'La inscripción todavía no está abierta.',
  REGISTRATION_CLOSED: 'El plazo de inscripción ya se ha cerrado.',
  COMPETITION_STARTED: 'La competición ya ha empezado y no admite nuevas inscripciones.',
};

function blockedReasonFor(
  link: {
    revokedAt: Date | null;
    expiresAt: Date | null;
    maxUses: number | null;
    useCount: number;
    league: { status: string; registrationStart: Date; registrationEnd: Date };
  },
  now: Date,
): InviteLinkPreview['blockedReason'] {
  if (link.revokedAt) return 'REVOKED';
  if (link.expiresAt && link.expiresAt.getTime() < now.getTime()) return 'EXPIRED';
  if (link.maxUses != null && link.useCount >= link.maxUses) return 'MAX_USES_REACHED';
  if (link.league.status !== 'DRAFT') return 'COMPETITION_STARTED';
  if (now.getTime() < link.league.registrationStart.getTime()) return 'REGISTRATION_NOT_OPEN_YET';
  if (now.getTime() > link.league.registrationEnd.getTime()) return 'REGISTRATION_CLOSED';
  return null;
}

async function orgSlugFor(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  return org?.slug ?? '';
}

function toRow(
  link: {
    id: string; token: string; label: string | null; expiresAt: Date | null;
    maxUses: number | null; useCount: number; revokedAt: Date | null; createdAt: Date;
  },
  orgSlug: string,
): InviteLinkRow {
  return {
    id: link.id,
    token: link.token,
    label: link.label,
    expiresAt: link.expiresAt,
    maxUses: link.maxUses,
    useCount: link.useCount,
    revokedAt: link.revokedAt,
    createdAt: link.createdAt,
    shareUrl: `${originForTenant(orgSlug || null)}/inscripcion/${link.token}`,
  };
}
