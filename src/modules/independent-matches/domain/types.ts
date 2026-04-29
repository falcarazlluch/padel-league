import type { IndependentMatchStatus, IndependentMatchType, JoinRequestStatus, ParticipantStatus } from '@prisma/client';

export type IndependentMatchRow = {
  id: string;
  name: string;
  type: IndependentMatchType;
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
  joinRequests: { id: string; userId: string; user: { id: string; name: string }; status: JoinRequestStatus; createdAt: Date }[];
  invitations: { id: string; email: string; acceptedAt: Date | null; createdAt: Date }[];
};

export type CreateOpenMatchInput = {
  organizerId: string;
  name: string;
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
