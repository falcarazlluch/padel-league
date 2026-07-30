import { NextResponse, type NextRequest } from 'next/server';
import { ORG_SLUG_HEADER, tenantSlugFromHost } from '@/shared/tenant/host';

// Cookie name — inlined here because src/shared/auth/session.ts imports
// next/headers and prisma, which are not Edge-compatible.
const SESSION_COOKIE = 'padel_session';

// Dev-only tenant override: `?org=racc` sticks in this cookie so you can walk
// the whole whitelabel app on localhost without wildcard DNS. Never honoured in
// production, where the subdomain is the only source of truth.
const ORG_DEV_COOKIE = 'padel_org_dev';

// Routes that require authentication. The page-level layout in (app)/ also
// validates the session (defence in depth) but middleware is the cheap gate
// that avoids hitting the DB for unauthenticated visitors.
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/perfil',
  '/admin',
  '/jugar',
  '/equipos',
  '/ligas',
  '/partidos',
  '/resultados',
  '/invitar',
  '/notificaciones',
];
// Routes that redirect to dashboard if already authenticated
const AUTH_ROUTES = ['/login', '/recuperar-password'];

// `/inscripcion/**` and `/pareja/**` are deliberately NOT protected: an invited
// player must be able to see what they're being invited to before deciding to
// register. The pages themselves branch on session presence.

function resolveTenantSlug(request: NextRequest): string | null {
  const fromHost = tenantSlugFromHost(request.headers.get('host'));
  if (fromHost) return fromHost;
  if (process.env.NODE_ENV === 'production') return null;
  const fromQuery = request.nextUrl.searchParams.get('org');
  if (fromQuery !== null) return fromQuery.trim() || null;
  return request.cookies.get(ORG_DEV_COOKIE)?.value ?? null;
}

export function middleware(request: NextRequest): NextResponse {
  const requestId = crypto.randomUUID();
  const pathname = request.nextUrl.pathname;
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const orgSlug = resolveTenantSlug(request);

  // Forward the resolved tenant to server components as a request header. An
  // empty string is stamped for the public platform so `getTenant` can tell
  // "middleware ran and found no tenant" from "no middleware" and skip the
  // Host re-parse.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ORG_SLUG_HEADER, orgSlug ?? '');

  const withTenant = (res: NextResponse): NextResponse => {
    res.headers.set('x-request-id', requestId);
    if (process.env.NODE_ENV !== 'production') {
      const devOverride = request.nextUrl.searchParams.get('org');
      if (devOverride !== null) {
        if (devOverride.trim()) {
          res.cookies.set(ORG_DEV_COOKIE, devOverride.trim(), { path: '/', sameSite: 'lax' });
        } else {
          res.cookies.delete(ORG_DEV_COOKIE);
        }
      }
    }
    return res;
  };

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  if (isProtected && !sessionToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return withTenant(NextResponse.redirect(loginUrl));
  }

  if (isAuthRoute && sessionToken) {
    // Preserve `next` so a logged-in user who lands on /login from an
    // inscription link is delivered to the wizard, not the dashboard.
    const next = request.nextUrl.searchParams.get('next');
    const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
    return withTenant(NextResponse.redirect(new URL(target, request.url)));
  }

  return withTenant(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|aviso-legal|privacidad|cookies).*)',
  ],
};
