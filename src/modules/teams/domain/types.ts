import type { TeamCategory, TeamInvitationStatus } from '@prisma/client';

export type TeamSummary = {
  id: string;
  name: string;
  category: TeamCategory;
  logoUrl: string | null;
  createdByUserId: string;
  createdAt: Date;
  members: { userId: string; name: string; email: string }[];
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

export type CreateTeamInput = {
  name: string;
  category: TeamCategory;
  createdByUserId: string;
};

export type InviteInput = {
  teamId: string;
  invitedByUserId: string;
  /** email or username (we resolve to userId in the service). */
  invitedUserIdentifier: string;
};
