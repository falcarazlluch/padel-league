import type {
  LeagueStatus,
  MatchFormat,
  MatchStatus,
  DisputeResolution,
  TeamCategory,
  CompetitionType,
  AmericanaVariant,
  AmericanaRoundFormat,
  BracketSeeding,
} from '@prisma/client';

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
  type: CompetitionType;
  americanaVariant: AmericanaVariant | null;
  americanaRoundFormat: AmericanaRoundFormat | null;
  americanaTargetGames: number | null;
  americanaRoundMinutes: number | null;
  americanaCourts: number | null;
  hasGroupPhase: boolean;
  groupCount: number | null;
  teamsPerGroup: number | null;
  qualifiersPerGroup: number | null;
  bracketSeedingMode: BracketSeeding | null;
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
  logoUrl: string | null;
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

// Configuración específica por tipo. Solo el bloque que corresponde al `type`
// se rellena; el resto queda null en BD. La validación del XOR vive en la
// capa de aplicación (`LeagueService.create` y el action `createLeagueAction`).
export type CreateLeagueAmericanaConfig = {
  americanaVariant: AmericanaVariant;
  americanaRoundFormat: AmericanaRoundFormat;
  americanaTargetGames?: number; // default 8 cuando roundFormat=FIRST_TO_GAMES
  americanaRoundMinutes?: number; // default 20 cuando roundFormat=BY_TIME
  americanaCourts: number; // 1..4
};

export type CreateLeagueTournamentConfig = {
  hasGroupPhase: boolean;
  groupCount?: number;
  teamsPerGroup?: number;
  qualifiersPerGroup?: number;
  bracketSeedingMode?: BracketSeeding; // default AUTO
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
  type?: CompetitionType; // default LEAGUE para compatibilidad con call-sites existentes
  americana?: CreateLeagueAmericanaConfig;
  tournament?: CreateLeagueTournamentConfig;
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
