import { randomBytes } from 'node:crypto';
import { prisma } from '@/shared/db/client';
import { DomainError, NotFoundError } from '@/shared/errors';
import { originForTenant } from '@/shared/tenant/host';
import type { InviteLinkPreview, OpenCompetitionSummary } from '../domain/types';
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
  /**
   * Generates a shareable inscription link. Pass `leagueId` for a link straight
   * into one competition, or `organizationId` for the organization-wide link
   * that admins hand out once and reuse all season.
   *
   * The link always lives on the tenant's own origin so the whole journey
   * (landing → login/registro → wizard) stays inside the whitelabel shell.
   */
  async create(
    input: {
      leagueId?: string;
      organizationId?: string;
      label?: string | null;
      expiresAt?: Date | null;
      maxUses?: number | null;
    },
    actorUserId: string,
  ): Promise<InviteLinkRow> {
    if (!input.leagueId && !input.organizationId) {
      throw new DomainError(
        'TARGET_REQUIRED',
        'Indica la competición o la organización a la que apunta el enlace.',
      );
    }
    if (input.maxUses != null && input.maxUses < 1) {
      throw new DomainError('INVALID_MAX_USES', 'El número máximo de usos debe ser 1 o más.');
    }
    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
      throw new DomainError('INVALID_EXPIRY', 'La fecha de caducidad debe ser futura.');
    }

    let organizationId: string;
    let leagueId: string | null = null;
    // Default expiry differs by kind: a competition link dies with its
    // registration window; an organization link has no window to inherit, so it
    // only ends when the admin revokes it.
    let defaultExpiry: Date | null = null;

    if (input.leagueId) {
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
      organizationId = league.organizationId;
      leagueId = league.id;
      defaultExpiry = league.registrationEnd;
    } else {
      const org = await prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { id: true },
      });
      if (!org) throw new NotFoundError('ORG_NOT_FOUND', 'Organización no encontrada.');
      organizationId = org.id;
    }

    await OrganizationService.assertOrgAdmin(organizationId, actorUserId);

    const link = await prisma.tournamentInviteLink.create({
      data: {
        token: newToken(),
        leagueId,
        organizationId,
        label: input.label?.trim() || null,
        expiresAt: input.expiresAt ?? defaultExpiry,
        maxUses: input.maxUses ?? null,
        createdByUserId: actorUserId,
      },
    });
    return toRow(link, await orgSlugFor(organizationId));
  },

  /** Organization-wide links of a tenant (the ones with no competition). */
  async listForOrganization(organizationId: string, actorUserId: string): Promise<InviteLinkRow[]> {
    await OrganizationService.assertOrgAdmin(organizationId, actorUserId);
    const [links, slug] = await Promise.all([
      prisma.tournamentInviteLink.findMany({
        where: { organizationId, leagueId: null },
        orderBy: { createdAt: 'desc' },
      }),
      orgSlugFor(organizationId),
    ]);
    return links.map((l) => toRow(l, slug));
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
   * Resolves a token into everything the landing page needs, for both link
   * kinds. Returns `null` only when the token does not exist at all -- every
   * other problem comes back as a populated `blockedReason` so the visitor gets
   * a specific explanation instead of a 404.
   *
   * `viewerUserId` is optional: when known, each open competition is annotated
   * with whether that user is already enrolled, so the picker never offers a
   * dead end.
   */
  async preview(
    token: string,
    now: Date = new Date(),
    viewerUserId?: string,
  ): Promise<InviteLinkPreview | null> {
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
      },
    });
    if (!link || !link.organization.isActive) return null;

    const organization = {
      id: link.organization.id,
      slug: link.organization.slug,
      name: link.organization.name,
      logoUrl: link.organization.logoUrl,
      tagline: link.organization.tagline,
    };

    // Organization-wide link: join the tenant, then choose a competition.
    if (link.leagueId === null) {
      const open = await listOpenCompetitions(link.organizationId, now, viewerUserId);
      const linkBlocked = linkOnlyBlockedReason(link, now);
      return {
        kind: 'ORGANIZATION',
        linkId: link.id,
        token: link.token,
        organization,
        competition: null,
        openCompetitions: open,
        // A tenant with nothing open is not a broken link -- say so precisely.
        blockedReason: linkBlocked ?? (open.length === 0 ? 'NO_OPEN_COMPETITIONS' : null),
      };
    }

    // Single-competition link.
    const league = link.league!;
    const registeredCount = await prisma.leagueRegistration.count({
      where: { leagueId: league.id, withdrawnAt: null },
    });
    return {
      kind: 'COMPETITION',
      linkId: link.id,
      token: link.token,
      organization,
      competition: {
        id: league.id,
        slug: league.slug,
        name: league.name,
        description: league.description,
        type: league.type,
        category: league.category,
        registrationStart: league.registrationStart,
        registrationEnd: league.registrationEnd,
        startDate: league.startDate,
        endDate: league.endDate,
        registeredCount,
      },
      openCompetitions: [],
      blockedReason: linkOnlyBlockedReason(link, now) ?? competitionBlockedReason(league, now),
    };
  },

  /**
   * Validates a token for actual use. `leagueId` is null for an organization
   * link -- the caller then picks a competition itself.
   */
  async resolveForEnrollment(
    token: string,
    now: Date = new Date(),
  ): Promise<{ linkId: string; leagueId: string | null; organizationId: string }> {
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
    const blocked =
      linkOnlyBlockedReason(link, now) ??
      (link.league ? competitionBlockedReason(link.league, now) : null);
    if (blocked) {
      throw new DomainError(blocked, BLOCKED_MESSAGE[blocked]);
    }
    return { linkId: link.id, leagueId: link.leagueId, organizationId: link.organizationId };
  },

  /**
   * Organization link entry point: joins the tenant so the player can then
   * browse and enrol. Idempotent, and only counts a use the first time.
   */
  async joinOrganization(token: string, userId: string): Promise<{ organizationId: string }> {
    const { linkId, organizationId } = await InviteLinkService.resolveForEnrollment(token);
    const already = await OrganizationService.getMembership(organizationId, userId);
    await OrganizationService.ensureMember(organizationId, userId);
    if (!already) await InviteLinkService.recordUse(linkId);
    return { organizationId };
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
  NO_OPEN_COMPETITIONS:
    'Ahora mismo no hay ninguna competición con la inscripción abierta. Guarda este enlace: te servirá cuando el club abra la siguiente.',
};

