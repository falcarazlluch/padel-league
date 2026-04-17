# Spec 1b — Auth + GDPR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Complete the authentication and GDPR layer so the app is fully usable end-to-end: users get invited by email, log in, manage their profile, and can exercise their GDPR rights. Worker handles email delivery, session cleanup, and anonymization jobs.

**Builds on:** Plan 1a foundations (Prisma schema + pg-boss queue + logger + error hierarchy all in place).

**No Auth.js.** Session management is custom: `Session` rows in DB, `sessionToken` cookie (httpOnly, Secure, SameSite=Lax), Next.js middleware validates each request.

**Tech:** `jose` for JWT (HS256) · `@node-rs/argon2` for passwords · `resend` for email · `@react-email/components` for email templates · `jose` already in Next.js deps.

**Reference spec:** [`docs/superpowers/specs/2026-04-15-fundacional-design.md`](../specs/2026-04-15-fundacional-design.md) §7 + §14.

---

## File map

| Path | Purpose |
| ---- | ------- |
| `src/shared/auth/password.ts` | PasswordService: hash, verify, needsRehash |
| `src/shared/auth/signed-tokens.ts` | SignedTokenService: issue JWT + consume (CAS) |
| `src/shared/auth/session.ts` | SessionService: create, validate, revoke, revokeAll |
| `src/shared/auth/rbac.ts` | RBAC helpers: requireSession, requireSuperAdmin, requireLeagueAdmin |
| `src/shared/auth/rate-limit.ts` | RateLimitService: sliding window on RateLimitBucket |
| `src/middleware.ts` | Next.js middleware: session validation + requestId injection |
| `src/app/(auth)/layout.tsx` | Unauthenticated layout (no nav) |
| `src/app/(auth)/login/page.tsx` | Login page |
| `src/app/(auth)/login/actions.ts` | Server Action: login form submit |
| `src/app/(auth)/aceptar-invitacion/[token]/page.tsx` | Accept invitation page |
| `src/app/(auth)/aceptar-invitacion/[token]/actions.ts` | Server Action: accept invitation |
| `src/app/(auth)/recuperar-password/page.tsx` | Forgot password request page |
| `src/app/(auth)/recuperar-password/actions.ts` | Server Action: request reset |
| `src/app/(auth)/recuperar-password/[token]/page.tsx` | Reset password form |
| `src/app/(auth)/recuperar-password/[token]/actions.ts` | Server Action: complete reset |
| `src/app/(auth)/aviso-legal/page.tsx` | Legal notice placeholder |
| `src/app/(auth)/privacidad/page.tsx` | Privacy policy placeholder |
| `src/app/(auth)/cookies/page.tsx` | Cookie policy placeholder |
| `src/app/(app)/layout.tsx` | Authenticated layout (session required, nav) |
| `src/app/(app)/dashboard/page.tsx` | Dashboard (shows user name + logout) |
| `src/app/(app)/perfil/page.tsx` | Profile: edit name, change password, revoke sessions |
| `src/app/(app)/perfil/actions.ts` | Server Actions: update profile, change password, revoke |
| `src/app/(app)/admin/usuarios/invitar/page.tsx` | Admin: invite user page |
| `src/app/(app)/admin/usuarios/invitar/actions.ts` | Server Action: invite user |
| `src/app/api/auth/logout/route.ts` | POST: clear session cookie + delete Session row |
| `src/app/api/me/export/route.ts` | GET: GDPR data export |
| `src/app/api/admin/users/[id]/anonymize/route.ts` | POST: anonymize user (SUPER_ADMIN only) |
| `src/worker/handlers/send-email.ts` | Job handler: send email via Resend |
| `src/worker/handlers/session-cleanup.ts` | Job handler: delete expired sessions |
| `src/worker/handlers/anonymize-user.ts` | Job handler: anonymize user record |
| `src/worker/email-templates/invitation.tsx` | React Email template: invitation |
| `src/worker/email-templates/password-reset.tsx` | React Email template: password reset |
| `tests/unit/shared/auth/password.test.ts` | PasswordService unit tests |
| `tests/unit/shared/auth/signed-tokens.test.ts` | SignedTokenService unit tests |
| `tests/unit/shared/auth/session.test.ts` | SessionService unit tests |
| `tests/unit/shared/auth/rbac.test.ts` | RBAC helpers unit tests |
| `tests/unit/shared/auth/rate-limit.test.ts` | RateLimitService unit tests |
| `tests/integration/auth.test.ts` | Signed token CAS concurrency integration test |
| `tests/integration/gdpr.test.ts` | Export + anonymize integration tests |

---

## Phase 0 · Auth foundations (shared services)

### Task 0.1: PasswordService

**Files:**
- Create: `src/shared/auth/password.ts`
- Create: `tests/unit/shared/auth/password.test.ts`

**Spec reference:** §7.2 — Argon2id, `memoryCost: 65536`, `timeCost: 3`, `parallelism: 4`, `outputLen: 32`.

