export type FixtureMatch = {
  teamAId: string;
  teamBId: string;
  deadlineAt: Date;
  round: number;
};

function shuffle(arr: string[]): string[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function generateFixtures(
  teamIds: string[],
  leagueStartDate: Date,
  defaultDeadlineDays: number,
): FixtureMatch[] {
  if (teamIds.length < 2) return [];

  const shuffled = shuffle(teamIds);
  // Pad to even count; null represents a bye
  const teams: (string | null)[] =
    shuffled.length % 2 === 0 ? [...shuffled] : [...shuffled, null];
  const n = teams.length;
  const totalRounds = n - 1;

  const deadline = new Date(leagueStartDate);
  deadline.setDate(deadline.getDate() + defaultDeadlineDays);

  const matches: FixtureMatch[] = [];
  // Circle method: teams[0] is fixed; rotate teams[1..n-1]
  const fixed = teams[0]!; // always a real team (null appended at end for odd N)
  const rotating = teams.slice(1); // length = n-1

  for (let round = 1; round <= totalRounds; round++) {
    const circle = [fixed, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = circle[i];
      const b = circle[n - 1 - i];
      // Skip bye slots
      if (a != null && b != null) {
        const teamAId = a;
        const teamBId = b;
        matches.push({ teamAId, teamBId, deadlineAt: new Date(deadline), round });
      }
    }
    // Rotate: move last element of rotating to front
    rotating.unshift(rotating.pop()!);
  }

  return matches;
}
