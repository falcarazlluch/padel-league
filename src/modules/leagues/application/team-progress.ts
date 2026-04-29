type ProgressMatch = {
  teamAId: string;
  teamBId: string;
  status: 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED';
  winnerTeamId: string | null;
  /** Timestamp used to order the match (e.g. updatedAt). */
  finalizedAt: Date;
};

export type ProgressPoint = {
  matchIndex: number; // 1-based
  wins: number;
  losses: number;
  draws: number;
};

/**
 * Compute cumulative W/D/L progression for a single team over its played matches.
 * Matches are sorted chronologically by `finalizedAt`. Expired matches count as
 * losses for both teams (a forfeit). Pure — no DB access.
 */
export function computeTeamProgress(
  matches: ProgressMatch[],
  teamId: string,
): ProgressPoint[] {
  const teamMatches = matches
    .filter((m) => m.teamAId === teamId || m.teamBId === teamId)
    .slice()
    .sort((a, b) => a.finalizedAt.getTime() - b.finalizedAt.getTime());

  let wins = 0;
  let losses = 0;
  let draws = 0;
  const points: ProgressPoint[] = [];
  teamMatches.forEach((m, i) => {
    if (m.status === 'EXPIRED_UNPLAYED') {
      losses++;
    } else if (m.winnerTeamId === teamId) {
      wins++;
    } else if (m.winnerTeamId === null) {
      draws++;
    } else {
      losses++;
    }
    points.push({ matchIndex: i + 1, wins, losses, draws });
  });
  return points;
}
