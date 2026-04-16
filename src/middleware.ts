import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

// Cookie name — inlined here because src/shared/auth/session.ts imports
// next/headers and prisma, which are not Edge-compatible.
const SESSION_COOKIE = 'padel_session';

// Routes that require authentication
const PROTECTED_PREFIXES = ['/dashboard', '/perfil', '/admin'];
// Routes that redirect to dashboard if already authenticated
const AUTH_ROUTES = ['/login', '/recuperar-password'];

export function middleware(request: NextRequest): NextResponse {
  const requestId = randomUUID();
  const response = NextResponse.next();
  response.headers.set('x-request-id', requestId);

  const pathname = request.nextUrl.pathname;
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  if (isProtected && !sessionToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && sessionToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|aviso-legal|privacidad|cookies).*)',
  ],
};
