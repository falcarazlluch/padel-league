import { prisma } from '@/shared/db/client';

export type UserCandidate = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export interface SearchCandidatesInput {
  q: string;
  teamId: string;
  callerId: string;
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
} as const;
