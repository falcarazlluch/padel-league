import type { StandingEntry } from '../domain/types';

type ConfirmedMatch = {
  teamAId: string;
  teamBId: string;
  winnerTeamId: string | null;
  sets: { gamesA: number; gamesB: number }[];
};

export function calculateStandings(
  _teamNames: Record<string, string>,
  _confirmedMatches: ConfirmedMatch[],
): StandingEntry[] {
  throw new Error('Not implemented yet');
}
