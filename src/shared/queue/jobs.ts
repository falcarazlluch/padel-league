export type JobMap = {
  noop: { ping: string };
  'send-email': {
    template: string;
    to: string;
    data: Record<string, unknown>;
    dedupKey?: string;
  };
  'match-auto-approve-result': { matchResultId: string };
  'match-reminder': { matchId: string; kind: 'initial' | 'mid' | 'final' };
  'generate-match-commentary': { matchId: string };
  'league-finalize': { leagueId: string };
  'session-cleanup': Record<string, never>;
  'anonymize-user': { userId: string };
};

export type JobName = keyof JobMap;

export const ALL_JOB_NAMES: JobName[] = [
  'noop',
  'send-email',
  'match-auto-approve-result',
  'match-reminder',
  'generate-match-commentary',
  'league-finalize',
  'session-cleanup',
  'anonymize-user',
];
