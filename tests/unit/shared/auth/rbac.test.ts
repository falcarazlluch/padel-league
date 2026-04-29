import { describe, it, expect } from 'vitest';
import { assertSuperAdmin, assertLeagueAdmin, isLeagueAdmin } from '@/shared/auth/rbac';
import { AuthorizationError } from '@/shared/errors';
import type { SessionUser } from '@/shared/auth/session';

const superAdmin: SessionUser = { id: 'u1', email: 'a@b.com', name: 'Admin', role: 'SUPER_ADMIN' };
const leagueAdmin: SessionUser = { id: 'u2', email: 'la@b.com', name: 'LeagueAdmin', role: 'LEAGUE_ADMIN' };
const player: SessionUser = { id: 'u3', email: 'p@b.com', name: 'Player', role: 'PLAYER' };

describe('assertSuperAdmin', () => {
  it('passes for SUPER_ADMIN', () => {
    expect(() => assertSuperAdmin(superAdmin)).not.toThrow();
  });

  it('throws AuthorizationError for LEAGUE_ADMIN', () => {
    expect(() => assertSuperAdmin(leagueAdmin)).toThrow(AuthorizationError);
  });

  it('throws AuthorizationError for PLAYER', () => {
    expect(() => assertSuperAdmin(player)).toThrow(AuthorizationError);
  });
});

describe('assertLeagueAdmin', () => {
  it('passes for SUPER_ADMIN regardless of who created the league', () => {
    expect(() => assertLeagueAdmin(superAdmin, 'someone-else')).not.toThrow();
  });

  it('passes for the user that created the league', () => {
    expect(() => assertLeagueAdmin(leagueAdmin, leagueAdmin.id)).not.toThrow();
  });

  it('throws when LEAGUE_ADMIN does not own the league', () => {
    expect(() => assertLeagueAdmin(leagueAdmin, 'someone-else')).toThrow(AuthorizationError);
  });

  it('throws for PLAYER even on their own resources', () => {
    expect(() => assertLeagueAdmin(player, player.id)).toThrow(AuthorizationError);
  });
});

describe('isLeagueAdmin', () => {
  it('returns true for SUPER_ADMIN regardless', () => {
    expect(isLeagueAdmin(superAdmin, 'x')).toBe(true);
  });

  it('returns true for the league creator', () => {
    expect(isLeagueAdmin(leagueAdmin, leagueAdmin.id)).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(isLeagueAdmin(leagueAdmin, 'other')).toBe(false);
    expect(isLeagueAdmin(player, player.id)).toBe(false);
  });
});
