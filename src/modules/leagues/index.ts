export { LeagueService } from './application/league-service';
export { MatchService } from './application/match-service';
export { SchedulingService } from './application/scheduling-service';
export { generateFixtures } from './application/fixture-generator';
export { calculateStandings } from './application/standings-calculator';
export { CategoryProposalService } from './application/category-proposal-service';
export type {
  LeagueRow,
  TeamRow,
  MatchRow,
  MatchDetailRow,
  StandingEntry,
  CreateLeagueInput,
  CreateTeamInput,
  SubmitResultInput,
  ResolveDisputeInput,
} from './domain/types';
export { CATEGORY_VALUES, CATEGORY_LABEL, categoryBadgeClass } from './domain/category';
