import type { IndependentMatchStatus, IndependentMatchType, MatchVisibility, ParticipantStatus } from '@prisma/client';

export type IndependentMatchRow = {
  id: string;
  name: string;
  type: IndependentMatchType;
  visibility: MatchVisibility;
  organizerId: string;
  challengedTeamId: string | null;
  leagueId: string | null;
  scheduledAt: Date | null;
  location: string | null;
  description: string | null;
  maxPlayers: number;
  status: IndependentMatchStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type IndependentMatchDetail = IndependentMatchRow & {
  organizer: { id: string; name: string };
  challengedTeam: { id: string; name: string } | null;
  league: { id: string; name: string; slug: string } | null;
  participants: { userId: string; user: { id: string; name: string }; status: ParticipantStatus }[];
  invitations: {
    id: string;
    email: string | null;
    invitedUserId: string | null;
    invitedUser: { id: string; name: string } | null;
    acceptedAt: Date | null;
    createdAt: Date;
  }[];
};

export type CreateOpenMatchInput = {
  organizerId: string;
  name: string;
  visibility: MatchVisibility;
  scheduledAt?: Date;
  location?: string;
  description?: string;
  maxPlayers: 2 | 4;
};

export type CreateChallengeInput = {
  organizerId: string;
  organizerTeamId: string;
  challengedTeamId: string;
  leagueId: string;
  name: string;
  scheduledAt?: Date;
  location?: string;
  description?: string;
};

export type TeamForChallenge = {
  id: string;
  name: string;
  members: { userId: string; user: { id: string; name: string; email: string } }[];
};
