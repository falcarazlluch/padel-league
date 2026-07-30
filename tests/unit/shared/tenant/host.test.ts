import { describe, it, expect } from 'vitest';
import { originForTenant, rootDomain, tenantSlugFromHost } from '@/shared/tenant/host';

const PROD = { APP_URL: 'https://mypadelleague.es', ROOT_DOMAIN: 'mypadelleague.es' };
const DERIVED = { APP_URL: 'https://www.mypadelleague.es' };
const DEV = { APP_URL: 'http://localhost:3000', ROOT_DOMAIN: 'localhost' };

describe('rootDomain', () => {
  it('prefers ROOT_DOMAIN when set', () => {
    expect(rootDomain({ ROOT_DOMAIN: 'Example.ES', APP_URL: 'https://other.com' })).toBe('example.es');
  });

  it('derives from APP_URL and strips www', () => {
    expect(rootDomain(DERIVED)).toBe('mypadelleague.es');
  });

  it('strips the port', () => {
    expect(rootDomain({ APP_URL: 'http://localhost:3000' })).toBe('localhost');
  });

  it('falls back to localhost when nothing usable is configured', () => {
    expect(rootDomain({})).toBe('localhost');
    expect(rootDomain({ APP_URL: 'not-a-url' })).toBe('localhost');
  });
});

describe('tenantSlugFromHost', () => {
  it('extracts the tenant from a subdomain', () => {
    expect(tenantSlugFromHost('racc.mypadelleague.es', PROD)).toBe('racc');
  });

  it('is case- and port-insensitive', () => {
    expect(tenantSlugFromHost('RACC.MyPadelLeague.es:443', PROD)).toBe('racc');
  });

  it('treats the apex and www as the public platform', () => {
    expect(tenantSlugFromHost('mypadelleague.es', PROD)).toBeNull();
    expect(tenantSlugFromHost('www.mypadelleague.es', PROD)).toBeNull();
  });

  it('rejects reserved subdomains so they cannot shadow platform hosts', () => {
    expect(tenantSlugFromHost('api.mypadelleague.es', PROD)).toBeNull();
    expect(tenantSlugFromHost('admin.mypadelleague.es', PROD)).toBeNull();
  });

  it('rejects nested subdomains — only a single label is a tenant', () => {
    expect(tenantSlugFromHost('a.b.mypadelleague.es', PROD)).toBeNull();
  });

  it('ignores hosts outside the root domain', () => {
    expect(tenantSlugFromHost('racc.evil.com', PROD)).toBeNull();
  });

  it('treats Vercel preview hosts as the public platform', () => {
    expect(tenantSlugFromHost('padel-league-abc123.vercel.app', PROD)).toBeNull();
  });

  it('rejects labels that are not valid slugs', () => {
    expect(tenantSlugFromHost('-racc.mypadelleague.es', PROD)).toBeNull();
    expect(tenantSlugFromHost('racc-.mypadelleague.es', PROD)).toBeNull();
    expect(tenantSlugFromHost('ra_cc.mypadelleague.es', PROD)).toBeNull();
  });

  it('handles missing/empty hosts', () => {
    expect(tenantSlugFromHost(null, PROD)).toBeNull();
    expect(tenantSlugFromHost(undefined, PROD)).toBeNull();
    expect(tenantSlugFromHost('   ', PROD)).toBeNull();
  });

  it('works on localhost for local development', () => {
    expect(tenantSlugFromHost('racc.localhost:3000', DEV)).toBe('racc');
    expect(tenantSlugFromHost('localhost:3000', DEV)).toBeNull();
  });
});

describe('originForTenant', () => {
  it('returns the public origin for no tenant', () => {
    expect(originForTenant(null, PROD)).toBe('https://mypadelleague.es');
  });

  it('builds the tenant subdomain origin', () => {
    expect(originForTenant('racc', PROD)).toBe('https://racc.mypadelleague.es');
  });

  it('keeps the port in dev so links stay clickable', () => {
    expect(originForTenant('racc', DEV)).toBe('http://racc.localhost:3000');
  });

  it('round-trips with tenantSlugFromHost', () => {
    const origin = originForTenant('racc', PROD);
    const host = new URL(origin).host;
    expect(tenantSlugFromHost(host, PROD)).toBe('racc');
  });
});