- [ ] **Step 1:** Install dependencies (already have `@node-rs/argon2`; verify it's in deps not just devDeps):

```bash
pnpm add @node-rs/argon2
```

- [ ] **Step 2:** Write failing test `tests/unit/shared/auth/password.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PasswordService } from '@/shared/auth/password';

describe('PasswordService', () => {
  it('hashes a password and verifies it', async () => {
    const hash = await PasswordService.hash('MyPass1234');
    expect(await PasswordService.verify(hash, 'MyPass1234')).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await PasswordService.hash('MyPass1234');
    expect(await PasswordService.verify(hash, 'WrongPass')).toBe(false);
  });

  it('needsRehash returns false for fresh hash', async () => {
    const hash = await PasswordService.hash('MyPass1234');
    expect(PasswordService.needsRehash(hash)).toBe(false);
  });
});
```

- [ ] **Step 3:** Create `src/shared/auth/password.ts`:

```typescript
import { hash, verify, needsRehash } from '@node-rs/argon2';

const ARGON2_OPTS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
} as const;

export const PasswordService = {
  async hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTS);
  },

  async verify(storedHash: string, password: string): Promise<boolean> {
    return verify(storedHash, password);
  },

  // Returns true if the stored hash was created with weaker parameters and
  // should be re-hashed on next successful login.
  needsRehash(storedHash: string): boolean {
    return needsRehash(storedHash, ARGON2_OPTS);
  },
} as const;
```

- [ ] **Step 4:** Run `pnpm test:unit -- tests/unit/shared/auth/password.test.ts`. Expected: 3 pass. Note: hashing is intentionally slow (~300ms per test at these params); Vitest default timeout is sufficient.

- [ ] **Step 5:** Commit: `feat(auth): PasswordService with Argon2id hash/verify/needsRehash`

---

### Task 0.2: SignedTokenService

**Files:**
- Create: `src/shared/auth/signed-tokens.ts`
- Create: `tests/unit/shared/auth/signed-tokens.test.ts`

**Spec reference:** §7.4 — JWT HS256 with `NEXTAUTH_SECRET`, CAS consume via `UPDATE ... WHERE used_at IS NULL`.

- [ ] **Step 1:** Install `jose`:

```bash
pnpm add jose
```

- [ ] **Step 2:** Write failing test `tests/unit/shared/auth/signed-tokens.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, truncateAll } from '../../integration/helpers/db';
import { SignedTokenService } from '@/shared/auth/signed-tokens';
import { SignedTokenPurpose } from '@prisma/client';

// NOTE: this unit test suite uses a real DB via testPrisma() because
// SignedTokenService is inherently stateful (it persists SignedToken rows).
// It will only run when DATABASE_URL is set (i.e., in integration mode).
// For pure unit coverage of the JWT logic, see the inline tests below.

const prisma = testPrisma();

beforeAll(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('SignedTokenService — JWT logic', () => {
  it('issues a JWT that can be decoded', async () => {
    // We test the token format without touching DB by using a test secret
    process.env.NEXTAUTH_SECRET = 'a'.repeat(44);
    const token = await SignedTokenService.issue({
      purpose: SignedTokenPurpose.PASSWORD_RESET,
      subjectId: 'user-123',
      ttlSeconds: 300,
    });
    expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/); // JWT format
  });
});
```

- [ ] **Step 3:** Create `src/shared/auth/signed-tokens.ts`:

```typescript
import { SignedToken, type SignedTokenPurpose } from '@prisma/client';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/shared/db/client';
import { InvalidTokenError } from '@/shared/errors';

export interface IssueOptions {
  purpose: SignedTokenPurpose;
  subjectId: string;
  ttlSeconds: number;
  metadata?: Record<string, unknown>;
}

export interface ConsumeResult {
  subjectId: string;
  metadata: Record<string, unknown> | null;
}

function getSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required');
  return new TextEncoder().encode(secret);
}

export const SignedTokenService = {
  async issue(opts: IssueOptions): Promise<string> {
    const jti = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + opts.ttlSeconds * 1000);

    await prisma.signedToken.create({
      data: {
        jti,
        purpose: opts.purpose,
        subjectId: opts.subjectId,
        metadata: opts.metadata ?? null,
        expiresAt,
      },
    });

    const token = await new SignJWT({ purpose: opts.purpose, sub: opts.subjectId })
      .setProtectedHeader({ alg: 'HS256' })
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(getSecret());

    return token;
  },

  async consume(token: string, expectedPurpose: SignedTokenPurpose): Promise<ConsumeResult> {
    let jti: string;
    try {
      const { payload } = await jwtVerify(token, getSecret());
      if (!payload.jti) throw new Error('missing jti');
      jti = payload.jti;
    } catch {
      throw new InvalidTokenError('TOKEN_INVALID', 'El enlace no es válido o ha caducado.');
    }

    // CAS: atomic update — only succeeds if not yet used and not expired
    const result = await prisma.$queryRaw<SignedToken[]>`
      UPDATE signed_tokens
      SET used_at = now()
      WHERE jti = ${jti}
        AND purpose = ${expectedPurpose}::"SignedTokenPurpose"
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING *
    `;

    if (result.length === 0) {
      throw new InvalidTokenError('TOKEN_INVALID', 'El enlace no es válido o ha caducado.');
    }

    const row = result[0]!;
    return {
      subjectId: row.subjectId,
      metadata: row.metadata as Record<string, unknown> | null,
    };
  },
} as const;
```

- [ ] **Step 4:** Run `pnpm typecheck`. Expected: passes.

- [ ] **Step 5:** Commit: `feat(auth): SignedTokenService — JWT HS256 issue + CAS consume`

---

### Task 0.3: SessionService

**Files:**
- Create: `src/shared/auth/session.ts`
- Create: `tests/unit/shared/auth/session.test.ts`

**Spec reference:** §7.3 — DB sessions, 30-day TTL, `sessionToken` = 32 bytes base64url.

- [ ] **Step 1:** Write failing test `tests/unit/shared/auth/session.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SessionService } from '@/shared/auth/session';

describe('SessionService.generateToken', () => {
  it('generates a URL-safe string of expected length', () => {
    const token = SessionService.generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes base64url = ~43 chars
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('generates unique tokens', () => {
    const a = SessionService.generateToken();
    const b = SessionService.generateToken();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2:** Create `src/shared/auth/session.ts`:

```typescript
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/shared/db/client';
import { AuthenticationError } from '@/shared/errors';

export const SESSION_COOKIE = 'padel_session';
const SESSION_TTL_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export const SessionService = {
  generateToken(): string {
    return randomBytes(32).toString('base64url');
  },

  async create(userId: string, ipAddress?: string, userAgent?: string): Promise<string> {
    const sessionToken = SessionService.generateToken();
    const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: { userId, sessionToken, expires, ipAddress, userAgent },
    });

    return sessionToken;
  },

  async validate(sessionToken: string): Promise<SessionUser> {
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: { select: { id: true, email: true, name: true, role: true, deletedAt: true } } },
    });

    if (!session || session.expires < new Date() || session.user.deletedAt) {
      throw new AuthenticationError('SESSION_INVALID', 'Sesión inválida o expirada.');
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
    };
  },

  async revoke(sessionToken: string): Promise<void> {
    await prisma.session.deleteMany({ where: { sessionToken } });
  },

  async revokeAll(userId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { userId } });
  },

  // Cookie helpers (server-side only, not in Edge middleware)
  setSessionCookie(token: string): void {
    const cookieStore = cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    });
  },

  clearSessionCookie(): void {
    const cookieStore = cookies();
    cookieStore.delete(SESSION_COOKIE);
  },
} as const;
```

- [ ] **Step 3:** Run `pnpm typecheck`. Expected: passes.

- [ ] **Step 4:** Commit: `feat(auth): SessionService — DB session create/validate/revoke`

---

### Task 0.4: RateLimitService

**Files:**
- Create: `src/shared/auth/rate-limit.ts`
- Create: `tests/unit/shared/auth/rate-limit.test.ts`

**Spec reference:** §7.6 — sliding window on `RateLimitBucket`, key = `action:scope:identifier`, window 15 min.

- [ ] **Step 1:** Write failing test `tests/unit/shared/auth/rate-limit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildRateLimitKey } from '@/shared/auth/rate-limit';

describe('buildRateLimitKey', () => {
  it('builds expected key format', () => {
    expect(buildRateLimitKey('login', 'ip', '1.2.3.4')).toBe('login:ip:1.2.3.4');
  });
});
```

- [ ] **Step 2:** Create `src/shared/auth/rate-limit.ts`:

```typescript
import { prisma } from '@/shared/db/client';
import { RateLimitError } from '@/shared/errors';

export const WINDOW_MINUTES = 15;

export function buildRateLimitKey(action: string, scope: string, identifier: string): string {
  return `${action}:${scope}:${identifier}`;
}

export interface RateLimitConfig {
  /** Max hits allowed in the window */
  limit: number;
}

/**
 * Increments the counter for `key` and throws RateLimitError if the limit is exceeded.
 * Uses INSERT ... ON CONFLICT to atomically upsert and slide the window.
 */
