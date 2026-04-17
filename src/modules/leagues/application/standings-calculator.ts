import type { StandingEntry } from '../domain/types';

type ConfirmedMatch = {
  teamAId: string;
  teamBId: string;
  winnerTeamId: string | null;
  sets: { gamesA: number; gamesB: number }[];
};

export function calculateStandings(
  teamNames: Record<string, string>,
  confirmedMatches: ConfirmedMatch[],
): StandingEntry[] {
  const map = new Map<string, StandingEntry>();

  for (const [teamId, teamName] of Object.entries(teamNames)) {
    map.set(teamId, {
      teamId, teamName, played: 0, won: 0, drawn: 0, lost: 0, points: 0,
      setsFor: 0, setsAgainst: 0, setsDiff: 0,
      gamesFor: 0, gamesAgainst: 0, gamesDiff: 0,
    });
  }

  for (const match of confirmedMatches) {
    const a = map.get(match.teamAId);
    const b = map.get(match.teamBId);
    if (!a || !b) continue;

    a.played++;
    b.played++;

    let setsWonA = 0;
    let setsWonB = 0;
    for (const set of match.sets) {
      if (set.gamesA > set.gamesB) setsWonA++;
      else if (set.gamesB > set.gamesA) setsWonB++;
      a.gamesFor += set.gamesA;
      a.gamesAgainst += set.gamesB;
      b.gamesFor += set.gamesB;
      b.gamesAgainst += set.gamesA;
    }

    a.setsFor += setsWonA;
    a.setsAgainst += setsWonB;
    b.setsFor += setsWonB;
    b.setsAgainst += setsWonA;

    if (match.winnerTeamId === match.teamAId) {
      a.won++; a.points += 3; b.lost++;
    } else if (match.winnerTeamId === match.teamBId) {
      b.won++; b.points += 3; a.lost++;
    } else {
      a.drawn++; a.points++; b.drawn++; b.points++;
    }
  }

  for (const entry of map.values()) {
    entry.setsDiff = entry.setsFor - entry.setsAgainst;
    entry.gamesDiff = entry.gamesFor - entry.gamesAgainst;
  }

  return [...map.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.setsDiff !== a.setsDiff) return b.setsDiff - a.setsDiff;
    if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
    return b.setsFor - a.setsFor;
  });
}
