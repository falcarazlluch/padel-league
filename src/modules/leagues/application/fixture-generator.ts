type FixtureMatch = {
  teamAId: string;
  teamBId: string;
  deadlineAt: Date;
};

export function generateFixtures(
  teamIds: string[],
  leagueStartDate: Date,
  defaultDeadlineDays: number,
): FixtureMatch[] {
  const matches: FixtureMatch[] = [];
  const deadline = new Date(leagueStartDate);
  deadline.setDate(deadline.getDate() + defaultDeadlineDays);

  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      matches.push({
        teamAId: teamIds[i]!,
        teamBId: teamIds[j]!,
        deadlineAt: new Date(deadline),
      });
    }
  }

  return matches;
}
