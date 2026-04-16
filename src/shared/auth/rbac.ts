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
