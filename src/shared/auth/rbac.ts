import { AuthorizationError } from '@/shared/errors';
import type { SessionUser } from './session';

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
 * True if the user manages this league.
 * SUPER_ADMIN manages every league. A LEAGUE_ADMIN only manages leagues they
 * created; if their global role is downgraded they lose access too.
 */
export function isLeagueAdmin(user: SessionUser, leagueCreatedByUserId: string): boolean {
  if (user.role === 'SUPER_ADMIN') return true;
  return user.role === 'LEAGUE_ADMIN' && user.id === leagueCreatedByUserId;
}

/** Throws AuthorizationError unless the user manages this league. */
export function assertLeagueAdmin(user: SessionUser, leagueCreatedByUserId: string): void {
  if (!isLeagueAdmin(user, leagueCreatedByUserId)) {
    throw new AuthorizationError('FORBIDDEN', 'Acción reservada para el admin de la liga.');
  }
}

/** Throws AuthorizationError if user is not a member of the given team. */
export function assertTeamMember(user: SessionUser, teamMemberUserIds: string[]): void {
  if (user.role === 'SUPER_ADMIN') return;
  if (!teamMemberUserIds.includes(user.id)) {
    throw new AuthorizationError('FORBIDDEN', 'No eres miembro de este equipo.');
  }
}
