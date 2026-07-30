import { cache } from 'react';
import { headers } from 'next/headers';
import { prisma } from '@/shared/db/client';
import { ORG_SLUG_HEADER, originForTenant, tenantSlugFromHost } from './host';

/**
 * The active tenant for the current request. `null` means the public platform
 * (mypadelleague.es) — the tenant whose rows carry `organization_id IS NULL`.
 */
export interface TenantContext {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  contactEmail: string | null;
  tagline: string | null;
}

/**
 * Resolves the tenant from the request. The middleware stamps
 * `x-org-slug`; we fall back to parsing the Host header directly so route
 * handlers excluded from the middleware matcher (everything under /api) still
 * resolve their tenant.
 *
 * Wrapped in React `cache` so the many server components in one render share a
 * single DB round-trip.
 *
 * An organization with `isActive = false` resolves to `null` — the subdomain
 * then behaves like the public app rather than leaking a disabled tenant.
 */
export const getTenant = cache(async (): Promise<TenantContext | null> => {
  const headerStore = await headers();
  const stamped = headerStore.get(ORG_SLUG_HEADER);
  const slug = stamped !== null
    ? (stamped.trim() || null)
    : tenantSlugFromHost(headerStore.get('host'));
  if (!slug) return null;

  const org = await prisma.organization.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      contactEmail: true,
      tagline: true,
    },
  });
  return org;
});

/** `organizationId` to filter every tenant-owned query by. */
export async function getTenantId(): Promise<string | null> {
  return (await getTenant())?.id ?? null;
}

/** Absolute origin of the current tenant — use it to build shareable links. */
export async function getTenantOrigin(): Promise<string> {
  const tenant = await getTenant();
  return originForTenant(tenant?.slug ?? null);
}
