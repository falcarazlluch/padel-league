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
  'generate-match-commentary': {
    matchId: string;
    type: 'PREVIEW' | 'RECAP';
    regenerate?: boolean;
  };
  'league-finalize': { leagueId: string };
  'session-cleanup': Record<string, never>;
  'anonymize-user': { userId: string };
  'send-push': { notificationId: string };
};

export type JobName = keyof JobMap;

// Names of queues we actually create + drain. `match-reminder` is declared in
// JobMap as a future feature but has no handler yet; including it here would
// cause the drainer to issue a useless fetch on every heartbeat.
export const ALL_JOB_NAMES: JobName[] = [
  'noop',
  'send-email',
  'match-auto-approve-result',
  'generate-match-commentary',
  'league-finalize',
  'session-cleanup',
  'anonymize-user',
  'send-push',
];