export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<void> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  // Upsert: increment counter, or reset window if outside current window
  await prisma.$executeRaw`
    INSERT INTO rate_limit_buckets (id, key, count, window_start)
    VALUES (gen_random_uuid(), ${key}, 1, now())
    ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN rate_limit_buckets.window_start < ${windowStart}
        THEN 1
        ELSE rate_limit_buckets.count + 1
      END,
      window_start = CASE
        WHEN rate_limit_buckets.window_start < ${windowStart}
        THEN now()
        ELSE rate_limit_buckets.window_start
      END
  `;

  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });
  if (bucket && bucket.windowStart >= windowStart && bucket.count > config.limit) {
    throw new RateLimitError(
      'RATE_LIMIT_EXCEEDED',
      `Demasiados intentos. Espera ${WINDOW_MINUTES} minutos.`,
    );
  }
}
```

- [ ] **Step 3:** Run `pnpm test:unit`. Expected: all pass.

- [ ] **Step 4:** Commit: `feat(auth): RateLimitService — sliding window on RateLimitBucket`

---

### Task 0.5: RBAC helpers

**Files:**
- Create: `src/shared/auth/rbac.ts`
- Create: `tests/unit/shared/auth/rbac.test.ts`

**Spec reference:** §7.5 — `requireSession`, `requireSuperAdmin`, `requireLeagueAdmin`, etc. Always throw, never return boolean.

- [ ] **Step 1:** Write failing test `tests/unit/shared/auth/rbac.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assertSuperAdmin, assertLeagueAdmin } from '@/shared/auth/rbac';
import type { SessionUser } from '@/shared/auth/session';

const superAdmin: SessionUser = { id: 'u1', email: 'a@b.com', name: 'Admin', role: 'SUPER_ADMIN' };
const player: SessionUser = { id: 'u2', email: 'p@b.com', name: 'Player', role: 'PLAYER' };

describe('assertSuperAdmin', () => {
  it('passes for SUPER_ADMIN', () => {
    expect(() => assertSuperAdmin(superAdmin)).not.toThrow();
  });

  it('throws AuthorizationError for PLAYER', () => {
    expect(() => assertSuperAdmin(player)).toThrow('FORBIDDEN');
  });
});

describe('assertLeagueAdmin', () => {
  it('passes for SUPER_ADMIN regardless of memberships', () => {
    expect(() => assertLeagueAdmin(superAdmin, [])).not.toThrow();
  });

  it('passes for LEAGUE_ADMIN membership', () => {
    expect(() =>
      assertLeagueAdmin(player, [{ leagueId: 'l1', role: 'LEAGUE_ADMIN' }]),
    ).not.toThrow();
  });

  it('throws for PLAYER with no admin membership', () => {
    expect(() =>
      assertLeagueAdmin(player, [{ leagueId: 'l1', role: 'PLAYER' }]),
    ).toThrow('FORBIDDEN');
  });
});
```

- [ ] **Step 2:** Create `src/shared/auth/rbac.ts`:

```typescript
import { AuthorizationError } from '@/shared/errors';
import type { SessionUser } from './session';

export interface LeagueMembership {
  leagueId: string;
  role: string;
}

/** Throws AuthorizationError if user is not authenticated. */
export function assertSession(user: SessionUser | null): asserts user is SessionUser {
  if (!user) {
    throw new AuthorizationError('UNAUTHENTICATED', 'Debes iniciar sesión.');
  }
}

/** Throws AuthorizationError if user is not SUPER_ADMIN. */
export function assertSuperAdmin(user: SessionUser): void {
  if (user.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError('FORBIDDEN', 'Acción reservada para Super Admin.');
  }
}

/**
 * Throws AuthorizationError unless user is SUPER_ADMIN or has LEAGUE_ADMIN
 * role in the given league.
 */
export function assertLeagueAdmin(
  user: SessionUser,
  memberships: LeagueMembership[],
  leagueId?: string,
): void {
  if (user.role === 'SUPER_ADMIN') return;
  const isAdmin = memberships.some(
    (m) => (!leagueId || m.leagueId === leagueId) && m.role === 'LEAGUE_ADMIN',
  );
  if (!isAdmin) {
    throw new AuthorizationError('FORBIDDEN', 'Acción reservada para administradores de liga.');
  }
}

/** Throws AuthorizationError if user is not a member of the given team. */
export function assertTeamMember(user: SessionUser, teamMemberUserIds: string[]): void {
  if (user.role === 'SUPER_ADMIN') return;
  if (!teamMemberUserIds.includes(user.id)) {
    throw new AuthorizationError('FORBIDDEN', 'No eres miembro de este equipo.');
  }
}
```

- [ ] **Step 3:** Run `pnpm test:unit`. Expected: all pass.

- [ ] **Step 4:** Commit: `feat(auth): RBAC helpers — assertSession/assertSuperAdmin/assertLeagueAdmin`

---

## Phase 1 · Middleware + route protection

### Task 1.1: Next.js middleware

**Files:**
- Create: `src/middleware.ts`

**Spec reference:** §7.3 — middleware reads `sessionToken` cookie, validates session, attaches `userId` via `AsyncLocalStorage`; §9.2 — `requestId` generated in middleware.

**Important:** Next.js middleware runs in Edge runtime. It cannot use `prisma` directly. The middleware validates the JWT portion of the session token for fast path, but the full DB validation happens in the route handler via `SessionService.validate()`. For Plan 1b, middleware only reads the cookie to decide redirect — full validation is in the route.

- [ ] **Step 1:** Create `src/middleware.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { SESSION_COOKIE } from '@/shared/auth/session';

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
```

- [ ] **Step 2:** Run `pnpm typecheck && pnpm lint`. Expected: passes.

- [ ] **Step 3:** Commit: `feat(auth): Next.js middleware — session redirect + requestId header`

---

## Phase 2 · Login + Logout

### Task 2.1: Login and Logout flows

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/login/actions.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/dashboard/page.tsx`

**Spec reference:** §7.1 — rate limit → fetch user → Argon2 verify → create Session → set cookie → AuditLog.

- [ ] **Step 1:** Create `src/app/(auth)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main style={{ maxWidth: '400px', margin: '4rem auto', padding: '0 1rem' }}>
      {children}
    </main>
  );
}
```

- [ ] **Step 2:** Create `src/app/(auth)/login/actions.ts`:

