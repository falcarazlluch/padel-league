import { prisma } from '@/shared/db/client';
import {
  AuthorizationError,
  ConflictError,
  DomainError,
  NotFoundError,
} from '@/shared/errors';
import type {
  CreateOrganizationInput,
  OrganizationMemberRow,
  OrganizationSummary,
} from '../domain/types';
import type { OrgMemberRole, Prisma } from '@prisma/client';

/** Slug charset kept in sync with `@/shared/tenant/host`'s SLUG_RE. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Subdomains the platform reserves for itself. */
const RESERVED_SLUGS = new Set([
  'www', 'app', 'api', 'admin', 'static', 'assets', 'cdn', 'mail', 'localhost',
]);

function assertColor(value: string | undefined, field: string): void {
  if (value !== undefined && !HEX_COLOR_RE.test(value)) {
    throw new DomainError('INVALID_COLOR', `${field} debe ser un color hex tipo #0D1E45.`);
  }
}

export const OrganizationService = {
  /** Creating a tenant is a platform-level operation: SUPER_ADMIN only. */
  async create(input: CreateOrganizationInput, actorUserId: string): Promise<{ id: string; slug: string }> {
    await assertPlatformSuperAdmin(actorUserId);

    const slug = input.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      throw new DomainError(
        'INVALID_SLUG',
        'El identificador solo admite minúsculas, números y guiones (2-32 caracteres).',
      );
    }
    if (RESERVED_SLUGS.has(slug)) {
      throw new DomainError('RESERVED_SLUG', `"${slug}" es un subdominio reservado.`);
    }
    const name = input.name.trim();
    if (name.length < 2) {
      throw new DomainError('INVALID_NAME', 'El nombre debe tener al menos 2 caracteres.');
    }
    assertColor(input.primaryColor, 'El color principal');
    assertColor(input.secondaryColor, 'El color secundario');
    assertColor(input.accentColor, 'El color de acento');

    const existing = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (existing) {
      throw new ConflictError('ORG_EXISTS', `Ya existe una organización con el identificador "${slug}".`);
    }

    const org = await prisma.organization.create({
      data: {
        slug,
        name,
        logoUrl: input.logoUrl ?? null,
        ...(input.primaryColor ? { primaryColor: input.primaryColor } : {}),
        ...(input.secondaryColor ? { secondaryColor: input.secondaryColor } : {}),
        ...(input.accentColor ? { accentColor: input.accentColor } : {}),
        contactEmail: input.contactEmail ?? null,
        tagline: input.tagline ?? null,
      },
      select: { id: true, slug: true },
    });
    return org;
  },

  async update(
    organizationId: string,
    actorUserId: string,
    patch: {
      name?: string;
      logoUrl?: string | null;
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      contactEmail?: string | null;
      tagline?: string | null;
      isActive?: boolean;
    },
  ): Promise<void> {
    // Branding is the org admin's business; activating/deactivating a tenant is
    // not — that stays with the platform.
    if (patch.isActive !== undefined) {
      await assertPlatformSuperAdmin(actorUserId);
    } else {
      await OrganizationService.assertOrgAdmin(organizationId, actorUserId);
    }
    assertColor(patch.primaryColor, 'El color principal');
    assertColor(patch.secondaryColor, 'El color secundario');
    assertColor(patch.accentColor, 'El color de acento');
    if (patch.name !== undefined && patch.name.trim().length < 2) {
      throw new DomainError('INVALID_NAME', 'El nombre debe tener al menos 2 caracteres.');
    }

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.logoUrl !== undefined ? { logoUrl: patch.logoUrl } : {}),
        ...(patch.primaryColor !== undefined ? { primaryColor: patch.primaryColor } : {}),
        ...(patch.secondaryColor !== undefined ? { secondaryColor: patch.secondaryColor } : {}),
        ...(patch.accentColor !== undefined ? { accentColor: patch.accentColor } : {}),
        ...(patch.contactEmail !== undefined ? { contactEmail: patch.contactEmail } : {}),
        ...(patch.tagline !== undefined ? { tagline: patch.tagline } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    });
  },

  async list(actorUserId: string): Promise<OrganizationSummary[]> {
    await assertPlatformSuperAdmin(actorUserId);
    const orgs = await prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: true, leagues: true } },
        members: { where: { role: 'ORG_ADMIN' }, select: { id: true } },
      },
    });
    return orgs.map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      logoUrl: o.logoUrl,
      primaryColor: o.primaryColor,
      secondaryColor: o.secondaryColor,
      accentColor: o.accentColor,
      contactEmail: o.contactEmail,
      tagline: o.tagline,
      isActive: o.isActive,
      createdAt: o.createdAt,
      memberCount: o._count.members,
      adminCount: o.members.length,
      competitionCount: o._count.leagues,
    }));
  },

  /** One tenant, same shape as `list()`. Backs the platform's org detail screen. */
  async getSummary(
    organizationId: string,
    actorUserId: string,
  ): Promise<OrganizationSummary | null> {
    await assertPlatformSuperAdmin(actorUserId);
    const o = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: { select: { members: true, leagues: true } },
        members: { where: { role: 'ORG_ADMIN' }, select: { id: true } },
      },
    });
    if (!o) return null;
    return {
      id: o.id,
      slug: o.slug,
      name: o.name,
      logoUrl: o.logoUrl,
      primaryColor: o.primaryColor,
      secondaryColor: o.secondaryColor,
      accentColor: o.accentColor,
      contactEmail: o.contactEmail,
      tagline: o.tagline,
      isActive: o.isActive,
      createdAt: o.createdAt,
      memberCount: o._count.members,
      adminCount: o.members.length,
      competitionCount: o._count.leagues,
    };
  },

  async findBySlug(slug: string) {
    return prisma.organization.findUnique({ where: { slug } });
  },

  // ─── Membresía ──────────────────────────────────────────────────────────

  /**
   * Idempotent join. Called whenever a user enters the tenant through a
   * legitimate door (invite link, partner invite, admin add) — never inferred
   * from merely visiting the subdomain.
   */
  async ensureMember(
    organizationId: string,
    userId: string,
    role: OrgMemberRole = 'ORG_PLAYER',
    tx: Prisma.TransactionClient = prisma,
  ): Promise<void> {
    const existing = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true, role: true },
    });
    if (!existing) {
      await tx.organizationMember.create({ data: { organizationId, userId, role } });
      return;
    }
    // Only ever escalate; a re-entry through a player link must not demote an
    // existing org admin.
    if (existing.role !== 'ORG_ADMIN' && role === 'ORG_ADMIN') {
      await tx.organizationMember.update({ where: { id: existing.id }, data: { role: 'ORG_ADMIN' } });
    }
  },

  async getMembership(organizationId: string, userId: string): Promise<OrgMemberRole | null> {
    const row = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    });
    return row?.role ?? null;
  },

  /**
   * Who is in this tenant, with enough context to act on them: the platform role
   * (so it is obvious a club admin is not a platform admin), the level, and the
   * activity that would be affected by removing them. Counts are scoped to this
   * organization — a member's pairs in another club are none of this club's
   * business.
   */
  async listMembers(organizationId: string, actorUserId: string): Promise<OrganizationMemberRow[]> {
    await OrganizationService.assertOrgAdmin(organizationId, actorUserId);
    const rows = await prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
            category: true,
            anonymizedAt: true,
            deletedAt: true,
            _count: {
              select: {
                teamMemberships: { where: { team: { organizationId } } },
                tournamentEnrollments: {
                  where: { league: { organizationId }, status: { not: 'CANCELLED' } },
                },
              },
            },
          },
        },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
    return rows.map((r) => ({
      userId: r.user.id,
      name: r.user.name,
      email: r.user.email,
      avatarUrl: r.user.avatarUrl,
      role: r.role,
      joinedAt: r.joinedAt,
      platformRole: r.user.role,
      category: r.user.category,
      teamCount: r.user._count.teamMemberships,
      enrollmentCount: r.user._count.tournamentEnrollments,
      inactive: r.user.anonymizedAt !== null || r.user.deletedAt !== null,
    }));
  },

  /** Grant/revoke ORG_ADMIN. Platform SUPER_ADMIN only — an org admin cannot
   *  mint more org admins, which keeps tenant escalation off the table. */
  async setMemberRole(
    organizationId: string,
    userId: string,
    role: OrgMemberRole,
    actorUserId: string,
  ): Promise<void> {
    await assertPlatformSuperAdmin(actorUserId);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, deletedAt: true } });
    if (!user || user.deletedAt) throw new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado.');
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      create: { organizationId, userId, role },
      update: { role },
    });
  },

  async removeMember(organizationId: string, userId: string, actorUserId: string): Promise<void> {
    await assertPlatformSuperAdmin(actorUserId);
    await prisma.organizationMember.deleteMany({ where: { organizationId, userId } });
  },

  // ─── RBAC ───────────────────────────────────────────────────────────────

  /**
   * True when the user may administer this tenant: either a platform
   * SUPER_ADMIN or an ORG_ADMIN of *this* organization. Deliberately does NOT
   * accept a global LEAGUE_ADMIN — that role governs the public platform only.
   */
  async canAdminister(organizationId: string | null, userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role === 'SUPER_ADMIN') return true;
    if (organizationId === null) return user?.role === 'LEAGUE_ADMIN';
    return (await OrganizationService.getMembership(organizationId, userId)) === 'ORG_ADMIN';
  },

  async assertOrgAdmin(organizationId: string, userId: string): Promise<void> {
    if (!(await OrganizationService.canAdminister(organizationId, userId))) {
      throw new AuthorizationError(
        'NOT_ORG_ADMIN',
        'No tienes permisos de administración en esta organización.',
      );
    }
  },

  /**
   * Gate for every tenant-scoped page: the viewer must belong to the tenant
   * they are browsing. SUPER_ADMIN passes so the platform can support tenants.
   */
  async assertCanAccessTenant(organizationId: string | null, userId: string): Promise<void> {
    if (organizationId === null) return;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role === 'SUPER_ADMIN') return;
    const membership = await OrganizationService.getMembership(organizationId, userId);
    if (!membership) {
      throw new AuthorizationError(
        'NOT_ORG_MEMBER',
        'Esta zona es privada de la organización. Pide un enlace de invitación al administrador.',
      );
    }
  },
} as const;

async function assertPlatformSuperAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('FORBIDDEN', 'Solo Super Admin.');
  }
}
