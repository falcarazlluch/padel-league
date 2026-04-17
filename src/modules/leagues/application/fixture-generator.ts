type FixtureMatch = {
  teamAId: string;
  teamBId: string;
  deadlineAt: Date;
};

export function generateFixtures(
  _teamIds: string[],
  _leagueStartDate: Date,
  _defaultDeadlineDays: number,
): FixtureMatch[] {
  throw new Error('Not implemented yet');
}