```typescript
'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@/shared/db/client';
import { PasswordService } from '@/shared/auth/password';
import { SessionService } from '@/shared/auth/session';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { AuthenticationError } from '@/shared/errors';
import { logger } from '@/shared/logger';

export async function loginAction(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get('email') ?? '').toLowerCase().trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/dashboard');

  const headerStore = await headers();
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = headerStore.get('user-agent') ?? undefined;

  try {
    // Rate limiting per IP and per email
    await checkRateLimit(buildRateLimitKey('login', 'ip', ip), { limit: 10 });
    await checkRateLimit(buildRateLimitKey('login', 'email', email), { limit: 5 });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.emailVerifiedAt) {
      throw new AuthenticationError('CREDENTIALS_INVALID', 'Email o contraseña incorrectos.');
    }

    const valid = await PasswordService.verify(user.passwordHash, password);
    if (!valid) {
      await prisma.auditLog.create({
        data: { actorId: user.id, action: 'auth.login.failed', targetType: 'User', targetId: user.id, ipAddress: ip, userAgent },
      });
      throw new AuthenticationError('CREDENTIALS_INVALID', 'Email o contraseña incorrectos.');
    }

    // Re-hash if params are outdated
    if (PasswordService.needsRehash(user.passwordHash)) {
      const newHash = await PasswordService.hash(password);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
    }

    const sessionToken = await SessionService.create(user.id, ip, userAgent);
    SessionService.setSessionCookie(sessionToken);

    await prisma.auditLog.create({
      data: { actorId: user.id, action: 'auth.login.success', targetType: 'User', targetId: user.id, ipAddress: ip, userAgent },
    });

    logger().info({ userId: user.id }, 'auth.login.success');
  } catch (err) {
    if (err instanceof AuthenticationError || (err as { code?: string }).code === 'RATE_LIMIT_EXCEEDED') {
      return { error: (err as Error).message };
    }
    logger().error({ err }, 'login.unexpected');
    return { error: 'Error inesperado. Inténtalo de nuevo.' };
  }

  redirect(next.startsWith('/') ? next : '/dashboard');
}
```

- [ ] **Step 3:** Create `src/app/(auth)/login/page.tsx`:

```tsx
import { loginAction } from './actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>PadelLeague</h1>
      <form action={loginAction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input type="hidden" name="next" value="" />
        <div>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="email"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
            Contraseña
          </label>
          <input id="password" name="password" type="password" required autoComplete="current-password"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit"
          style={{ padding: '0.625rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
          Entrar
        </button>
        <a href="/recuperar-password" style={{ fontSize: '0.875rem', textAlign: 'center', color: '#2563eb' }}>
          ¿Olvidaste tu contraseña?
        </a>
      </form>
    </div>
  );
}
```

- [ ] **Step 4:** Create `src/app/api/auth/logout/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';

export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      const session = await prisma.session.findUnique({
        where: { sessionToken: token },
        select: { userId: true },
      });
      await SessionService.revoke(token);
      if (session) {
        await prisma.auditLog.create({
          data: { actorId: session.userId, action: 'auth.logout', targetType: 'User', targetId: session.userId },
        });
      }
    } catch (err) {
      logger().warn({ err }, 'logout.session-not-found');
    }
    SessionService.clearSessionCookie();
  }

  return NextResponse.redirect(new URL('/login', process.env.APP_URL ?? 'http://localhost:3000'));
}
```

