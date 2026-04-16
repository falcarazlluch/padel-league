import { describe, it, expect } from 'vitest';
import { assertSuperAdmin, assertLeagueAdmin } from '@/shared/auth/rbac';
import { AuthorizationError } from '@/shared/errors';
import type { SessionUser } from '@/shared/auth/session';

const superAdmin: SessionUser = { id: 'u1', email: 'a@b.com', name: 'Admin', role: 'SUPER_ADMIN' };
const player: SessionUser = { id: 'u2', email: 'p@b.com', name: 'Player', role: 'PLAYER' };

describe('assertSuperAdmin', () => {
  it('passes for SUPER_ADMIN', () => {
    expect(() => assertSuperAdmin(superAdmin)).not.toThrow();
  });

  it('throws AuthorizationError for PLAYER', () => {
    expect(() => assertSuperAdmin(player)).toThrow(AuthorizationError);
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
    ).toThrow(AuthorizationError);
  });
});
