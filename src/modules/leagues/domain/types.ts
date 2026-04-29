import type { LeagueStatus, MatchFormat, MatchStatus, DisputeResolution, TeamCategory } from '@prisma/client';

export type LeagueRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  registrationStart: Date;
  registrationEnd: Date;
  startDate: Date;
  endDate: Date;
  status: LeagueStatus;
  category: TeamCategory;
  matchFormat: MatchFormat;
  defaultDeadlineDays: number;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  createdByUserId: string;
  createdAt: Date;
};

export type TeamRow = {
  id: string;
  leagueId: string;
  name: string;
  category: TeamCategory;
  members: { userId: string; user: { id: string; name: string; email: string } }[];
};

export type MatchRow = {
  id: string;
  leagueId: string;
  teamAId: string;
  teamBId: string;
  status: MatchStatus;
  scheduledAt: Date | null;
  deadlineAt: Date;
  round: number | null;
  teamA: { id: string; name: string };
  teamB: { id: string; name: string };
};

export type StandingEntry = {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  setsFor: number;
  setsAgainst: number;
  setsDiff: number;
  gamesFor: number;
  gamesAgainst: number;
  gamesDiff: number;
};

export type CreateLeagueInput = {
  name: string;
  description?: string;
  registrationStart: Date;
  registrationEnd: Date;
  startDate: Date;
  endDate: Date;
  category?: TeamCategory;
  matchFormat?: MatchFormat;
  defaultDeadlineDays?: number;
  createdByUserId: string;
};

export type SubmitResultInput = {
  sets: { gamesA: number; gamesB: number }[];
};

export type MatchDetailRow = {
  id: string;
  leagueId: string;
  leagueSlug: string;
  teamAId: string;
  teamBId: string;
  teamA: { id: string; name: string; members: { userId: string; user: { name: string } }[] };
  teamB: { id: string; name: string; members: { userId: string; user: { name: string } }[] };
  status: MatchStatus;
  scheduledAt: Date | null;
  deadlineAt: Date;
  round: number | null;
  activeProposal: {
    id: string;
    proposedByUserId: string;
    proposedDate: Date;
  } | null;
  pendingResult: {
    id: string;
    submittedByUserId: string;
    submitterSide: 'A' | 'B' | null;
    sets: { setNumber: number; gamesA: number; gamesB: number }[];
    winnerTeamId: string | null;
  } | null;
  confirmedResult: {
    sets: { setNumber: number; gamesA: number; gamesB: number }[];
    winnerTeamId: string | null;
  } | null;
};

export type ResolveDisputeInput = {
  resolution: DisputeResolution;
  adminNote?: string;
  newDeadlineAt?: Date;
};
