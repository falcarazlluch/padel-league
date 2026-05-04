export function determineWinner(
  teamAId: string,
  teamBId: string,
  sets: { gamesA: number; gamesB: number }[],
): string | null {
  if (sets.length === 0) throw new Error('determineWinner requires at least one set.');
  const setsWonA = sets.filter((s) => s.gamesA > s.gamesB).length;
  const setsWonB = sets.filter((s) => s.gamesB > s.gamesA).length;
  if (setsWonA > setsWonB) return teamAId;
  if (setsWonB > setsWonA) return teamBId;
  return null;
}

export function getSubmitterSide(
  userId: string,
  teamAMemberIds: string[],
  teamBMemberIds: string[],
): 'A' | 'B' | null {
  if (teamAMemberIds.includes(userId)) return 'A';
  if (teamBMemberIds.includes(userId)) return 'B';
  return null;
}

/**
 * Resolve the submitter's side preferring the snapshot stored on the
 * `MatchResult.submitterTeamId` column (immune to roster changes after
 * submission). Falls back to deriving from the live roster only when the
 * snapshot is missing — i.e. legacy rows pre-dating the column.
 */
export function resolveSubmitterSide(
  result: { submitterTeamId: string | null; submittedByUserId: string },
  match: { teamAId: string; teamBId: string },
  teamAMemberIds: string[],
  teamBMemberIds: string[],
): 'A' | 'B' | null {
  if (result.submitterTeamId === match.teamAId) return 'A';
  if (result.submitterTeamId === match.teamBId) return 'B';
  return getSubmitterSide(result.submittedByUserId, teamAMemberIds, teamBMemberIds);
}
