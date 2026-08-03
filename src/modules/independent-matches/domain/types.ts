import type { IndependentMatchStatus, MatchVisibility, ParticipantStatus } from '@prisma/client';

export type IndependentMatchRow = {
  id: string;
  name: string;
  visibility: MatchVisibility;
  organizerId: string;
  hostTeamId: string | null;
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
  hostTeam: { id: string; name: string; logoUrl: string | null } | null;
  league: { id: string; name: string; slug: string } | null;
  participants: { userId: string; user: { id: string; name: string; avatarUrl: string | null }; status: ParticipantStatus }[];
  invitations: {
    id: string;
    email: string | null;
    invitedUserId: string | null;
    invitedUser: { id: string; name: string } | null;
    invitedTeamId: string | null;
    invitedTeam: { id: string; name: string; logoUrl: string | null } | null;
    acceptedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
  }[];
};

export type CreateOpenMatchInput = {
  organizerId: string;
  /** Tenant propietario. `undefined`/`null` = plataforma pública. */
  organizationId?: string | null;
  name: string;
  visibility: MatchVisibility;
  hostTeamId?: string;
  scheduledAt?: Date;
  location?: string;
  description?: string;
  maxPlayers: 2 | 4;
};
