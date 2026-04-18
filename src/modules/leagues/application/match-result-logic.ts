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
