import { prisma } from '@/shared/db/client';

export type TeamCandidate = {
  id: string;
  name: string;
  logoUrl: string | null;
  memberCount: number;
};

export interface SearchInvitableForMatchInput {
  q: string;
  matchId: string;
  callerId: string;
  limit?: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

export const TeamSearchService = {
  async searchInvitableForMatch(input: SearchInvitableForMatchInput): Promise<TeamCandidate[]> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    return prisma.$queryRaw<TeamCandidate[]>`
      SELECT t.id, t.name, t.logo_url AS "logoUrl",
             (SELECT COUNT(*)::int FROM team_members tm WHERE tm.team_id = t.id) AS "memberCount"
      FROM teams t
      WHERE t.id != COALESCE(
        (SELECT host_team_id FROM independent_matches WHERE id = ${input.matchId}),
        '00000000-0000-0000-0000-000000000000'
      )
        AND t.id NOT IN (
          SELECT imi.invited_team_id FROM independent_match_invitations imi
          WHERE imi.match_id = ${input.matchId}
            AND imi.invited_team_id IS NOT NULL
            AND imi.accepted_at IS NULL
        )
        AND unaccent(LOWER(t.name)) LIKE unaccent(LOWER('%' || ${input.q} || '%'))
      ORDER BY t.name ASC
      LIMIT ${limit}
    `;
  },
} as const;