- [ ] **Step 5:** Create `src/app/(app)/layout.tsx`:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');

  try {
    await SessionService.validate(token);
  } catch {
    redirect('/login');
  }

  return (
    <div>
      <nav style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/dashboard" style={{ fontWeight: '700', textDecoration: 'none', color: '#111' }}>PadelLeague</a>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <a href="/perfil" style={{ fontSize: '0.875rem', color: '#374151' }}>Mi perfil</a>
          <form action="/api/auth/logout" method="post">
            <button type="submit" style={{ fontSize: '0.875rem', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
              Cerrar sesión
            </button>
          </form>
        </div>
      </nav>
      <main style={{ padding: '1.5rem' }}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 6:** Create `src/app/(app)/dashboard/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)!.value;
  const user = await SessionService.validate(token);

  return (
    <div>
      <h1>Bienvenido, {user.name}</h1>
      <p style={{ color: '#6b7280' }}>Dashboard en construcción. Spec 2 añadirá las ligas.</p>
    </div>
  );
}
```

- [ ] **Step 7:** Run `pnpm typecheck && pnpm lint`. Fix any issues.

- [ ] **Step 8:** Commit: `feat(auth): login + logout flows + protected app layout + dashboard`

---

## Phase 3 · User invitation flow

### Task 3.1: Invite user API + accept invitation

**Files:**
- Create: `src/app/(app)/admin/usuarios/invitar/page.tsx`
- Create: `src/app/(app)/admin/usuarios/invitar/actions.ts`
- Create: `src/app/(auth)/aceptar-invitacion/[token]/page.tsx`
- Create: `src/app/(auth)/aceptar-invitacion/[token]/actions.ts`

**Spec reference:** §7.0 — admin creates User (invalid passwordHash + `emailVerifiedAt = null`) + SignedToken `USER_INVITATION` (TTL 7 days) + enqueues `send-email` job.

- [ ] **Step 1:** Create `src/app/(app)/admin/usuarios/invitar/actions.ts`:

```typescript
'use server';

import { cookies } from 'next/headers';
import { prisma } from '@/shared/db/client';
import { SignedTokenService } from '@/shared/auth/signed-tokens';
import { SessionService, SESSION_COOKIE } from '@/shared/auth/session';
import { queue } from '@/shared/queue/client';
import { assertSuperAdmin } from '@/shared/auth/rbac';
import { ConflictError, ValidationError } from '@/shared/errors';
import { SignedTokenPurpose } from '@prisma/client';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger';

export async function inviteUserAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  const email = String(formData.get('email') ?? '').toLowerCase().trim();
  const name = String(formData.get('name') ?? '').trim();

  if (!email || !email.includes('@')) return { error: 'Email inválido.' };

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return { error: 'No autenticado.' };
    const actor = await SessionService.validate(token);
    assertSuperAdmin(actor);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictError('USER_EXISTS', 'Ya existe un usuario con ese email.');

    const user = await prisma.user.create({
      data: {
        email,
        name: name || 'Pendiente',
        // Placeholder hash — user will set password on invitation acceptance
        passwordHash: `__invited__${Date.now()}`,
        emailVerifiedAt: null,
      },
    });

    const inviteToken = await SignedTokenService.issue({
      purpose: SignedTokenPurpose.USER_INVITATION,
      subjectId: user.id,
      ttlSeconds: 7 * 24 * 60 * 60, // 7 days
    });

    const inviteUrl = `${env().APP_URL}/aceptar-invitacion/${inviteToken}`;

    const q = queue();
    await q.start();
    await q.publish('send-email', {
      template: 'invitation',
      to: email,
      data: { name: name || 'Jugador', inviteUrl },
      dedupKey: `invitation-${user.id}`,
    });

    await prisma.auditLog.create({
      data: { actorId: actor.id, action: 'user.invited', targetType: 'User', targetId: user.id },
    });

    logger().info({ actorId: actor.id, invitedUserId: user.id }, 'user.invited');
    return { success: `Invitación enviada a ${email}.` };
  } catch (err) {
    if (err instanceof ConflictError || err instanceof ValidationError) {
      return { error: (err as Error).message };
    }
    logger().error({ err }, 'invite-user.unexpected');
    return { error: 'Error inesperado.' };
  }
}
```

- [ ] **Step 2:** Create `src/app/(app)/admin/usuarios/invitar/page.tsx`:

```tsx
import { inviteUserAction } from './actions';

export default function InviteUserPage() {
  return (
    <div style={{ maxWidth: '480px' }}>
      <h1>Invitar usuario</h1>
      <form action={inviteUserAction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Email *</label>
          <input id="email" name="email" type="email" required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label htmlFor="name" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Nombre (opcional)</label>
          <input id="name" name="name" type="text"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <button type="submit"
          style={{ padding: '0.625rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
          Enviar invitación
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3:** Create `src/app/(auth)/aceptar-invitacion/[token]/actions.ts`:

```typescript
'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/shared/db/client';
import { SignedTokenService } from '@/shared/auth/signed-tokens';
import { PasswordService } from '@/shared/auth/password';
import { SessionService } from '@/shared/auth/session';
import { SignedTokenPurpose } from '@prisma/client';
import { ValidationError } from '@/shared/errors';
import { logger } from '@/shared/logger';

export async function acceptInvitationAction(
  token: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const name = String(formData.get('name') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!name) return { error: 'El nombre es obligatorio.' };
  if (password.length < 10) return { error: 'La contraseña debe tener al menos 10 caracteres.' };
  if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    return { error: 'La contraseña debe contener al menos un número y una letra.' };
  }
  if (password !== confirmPassword) return { error: 'Las contraseñas no coinciden.' };

  try {
    const { subjectId: userId } = await SignedTokenService.consume(
      token,
      SignedTokenPurpose.USER_INVITATION,
    );

    const passwordHash = await PasswordService.hash(password);

    await prisma.user.update({
      where: { id: userId },
      data: { name, passwordHash, emailVerifiedAt: new Date() },
    });

    const sessionToken = await SessionService.create(userId);
    SessionService.setSessionCookie(sessionToken);

    await prisma.auditLog.create({
      data: { actorId: userId, action: 'user.invitation.accepted', targetType: 'User', targetId: userId },
    });

    logger().info({ userId }, 'user.invitation.accepted');
  } catch (err) {
    if (err instanceof ValidationError || (err as { code?: string }).code === 'TOKEN_INVALID') {
      return { error: (err as Error).message };
    }
    logger().error({ err }, 'accept-invitation.unexpected');
    return { error: 'Error inesperado.' };
  }

  redirect('/dashboard');
}
```

- [ ] **Step 4:** Create `src/app/(auth)/aceptar-invitacion/[token]/page.tsx`:

```tsx
import { acceptInvitationAction } from './actions';

export default function AcceptInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Acepta tu invitación</h1>
      <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Fields: name, password, confirmPassword */}
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Crea tu cuenta para unirte a PadelLeague.
        </p>
        <div>
          <label htmlFor="name" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Nombre</label>
          <input id="name" name="name" type="text" required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Contraseña</label>
          <input id="password" name="password" type="password" required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>Mínimo 10 caracteres, al menos un número y una letra.</p>
        </div>
        <div>
          <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Confirmar contraseña</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <button type="submit"
          style={{ padding: '0.625rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
          Crear cuenta e iniciar sesión
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5:** Run `pnpm typecheck && pnpm lint`. Fix any issues.

- [ ] **Step 6:** Commit: `feat(auth): user invitation flow — invite action + accept invitation page`

---

## Phase 4 · Password reset flow

### Task 4.1: Forgot password + reset password

**Files:**
- Create: `src/app/(auth)/recuperar-password/page.tsx`
- Create: `src/app/(auth)/recuperar-password/actions.ts`
- Create: `src/app/(auth)/recuperar-password/[token]/page.tsx`
- Create: `src/app/(auth)/recuperar-password/[token]/actions.ts`

**Spec reference:** §7.1 — rate limit + send reset email; §7.4 — SignedToken `PASSWORD_RESET`, TTL 1 hour.

- [ ] **Step 1:** Create `src/app/(auth)/recuperar-password/actions.ts`:

```typescript
'use server';

import { headers } from 'next/headers';
import { prisma } from '@/shared/db/client';
import { SignedTokenService } from '@/shared/auth/signed-tokens';
import { queue } from '@/shared/queue/client';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { SignedTokenPurpose } from '@prisma/client';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger';

export async function requestPasswordResetAction(
  formData: FormData,
): Promise<{ message: string }> {
  const email = String(formData.get('email') ?? '').toLowerCase().trim();
  const headerStore = await headers();
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Rate limiting — always return same message to avoid email enumeration
  try {
    await checkRateLimit(buildRateLimitKey('password-reset', 'ip', ip), { limit: 5 });
  } catch {
    return { message: 'Si ese email está registrado, recibirás un enlace en breve.' };
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user?.emailVerifiedAt) {
      const resetToken = await SignedTokenService.issue({
        purpose: SignedTokenPurpose.PASSWORD_RESET,
        subjectId: user.id,
        ttlSeconds: 60 * 60, // 1 hour
      });

      const resetUrl = `${env().APP_URL}/recuperar-password/${resetToken}`;

      const q = queue();
      await q.start();
      await q.publish('send-email', {
        template: 'password-reset',
        to: email,
        data: { name: user.name, resetUrl },
        dedupKey: `reset-${user.id}-${Math.floor(Date.now() / 60000)}`,
      });

      logger().info({ userId: user.id }, 'auth.password.reset.requested');
    }
  } catch (err) {
    logger().error({ err }, 'password-reset.unexpected');
  }

  return { message: 'Si ese email está registrado, recibirás un enlace en breve.' };
}
```

- [ ] **Step 2:** Create `src/app/(auth)/recuperar-password/page.tsx`:

```tsx
import { requestPasswordResetAction } from './actions';

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 style={{ marginBottom: '0.5rem' }}>Recuperar contraseña</h1>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
        Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.
      </p>
      <form action={requestPasswordResetAction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input name="email" type="email" required placeholder="tu@email.com"
          style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        <button type="submit"
          style={{ padding: '0.625rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
          Enviar enlace
        </button>
        <a href="/login" style={{ fontSize: '0.875rem', textAlign: 'center', color: '#6b7280' }}>Volver al login</a>
      </form>
    </div>
  );
}
```

- [ ] **Step 3:** Create `src/app/(auth)/recuperar-password/[token]/actions.ts`:

```typescript
'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/shared/db/client';
import { SignedTokenService } from '@/shared/auth/signed-tokens';
import { PasswordService } from '@/shared/auth/password';
import { SessionService } from '@/shared/auth/session';
import { SignedTokenPurpose } from '@prisma/client';
import { logger } from '@/shared/logger';

export async function resetPasswordAction(
  token: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (password.length < 10) return { error: 'La contraseña debe tener al menos 10 caracteres.' };
  if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    return { error: 'La contraseña debe contener al menos un número y una letra.' };
  }
  if (password !== confirmPassword) return { error: 'Las contraseñas no coinciden.' };

  try {
    const { subjectId: userId } = await SignedTokenService.consume(
      token,
      SignedTokenPurpose.PASSWORD_RESET,
    );

    const passwordHash = await PasswordService.hash(password);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await SessionService.revokeAll(userId); // invalidate all existing sessions

    await prisma.auditLog.create({
      data: { actorId: userId, action: 'auth.password.reset', targetType: 'User', targetId: userId },
    });

    logger().info({ userId }, 'auth.password.reset.completed');
  } catch (err) {
    return { error: (err as Error).message ?? 'Error inesperado.' };
  }

  redirect('/login');
}
```

- [ ] **Step 4:** Create `src/app/(auth)/recuperar-password/[token]/page.tsx`:

```tsx
import { resetPasswordAction } from './actions';

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Nueva contraseña</h1>
      <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Nueva contraseña</label>
          <input id="password" name="password" type="password" required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Confirmar contraseña</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <button type="submit"
          style={{ padding: '0.625rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
          Cambiar contraseña
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5:** Run `pnpm typecheck && pnpm lint`. Fix any issues.

- [ ] **Step 6:** Commit: `feat(auth): password reset flow — request + complete via signed token`

---

## Phase 5 · Profile page

### Task 5.1: Profile page

**Files:**
- Create: `src/app/(app)/perfil/page.tsx`
- Create: `src/app/(app)/perfil/actions.ts`

**Spec reference:** §7.3 — edit name, change password (Argon2 verify old → hash new), revoke all sessions.

- [ ] **Step 1:** Create `src/app/(app)/perfil/actions.ts`:

```typescript
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/shared/db/client';
import { PasswordService } from '@/shared/auth/password';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';
import { AuthenticationError, ValidationError } from '@/shared/errors';
import { logger } from '@/shared/logger';

export async function updateProfileAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'El nombre no puede estar vacío.' };

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };

  try {
    const user = await SessionService.validate(token);
    await prisma.user.update({ where: { id: user.id }, data: { name } });
    return { success: 'Perfil actualizado.' };
  } catch (err) {
    logger().error({ err }, 'update-profile.unexpected');
    return { error: 'Error inesperado.' };
  }
}

