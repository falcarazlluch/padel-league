// Host → tenant slug. Kept dependency-free (no next/headers, no prisma) so the
// Edge middleware can import it as-is.

/** Header the middleware stamps with the resolved tenant slug ('' = public). */
export const ORG_SLUG_HEADER = 'x-org-slug';

/**
 * Subdomains that are never tenants: the apex site, its `www` alias, Vercel
 * preview hosts and local dev. Anything else on `<sub>.<root>` is looked up as
 * an Organization slug.
 */
const RESERVED_SUBDOMAINS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'static',
  'assets',
  'cdn',
  'mail',
  'localhost',
]);

/**
 * Root domain the tenants hang off, e.g. `mypadelleague.es`. Read from
 * ROOT_DOMAIN when set; otherwise derived from APP_URL so a single-env setup
 * keeps working. Falls back to `localhost` in dev.
 */
export function rootDomain(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.ROOT_DOMAIN?.trim();
  if (explicit) return stripPort(explicit.toLowerCase());
  const appUrl = env.APP_URL?.trim();
  if (appUrl) {
    try {
      return stripPort(new URL(appUrl).hostname.toLowerCase()).replace(/^www\./, '');
    } catch {
      /* fall through */
    }
  }
  return 'localhost';
}

function stripPort(host: string): string {
  // IPv6 literals arrive bracketed (`[::1]:3000`); everything else is host:port.
  const withoutBrackets = host.replace(/^\[(.+)\]$/, '$1');
  const lastColon = withoutBrackets.lastIndexOf(':');
  if (lastColon === -1) return withoutBrackets;
  const maybePort = withoutBrackets.slice(lastColon + 1);
  return /^\d+$/.test(maybePort) ? withoutBrackets.slice(0, lastColon) : withoutBrackets;
}

/** Slug charset accepted for a tenant — matches what OrganizationService allows. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/**
 * Extracts the tenant slug from a Host header. Returns `null` for the public
 * platform (apex, www, unknown-shaped hosts, Vercel preview URLs).
 *
 * `racc.mypadelleague.es`     → 'racc'
 * `racc.localhost:3000`       → 'racc'   (local dev)
 * `mypadelleague.es`          → null
 * `padel-league-xyz.vercel.app` → null   (preview deploys are the public app)
 */
export function tenantSlugFromHost(
  host: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (!host) return null;
  const hostname = stripPort(host.trim().toLowerCase());
  if (!hostname) return null;

  // Vercel preview/production `*.vercel.app` hosts have no tenant subdomain of
  // their own — the label before `.vercel.app` is the deployment name.
  if (hostname.endsWith('.vercel.app')) return null;

  const root = rootDomain(env);
  if (hostname === root || hostname === `www.${root}`) return null;

  const suffix = `.${root}`;
  if (!hostname.endsWith(suffix)) return null;

  const label = hostname.slice(0, -suffix.length);
  // Only a single label is a tenant; `a.b.root` is not.
  if (label.includes('.')) return null;
  if (RESERVED_SUBDOMAINS.has(label)) return null;
  if (!SLUG_RE.test(label)) return null;

  return label;
}

/** Absolute origin for a tenant (or the public app when slug is null). */
export function originForTenant(
  slug: string | null,
  env: Record<string, string | undefined> = process.env,
): string {
  const appUrl = env.APP_URL?.trim() ?? 'http://localhost:3000';
  let base: URL;
  try {
    base = new URL(appUrl);
  } catch {
    base = new URL('http://localhost:3000');
  }
  if (!slug) return base.origin;

  const root = rootDomain(env);
  const port = base.port ? `:${base.port}` : '';
  return `${base.protocol}//${slug}.${root}${port}`;
}
