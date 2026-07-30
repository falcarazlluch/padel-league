import { prisma } from '@/shared/db/client';

export type UserCandidate = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

/**
 * Tenant scope for every people search. Required on all inputs so a new call
 * site cannot accidentally expose the platform's whole user base inside a
 * club's private environment.
 *
 * `null` → public platform: every non-deleted user is a candidate.
 * `<id>` → only members of that organization are candidates.
 */
export interface TenantScope {
  organizationId: string | null;
}

export interface SearchCandidatesInput extends TenantScope {
  q: string;
  teamId: string;
  callerId: string;
  limit?: number;
}

export interface SearchCandidatesForMatchInput extends TenantScope {
  q: string;
  matchId: string;
  callerId: string;
  limit?: number;
}

export interface SearchOrgPartnersInput extends TenantScope {
  q: string;
  callerId: string;
  /** Exclude anyone already registered (not withdrawn) in this competition. */
  excludeRegisteredInLeagueId?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

export const UserSearchService = {
  async searchCandidates(input: SearchCandidatesInput): Promise<UserCandidate[]> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    return prisma.$queryRaw<UserCandidate[]>`
      SELECT u.id, u.name, u.avatar_url AS "avatarUrl"
      FROM users u
      WHERE u.deleted_at IS NULL
        AND u.id != ${input.callerId}
        AND (
          ${input.organizationId}::text IS NULL
          OR EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.user_id = u.id AND om.organization_id = ${input.organizationId}
          )
        )
        AND u.id NOT IN (
          SELECT tm.user_id FROM team_members tm WHERE tm.team_id = ${input.teamId}
        )
        AND u.id NOT IN (
          SELECT ti.invited_user_id FROM team_invitations ti
          WHERE ti.team_id = ${input.teamId} AND ti.status = 'PENDING'
        )
        AND unaccent(LOWER(u.name)) LIKE unaccent(LOWER('%' || ${input.q} || '%'))
      ORDER BY u.name ASC
      LIMIT ${limit}
    `;
  },

  async searchCandidatesForMatch(input: SearchCandidatesForMatchInput): Promise<UserCandidate[]> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    return prisma.$queryRaw<UserCandidate[]>`
      SELECT u.id, u.name, u.avatar_url AS "avatarUrl"
      FROM users u
      WHERE u.deleted_at IS NULL
        AND u.id != ${input.callerId}
        AND (
          ${input.organizationId}::text IS NULL
          OR EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.user_id = u.id AND om.organization_id = ${input.organizationId}
          )
        )
        AND u.id NOT IN (
          SELECT imp.user_id FROM independent_match_participants imp
          WHERE imp.independent_match_id = ${input.matchId} AND imp.status = 'ACCEPTED'
        )
        AND u.id NOT IN (
          SELECT imi.invited_user_id FROM independent_match_invitations imi
          WHERE imi.match_id = ${input.matchId}
            AND imi.invited_user_id IS NOT NULL
            AND imi.accepted_at IS NULL
        )
        AND unaccent(LOWER(u.name)) LIKE unaccent(LOWER('%' || ${input.q} || '%'))
      ORDER BY u.name ASC
      LIMIT ${limit}
    `;
  },

  /**
   * Partner picker for the inscription wizard: people the player could pair up
   * with, minus anyone already signed up for the same competition (a
   * to-the-point exclusion — offering an unavailable partner is exactly the
   * kind of dead end the wizard must not create).
   */
  async searchOrgPartners(input: SearchOrgPartnersInput): Promise<UserCandidate[]> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const leagueId = input.excludeRegisteredInLeagueId ?? null;
    return prisma.$queryRaw<UserCandidate[]>`
      SELECT u.id, u.name, u.avatar_url AS "avatarUrl"
      FROM users u
      WHERE u.deleted_at IS NULL
        AND u.blocked_at IS NULL
        AND u.id != ${input.callerId}
        AND (
          ${input.organizationId}::text IS NULL
          OR EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.user_id = u.id AND om.organization_id = ${input.organizationId}
          )
        )
        AND (
          ${leagueId}::text IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM league_registrations lr
            JOIN team_members tm ON tm.team_id = lr.team_id
            WHERE lr.league_id = ${leagueId}
              AND lr.withdrawn_at IS NULL
              AND tm.user_id = u.id
          )
        )
        AND unaccent(LOWER(u.name)) LIKE unaccent(LOWER('%' || ${input.q} || '%'))
      ORDER BY u.name ASC
      LIMIT ${limit}
    `;
  },
} as const;