/** Problems with the link itself -- apply to both kinds. */
function linkOnlyBlockedReason(
  link: { revokedAt: Date | null; expiresAt: Date | null; maxUses: number | null; useCount: number },
  now: Date,
): InviteLinkPreview['blockedReason'] {
  if (link.revokedAt) return 'REVOKED';
  if (link.expiresAt && link.expiresAt.getTime() < now.getTime()) return 'EXPIRED';
  if (link.maxUses != null && link.useCount >= link.maxUses) return 'MAX_USES_REACHED';
  return null;
}

/** Problems with the target competition -- only apply to competition links. */
function competitionBlockedReason(
  league: { status: string; registrationStart: Date; registrationEnd: Date },
  now: Date,
): InviteLinkPreview['blockedReason'] {
  if (league.status !== 'DRAFT') return 'COMPETITION_STARTED';
  if (now.getTime() < league.registrationStart.getTime()) return 'REGISTRATION_NOT_OPEN_YET';
  if (now.getTime() > league.registrationEnd.getTime()) return 'REGISTRATION_CLOSED';
  return null;
}

/**
 * Competitions of a tenant that are currently taking entries -- the menu an
 * organization link opens onto.
 */
async function listOpenCompetitions(
  organizationId: string,
  now: Date,
  viewerUserId?: string,
): Promise<OpenCompetitionSummary[]> {
  const leagues = await prisma.league.findMany({
    where: {
      organizationId,
      status: 'DRAFT',
      registrationStart: { lte: now },
      registrationEnd: { gte: now },
    },
    orderBy: { registrationEnd: 'asc' },
    include: {
      _count: { select: { registrations: { where: { withdrawnAt: null } } } },
      enrollments: viewerUserId
        ? { where: { userId: viewerUserId, status: { not: 'CANCELLED' } }, select: { id: true } }
        : false,
    },
  });
  return leagues.map((l) => ({
    id: l.id,
    slug: l.slug,
    name: l.name,
    type: l.type,
    category: l.category,
    registrationEnd: l.registrationEnd,
    startDate: l.startDate,
    endDate: l.endDate,
    registeredCount: l._count.registrations,
    alreadyEnrolled: Array.isArray(l.enrollments) ? l.enrollments.length > 0 : false,
  }));
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
