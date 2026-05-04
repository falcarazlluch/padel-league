import type { TeamCategory, TeamInvitationStatus } from '@prisma/client';

export type TeamSummary = {
  id: string;
  name: string;
  category: TeamCategory;
  logoUrl: string | null;
  createdByUserId: string;
  createdAt: Date;
  members: { userId: string; name: string; email: string; avatarUrl: string | null }[];
  pendingInvitationCount: number;
};

export type TeamDetail = TeamSummary & {
  invitations: Array<{
    id: string;
    invitedUser: { id: string; name: string; email: string };
    invitedByUserId: string;
    status: TeamInvitationStatus;
    createdAt: Date;
  }>;
  registrations: Array<{
    id: string;
    leagueId: string;
    leagueName: string;
    leagueSlug: string;
    leagueStatus: string;
    registeredAt: Date;
    withdrawnAt: Date | null;
  }>;
};

export type IncomingInvitation = {
  id: string;
  team: { id: string; name: string; category: TeamCategory };
  invitedBy: { id: string; name: string };
  createdAt: Date;
};

export type TeamMatchHistoryEntry = {
  matchId: string;
  leagueSlug: string;
  leagueName: string;
  scheduledAt: Date | null;
  rivalTeamId: string;
  rivalTeamName: string;
  rivalLogoUrl: string | null;
  outcome: 'won' | 'lost' | 'drawn';
  setsDisplay: string;
};

export type TeamStats = {
  played: number;
  won: number;
  lost: number;
  drawn: number;
};

export type TeamPublicProfile = {
  id: string;
  name: string;
  category: TeamCategory;
  logoUrl: string | null;
  createdAt: Date;
  /** Only non-PII fields exposed publicly (no email). */
  members: { userId: string; name: string; avatarUrl: string | null }[];
  /**
   * League registrations visible publicly. We intentionally hide:
   *   - DRAFT leagues (not yet announced),
   *   - exact `withdrawnAt` timestamp / `withdrawnByUserId` (internal),
   * surfacing only `isWithdrawn` so the page can render a "retired" hint
   * without leaking lifecycle metadata.
   */
  registrations: Array<{
    id: string;
    leagueId: string;
    leagueName: string;
    leagueSlug: string;
    leagueStatus: string;
    registeredAt: Date;
    isWithdrawn: boolean;
  }>;
  history: TeamMatchHistoryEntry[];
  stats: TeamStats;
  /** True iff the viewer is a member of this team — gates management UI. */
  viewerIsMember: boolean;
};

export type CreateTeamInput = {
  name: string;
  category: TeamCategory;
  createdByUserId: string;
};

export type InviteInput = {
  teamId: string;
  invitedByUserId: string;
  /** Resolved user id of the invitee. */
  invitedUserId: string;
};
