import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────
// next/headers: cookies() with a populated SESSION_COOKIE.
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: () => ({ value: 'fake-session-token' }),
    }),
}));

// next/navigation.redirect throws a tagged error so tests can detect that the
// happy path tried to redirect (matching Next's actual runtime behaviour).
class RedirectError extends Error {
  constructor(public path: string) {
    super(`redirect:${path}`);
    this.name = 'RedirectError';
  }
}
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new RedirectError(path);
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Session: validate succeeds and returns the configured user.
const sessionUser = { id: 'u1', role: 'PLAYER' as const };
vi.mock('@/shared/auth/session-cache', () => ({
  getValidatedSession: vi.fn(() => Promise.resolve(sessionUser)),
}));

// SessionService.clearSessionCookie is invoked on the happy path; capture it.
const clearSessionCookieMock = vi.fn(() => Promise.resolve());
vi.mock('@/shared/auth/session', () => ({
  SESSION_COOKIE: 'padel_session',
  SessionService: {
    clearSessionCookie: clearSessionCookieMock,
    revokeAll: vi.fn(),
  },
}));

// Rate limit: by default permissive; individual tests can override.
const checkRateLimitMock = vi.fn(() => Promise.resolve());
vi.mock('@/shared/auth/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
  buildRateLimitKey: (...parts: string[]) => parts.join(':'),
}));

// Password verify: by default returns true; override in the wrong-password test.
const passwordVerifyMock = vi.fn(() => Promise.resolve(true));
vi.mock('@/shared/auth/password', () => ({
  PasswordService: {
    verify: (...args: unknown[]) => passwordVerifyMock(...args),
    hash: vi.fn(() => Promise.resolve('hashed-anonymous')),
  },
}));

// Prisma: configurable via getPrisma().
vi.mock('@/shared/db/client', () => ({
  prisma: {
    user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    league: { findMany: vi.fn() },
    session: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    pushSubscription: { deleteMany: vi.fn() },
    notificationPreference: { deleteMany: vi.fn() },
    $transaction: vi.fn((ops: unknown) => Promise.resolve(ops)),
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    user: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    league: { findMany: ReturnType<typeof vi.fn> };
    session: { deleteMany: ReturnType<typeof vi.fn> };
    auditLog: { create: ReturnType<typeof vi.fn> };
    pushSubscription: { deleteMany: ReturnType<typeof vi.fn> };
    notificationPreference: { deleteMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

// Build a FormData with the canonical fields. Tests can override any field
// after construction.
function makeFormData(overrides: Partial<{ currentPassword: string; confirmation: string }> = {}): FormData {
  const fd = new FormData();
  fd.set('currentPassword', overrides.currentPassword ?? 'correct-password');
  fd.set('confirmation', overrides.confirmation ?? 'ELIMINAR');
  return fd;
}

describe('deleteAccountAction', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset default rate-limit + password-verify behaviour.
    checkRateLimitMock.mockResolvedValue(undefined);
    passwordVerifyMock.mockResolvedValue(true);
    // Default user: regular PLAYER, no admin leagues.
    const prisma = await getPrisma();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'u1',
      role: 'PLAYER',
      passwordHash: 'argon2id-hash',
    });
    prisma.league.findMany.mockResolvedValue([]);
    prisma.$transaction.mockResolvedValue([]);
  });

  it('rejects when confirmation is missing or wrong', async () => {
    const { deleteAccountAction } = await import('@/app/(app)/perfil/actions');
    const result = await deleteAccountAction(makeFormData({ confirmation: 'NO' }));
    expect(result).toEqual({ error: expect.stringMatching(/ELIMINAR/i) });
    const prisma = await getPrisma();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts case-insensitive ELIMINAR', async () => {
    const { deleteAccountAction } = await import('@/app/(app)/perfil/actions');
    let caught: unknown;
    try {
      await deleteAccountAction(makeFormData({ confirmation: 'eliminar' }));
    } catch (err) {
      caught = err;
    }
    // Happy path: redirect throws.
    expect(caught).toBeInstanceOf(RedirectError);
  });

  it('returns an error and never mutates DB when password is wrong', async () => {
    passwordVerifyMock.mockResolvedValue(false);
    const { deleteAccountAction } = await import('@/app/(app)/perfil/actions');
    const result = await deleteAccountAction(makeFormData());
    expect(result).toEqual({ error: 'Contraseña incorrecta.' });
    const prisma = await getPrisma();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(clearSessionCookieMock).not.toHaveBeenCalled();
  });

  it('blocks SUPER_ADMIN self-deletion', async () => {
    const prisma = await getPrisma();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'u1',
      role: 'SUPER_ADMIN',
      passwordHash: 'argon2id-hash',
    });
    const { deleteAccountAction } = await import('@/app/(app)/perfil/actions');
    const result = await deleteAccountAction(makeFormData());
    expect(result).toEqual({ error: expect.stringMatching(/administrador/i) });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks deletion when the user is admin of an active or draft league', async () => {
    const prisma = await getPrisma();
    prisma.league.findMany.mockResolvedValue([
      { id: 'l1', name: 'Liga Otoño 2026' },
    ]);
    const { deleteAccountAction } = await import('@/app/(app)/perfil/actions');
    const result = await deleteAccountAction(makeFormData());
    expect(result).toEqual({ error: expect.stringContaining('Liga Otoño 2026') });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rate-limits repeated attempts', async () => {
    const { RateLimitError } = await import('@/shared/errors');
    checkRateLimitMock.mockRejectedValue(new RateLimitError('RATE_LIMITED', 'Demasiados intentos.'));
    const { deleteAccountAction } = await import('@/app/(app)/perfil/actions');
    const result = await deleteAccountAction(makeFormData());
    expect(result).toEqual({ error: 'Demasiados intentos.' });
    const prisma = await getPrisma();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('happy path: anonymises in a transaction, clears cookie, redirects', async () => {
    const { deleteAccountAction } = await import('@/app/(app)/perfil/actions');
    let caught: unknown;
    try {
      await deleteAccountAction(makeFormData());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RedirectError);
    expect((caught as RedirectError).path).toBe('/login?deleted=1');
    const prisma = await getPrisma();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(clearSessionCookieMock).toHaveBeenCalled();
  });
});