export async function changePasswordAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');

  if (newPassword.length < 10) return { error: 'La contraseña debe tener al menos 10 caracteres.' };
  if (!/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) {
    return { error: 'La contraseña debe contener al menos un número y una letra.' };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };

  try {
    const sessionUser = await SessionService.validate(token);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });

    const valid = await PasswordService.verify(user.passwordHash, currentPassword);
    if (!valid) throw new AuthenticationError('WRONG_PASSWORD', 'Contraseña actual incorrecta.');

    const newHash = await PasswordService.hash(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

    await prisma.auditLog.create({
      data: { actorId: user.id, action: 'auth.password.changed', targetType: 'User', targetId: user.id },
    });

    return { success: 'Contraseña actualizada.' };
  } catch (err) {
    if (err instanceof AuthenticationError) return { error: (err as Error).message };
    logger().error({ err }, 'change-password.unexpected');
    return { error: 'Error inesperado.' };
  }
}

export async function revokeAllSessionsAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');

  const user = await SessionService.validate(token);
  await SessionService.revokeAll(user.id);
  SessionService.clearSessionCookie();

  redirect('/login');
}
```

- [ ] **Step 2:** Create `src/app/(app)/perfil/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';
import { updateProfileAction, changePasswordAction, revokeAllSessionsAction } from './actions';

export default async function PerfilPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)!.value;
  const user = await SessionService.validate(token);

  return (
    <div style={{ maxWidth: '560px' }}>
      <h1>Mi perfil</h1>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Datos personales</h2>
        <form action={updateProfileAction} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Nombre</label>
            <input name="name" type="text" required defaultValue={user.name}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Email</label>
            <input type="email" value={user.email} disabled
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '4px', background: '#f9fafb', color: '#6b7280', boxSizing: 'border-box' }} />
          </div>
          <button type="submit"
            style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', alignSelf: 'flex-start' }}>
            Guardar
          </button>
        </form>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Cambiar contraseña</h2>
        <form action={changePasswordAction} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input name="currentPassword" type="password" required placeholder="Contraseña actual"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
          <input name="newPassword" type="password" required placeholder="Nueva contraseña (mín. 10 chars)"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
          <button type="submit"
            style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', alignSelf: 'flex-start' }}>
            Cambiar contraseña
          </button>
        </form>
      </section>

      <section>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Sesiones</h2>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          Cierra sesión en todos tus dispositivos.
        </p>
        <form action={revokeAllSessionsAction}>
          <button type="submit"
            style={{ padding: '0.5rem 1rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Cerrar todas las sesiones
          </button>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 3:** Run `pnpm typecheck && pnpm lint`. Fix any issues.

- [ ] **Step 4:** Commit: `feat(auth): profile page — edit name, change password, revoke sessions`

---

## Phase 6 · Email delivery + job handlers

### Task 6.1: EmailService + send-email handler

**Files:**
- Create: `src/shared/email/service.ts`
- Create: `src/worker/email-templates/invitation.tsx`
- Create: `src/worker/email-templates/password-reset.tsx`
- Create: `src/worker/handlers/send-email.ts`

**Spec reference:** §8.3 — send-email handler; uses Resend API; React Email for templates.

- [ ] **Step 1:** Install Resend + React Email:

```bash
pnpm add resend @react-email/components
```

- [ ] **Step 2:** Create `src/shared/email/service.ts`:

```typescript
import { Resend } from 'resend';
import { env } from '@/shared/config/env';

let _resend: Resend | undefined;

function getResend(): Resend {
  _resend ??= new Resend(env().RESEND_API_KEY);
  return _resend;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export const EmailService = {
  async send(opts: SendEmailOptions): Promise<string> {
    const { data, error } = await getResend().emails.send({
      from: opts.from ?? env().RESEND_FROM_EMAIL,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo ?? env().EMAIL_REPLY_TO,
    });

    if (error || !data?.id) {
      throw new Error(`Resend error: ${error?.message ?? 'unknown'}`);
    }

    return data.id;
  },
} as const;
```

- [ ] **Step 3:** Create `src/worker/email-templates/invitation.tsx`:

```tsx
import * as React from 'react';

interface Props {
  name: string;
  inviteUrl: string;
}

export function InvitationEmail({ name, inviteUrl }: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Bienvenido a PadelLeague, {name}</h1>
      <p>Has sido invitado/a a unirte a la plataforma de gestión de ligas de pádel.</p>
      <p>Haz clic en el enlace para crear tu cuenta. El enlace es válido durante 7 días.</p>
      <a href={inviteUrl}
        style={{ display: 'inline-block', padding: '0.75rem 1.5rem', background: '#2563eb', color: 'white', textDecoration: 'none', borderRadius: '4px', marginTop: '1rem' }}>
        Aceptar invitación
      </a>
      <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
        Si no esperabas esta invitación, puedes ignorar este email.
      </p>
    </div>
  );
}

export const invitationSubject = 'Invitación a PadelLeague';
```

- [ ] **Step 4:** Create `src/worker/email-templates/password-reset.tsx`:

```tsx
import * as React from 'react';

interface Props {
  name: string;
  resetUrl: string;
}

export function PasswordResetEmail({ name, resetUrl }: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Restablecer contraseña</h1>
      <p>Hola {name},</p>
      <p>Hemos recibido una solicitud para restablecer tu contraseña. Haz clic en el enlace (válido 1 hora):</p>
      <a href={resetUrl}
        style={{ display: 'inline-block', padding: '0.75rem 1.5rem', background: '#2563eb', color: 'white', textDecoration: 'none', borderRadius: '4px', marginTop: '1rem' }}>
        Restablecer contraseña
      </a>
      <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
        Si no solicitaste este cambio, ignora este email. Tu contraseña no se modificará.
      </p>
    </div>
  );
}

export const passwordResetSubject = 'Restablecer contraseña — PadelLeague';
```

- [ ] **Step 5:** Create `src/worker/handlers/send-email.ts`:

```typescript
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { EmailService } from '@/shared/email/service';
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import { InvitationEmail, invitationSubject } from '../email-templates/invitation';
import { PasswordResetEmail, passwordResetSubject } from '../email-templates/password-reset';
import type { JobMap } from '@/shared/queue/jobs';

type EmailData = JobMap['send-email']['data'];

function renderTemplate(template: string, data: EmailData): { subject: string; html: string } {
  switch (template) {
    case 'invitation':
      return {
        subject: invitationSubject,
        html: renderToStaticMarkup(
          React.createElement(InvitationEmail, {
            name: String(data.name ?? 'Jugador'),
            inviteUrl: String(data.inviteUrl ?? ''),
          }),
        ),
      };
    case 'password-reset':
      return {
        subject: passwordResetSubject,
        html: renderToStaticMarkup(
          React.createElement(PasswordResetEmail, {
            name: String(data.name ?? 'Jugador'),
            resetUrl: String(data.resetUrl ?? ''),
          }),
        ),
      };
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

export async function sendEmailHandler(data: JobMap['send-email']): Promise<void> {
  const { template, to, data: templateData, dedupKey } = data;

  // Idempotency: skip if already sent with this dedupKey
  if (dedupKey) {
    const existing = await prisma.emailLog.findUnique({ where: { dedupKey } });
    if (existing?.status === 'SENT' || existing?.status === 'DELIVERED') {
      logger().info({ dedupKey }, 'send-email.skipped.duplicate');
      return;
    }
  }

  const log = await prisma.emailLog.create({
    data: {
      toEmail: to,
      template,
      subject: '', // will be updated below
      status: 'QUEUED',
      dedupKey: dedupKey ?? null,
    },
  });

  try {
    const { subject, html } = renderTemplate(template, templateData);
    await prisma.emailLog.update({ where: { id: log.id }, data: { subject } });

    const providerId = await EmailService.send({ to, subject, html });

    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'SENT', providerMessageId: providerId, sentAt: new Date() },
    });

    logger().info({ to, template, providerId }, 'send-email.sent');
  } catch (err) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage: (err as Error).message },
    });
    throw err; // re-throw so pg-boss retries
  }
}
```

- [ ] **Step 6:** Run `pnpm typecheck`. Fix any issues with React imports or types.

- [ ] **Step 7:** Commit: `feat(worker): send-email handler with Resend + React Email templates`

---

### Task 6.2: session-cleanup + anonymize-user handlers

**Files:**
- Create: `src/worker/handlers/session-cleanup.ts`
- Create: `src/worker/handlers/anonymize-user.ts`

- [ ] **Step 1:** Create `src/worker/handlers/session-cleanup.ts`:

```typescript
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import type { JobMap } from '@/shared/queue/jobs';

export async function sessionCleanupHandler(_data: JobMap['session-cleanup']): Promise<void> {
  const result = await prisma.session.deleteMany({
    where: { expires: { lt: new Date() } },
  });
  logger().info({ deleted: result.count }, 'session-cleanup.done');
}
```

- [ ] **Step 2:** Create `src/worker/handlers/anonymize-user.ts`:

```typescript
import { prisma } from '@/shared/db/client';
import { PasswordService } from '@/shared/auth/password';
import { logger } from '@/shared/logger';
import type { JobMap } from '@/shared/queue/jobs';

export async function anonymizeUserHandler(data: JobMap['anonymize-user']): Promise<void> {
  const { userId } = data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    logger().warn({ userId }, 'anonymize-user.not-found');
    return;
  }
  if (user.anonymizedAt) {
    logger().info({ userId }, 'anonymize-user.already-anonymized');
    return;
  }

  // Generate an invalid random hash to prevent login
  const invalidHash = await PasswordService.hash(`__anon__${Date.now()}__${Math.random()}`);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        email: `anonymized-${userId}@deleted.local`,
        name: 'Jugador anónimo',
        passwordHash: invalidHash,
        avatarUrl: null,
        phone: null,
        anonymizedAt: new Date(),
      },
    }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);

  logger().info({ userId }, 'anonymize-user.done');
}
```

- [ ] **Step 3:** Register new handlers in `src/worker/index.ts`. Update the worker entrypoint to import and register `sendEmailHandler`, `sessionCleanupHandler`, and `anonymizeUserHandler`.

- [ ] **Step 4:** Commit: `feat(worker): session-cleanup + anonymize-user handlers`

---

## Phase 7 · GDPR endpoints

### Task 7.1: Data export + anonymize endpoint

**Files:**
- Create: `src/app/api/me/export/route.ts`
- Create: `src/app/api/admin/users/[id]/anonymize/route.ts`

**Spec reference:** §14.2.

- [ ] **Step 1:** Create `src/app/api/me/export/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';
import { prisma } from '@/shared/db/client';
import { errorToResponse } from '@/shared/errors/http';

export async function GET(): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

    const sessionUser = await SessionService.validate(token);

    const [user, teamMemberships, notifications, auditLogs] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: sessionUser.id },
        select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
      }),
      prisma.teamMember.findMany({
        where: { userId: sessionUser.id },
        include: { team: { select: { name: true, league: { select: { name: true } } } } },
      }),
      prisma.notification.findMany({
        where: { userId: sessionUser.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.auditLog.findMany({
        where: { actorId: sessionUser.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      user,
      teamMemberships,
      notifications,
      auditLogs,
    });
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 2:** Create `src/app/api/admin/users/[id]/anonymize/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';
import { assertSuperAdmin } from '@/shared/auth/rbac';
import { queue } from '@/shared/queue/client';
import { errorToResponse } from '@/shared/errors/http';
import { logger } from '@/shared/logger';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

    const actor = await SessionService.validate(token);
    assertSuperAdmin(actor);

    const { id: userId } = await params;

    const q = queue();
    await q.start();
    await q.publish('anonymize-user', { userId });

    logger().info({ actorId: actor.id, targetUserId: userId }, 'user.anonymize.enqueued');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
```

- [ ] **Step 3:** Run `pnpm typecheck && pnpm lint`. Fix any issues.

- [ ] **Step 4:** Commit: `feat(gdpr): data export endpoint + admin anonymize endpoint`

---

## Phase 8 · Legal placeholder pages

### Task 8.1: Legal pages

**Files:**
- Create: `src/app/(auth)/aviso-legal/page.tsx`
- Create: `src/app/(auth)/privacidad/page.tsx`
- Create: `src/app/(auth)/cookies/page.tsx`

**Spec reference:** §14.4 — placeholder pages, content pending legal review.

- [ ] **Step 1:** Create the three pages with identical structure:

```tsx
// aviso-legal/page.tsx
export default function AvisoLegalPage() {
  return (
    <div style={{ maxWidth: '700px', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Aviso Legal</h1>
      <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
        Contenido pendiente de revisión legal. Se actualizará antes del lanzamiento en producción.
      </p>
    </div>
  );
}
```

Create equivalent pages for `/privacidad` (Política de Privacidad) and `/cookies` (Política de Cookies).

- [ ] **Step 2:** Commit: `feat(legal): aviso-legal, privacidad, cookies placeholder pages`

---

## Phase 9 · Integration tests

### Task 9.1: Auth integration tests

**Files:**
- Create: `tests/integration/auth.test.ts`
- Create: `tests/integration/gdpr.test.ts`

**Key test:** CAS race condition on SignedToken consume — two concurrent requests for the same token, only one should succeed.

- [ ] **Step 1:** Create `tests/integration/auth.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { SignedTokenService } from '@/shared/auth/signed-tokens';
import { PasswordService } from '@/shared/auth/password';
import { SessionService } from '@/shared/auth/session';
import { SignedTokenPurpose } from '@prisma/client';

const prisma = testPrisma();

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = 'test-secret-'.padEnd(44, 'x');
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PasswordService', () => {
  it('hashes and verifies correctly', async () => {
    const hash = await PasswordService.hash('TestPass1234');
    expect(await PasswordService.verify(hash, 'TestPass1234')).toBe(true);
    expect(await PasswordService.verify(hash, 'WrongPass')).toBe(false);
  });
});

describe('SignedTokenService — CAS concurrency', () => {
  it('only one of two concurrent consume calls succeeds', async () => {
    const user = await prisma.user.create({
      data: { email: 'cas@test.com', name: 'CAS Test', passwordHash: 'x', emailVerifiedAt: new Date() },
    });

    const token = await SignedTokenService.issue({
      purpose: SignedTokenPurpose.PASSWORD_RESET,
      subjectId: user.id,
      ttlSeconds: 300,
    });

    // Fire two concurrent consume calls
    const results = await Promise.allSettled([
      SignedTokenService.consume(token, SignedTokenPurpose.PASSWORD_RESET),
      SignedTokenService.consume(token, SignedTokenPurpose.PASSWORD_RESET),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason.code).toBe('TOKEN_INVALID');
  });
});

describe('SessionService', () => {
  it('creates and validates a session', async () => {
    const user = await prisma.user.create({
      data: { email: 'session@test.com', name: 'Session Test', passwordHash: 'x', emailVerifiedAt: new Date() },
    });

    const token = await SessionService.create(user.id);
    const sessionUser = await SessionService.validate(token);
    expect(sessionUser.id).toBe(user.id);
    expect(sessionUser.email).toBe('session@test.com');
  });

  it('revokes a session', async () => {
    const user = await prisma.user.create({
      data: { email: 'revoke@test.com', name: 'Revoke Test', passwordHash: 'x', emailVerifiedAt: new Date() },
    });

    const token = await SessionService.create(user.id);
    await SessionService.revoke(token);
    await expect(SessionService.validate(token)).rejects.toThrow();
  });
});
```

- [ ] **Step 2:** Create `tests/integration/gdpr.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { PasswordService } from '@/shared/auth/password';
import { anonymizeUserHandler } from '@/worker/handlers/anonymize-user';

const prisma = testPrisma();

beforeAll(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('anonymizeUserHandler', () => {
  it('anonymizes user data and invalidates sessions', async () => {
    const passwordHash = await PasswordService.hash('TestPass1234');
    const user = await prisma.user.create({
      data: {
        email: 'gdpr@test.com',
        name: 'GDPR Test',
        passwordHash,
        phone: '+34600000000',
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.session.create({
      data: { userId: user.id, sessionToken: 'test-token', expires: new Date(Date.now() + 9999999) },
    });

    await anonymizeUserHandler({ userId: user.id });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.email).toBe(`anonymized-${user.id}@deleted.local`);
    expect(updated.name).toBe('Jugador anónimo');
    expect(updated.phone).toBeNull();
    expect(updated.anonymizedAt).not.toBeNull();

    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(0);

    // Should be idempotent
    await expect(anonymizeUserHandler({ userId: user.id })).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3:** Run `pnpm test:integration`. Expected: all pass (requires Docker). If Docker unavailable, commit and note.

- [ ] **Step 4:** Commit: `test(integration): auth CAS + GDPR anonymize integration tests`

---

## Phase 10 · Closeout

### Task 10.1: All verification gates

- [ ] **Step 1:** `pnpm lint` — 0 warnings, 0 errors.
- [ ] **Step 2:** `pnpm typecheck` — no errors.
- [ ] **Step 3:** `pnpm test:unit` — all pass.
- [ ] **Step 4:** `pnpm test:integration` — all pass (requires Docker).
- [ ] **Step 5:** `pnpm build` — Next.js + worker build succeed.
- [ ] **Step 6:** Fix any failures. Commit fixes.

---

### Task 10.2: Register handlers in worker

Ensure `src/worker/index.ts` registers all 4 handlers: `noop`, `send-email`, `session-cleanup`, `anonymize-user`.

---

### Task 10.3: Tag

```bash
git tag -a plan-1b-auth-complete -m "Plan 1b (Auth + GDPR) complete"
```

---

## Acceptance criteria for Plan 1b

- [ ] `POST /api/auth/logout` clears cookie and deletes Session row.
- [ ] `/login` redirects to `/dashboard` on success; invalid credentials return error.
- [ ] Rate limiting blocks >5 login attempts per email per 15 min.
- [ ] Admin invites user → email queued as `send-email` job → invitation email sent via Resend.
- [ ] User accepts invitation via one-use signed token → sets password → auto-logged in.
- [ ] Password reset end-to-end via signed token (TTL 1 hour, one-use CAS).
- [ ] Profile page: edit name, change password (verifies old), revoke all sessions.
- [ ] `GET /api/me/export` returns JSON with user data (requires auth).
- [ ] `POST /api/admin/users/:id/anonymize` enqueues anonymize-user job (SUPER_ADMIN only).
- [ ] `anonymize-user` handler anonymizes user and deletes all sessions.
- [ ] `session-cleanup` handler deletes expired sessions.
- [ ] CAS integration test: two concurrent token consume calls → only 1 succeeds.
- [ ] `/aviso-legal`, `/privacidad`, `/cookies` pages render.
- [ ] `pnpm lint` + `pnpm typecheck` + `pnpm test:unit` + `pnpm build` all green.
- [ ] `pnpm test:integration` green (requires Docker).

## Out of scope (deferred to Plan 1c)

- Sentry integration (`@sentry/nextjs`, `@sentry/node`)
- CSP + security headers in `next.config.mjs`
- Middleware source map + tracing headers
- GitHub Actions CI pipeline
- Playwright E2E tests for auth flows
- Vercel + Railway deployment + `docs/deployment.md`
- `POST /api/dev/sentry-test` dev endpoint
