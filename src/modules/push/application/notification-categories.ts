import type { NotificationType } from '@prisma/client';

// Push channels exposed to the user in /perfil. Every NotificationType maps to
// exactly one channel — see CATEGORY_BY_TYPE below. Adding a new
// NotificationType must update the map or it will fall through to a default
// channel (we treat unmapped types as `leagueEvents` and log a warning).
export type PushCategory =
  | 'invitations'
  | 'matchDates'
  | 'results'
  | 'photos'
  | 'chat'
  | 'leagueEvents';

export const ALL_CATEGORIES: readonly PushCategory[] = [
  'invitations',
  'matchDates',
  'results',
  'photos',
  'chat',
  'leagueEvents',
] as const;

const CATEGORY_BY_TYPE: Record<NotificationType, PushCategory> = {
  // Invitations / participation
  TEAM_INVITATION: 'invitations',
  TEAM_INVITATION_ACCEPTED: 'invitations',
  TEAM_INVITATION_REJECTED: 'invitations',
  TEAM_MEMBER_LEFT: 'invitations',
  INDEPENDENT_MATCH_INVITE: 'invitations',
  INDEPENDENT_MATCH_JOIN_REQUEST: 'invitations',
  INDEPENDENT_MATCH_CONFIRMED: 'invitations',
  INDEPENDENT_MATCH_CANCELLED: 'invitations',
  // Guided tournament enrolment. These ride the `invitations` channel because
  // they are all time-critical asks aimed at one specific person — muting them
  // would silently strand a half-finished inscription.
  TOURNAMENT_PARTNER_INVITE: 'invitations',
  TOURNAMENT_PARTNER_ACCEPTED: 'invitations',
  TOURNAMENT_PARTNER_DECLINED: 'invitations',
  TOURNAMENT_ENROLLMENT_COMPLETED: 'invitations',

  // Match scheduling
  MATCH_ASSIGNED: 'matchDates',
  DATE_PROPOSED: 'matchDates',
  DATE_ACCEPTED: 'matchDates',
  DATE_REJECTED: 'matchDates',
  EXTENSION_PROPOSED: 'matchDates',
  EXTENSION_ACCEPTED: 'matchDates',
  EXTENSION_REJECTED: 'matchDates',
  DEADLINE_REMINDER: 'matchDates',
  INDEPENDENT_MATCH_DATE_CHANGED: 'matchDates',

  // Results
  RESULT_SUBMITTED: 'results',
  RESULT_CONFIRMED: 'results',
  RESULT_REJECTED: 'results',
  COMMENTARY_GENERATED: 'results',
  DISPUTE_OPENED: 'results',
  DISPUTE_RESOLVED: 'results',

  // Photos
  MATCH_PHOTO_UPLOADED: 'photos',
  MATCH_PHOTO_COMMENT: 'photos',
  MATCH_PHOTO_MENTION: 'photos',

  // Chat (noisier; default OFF in NotificationPreference)
  INDEPENDENT_MATCH_CHAT: 'chat',

  // League lifecycle + governance
  LEAGUE_STARTING: 'leagueEvents',
  LEAGUE_FINISHED: 'leagueEvents',
  LEAGUE_REGISTRATION_OPEN: 'leagueEvents',
  LEAGUE_REGISTRATION_ADDED: 'leagueEvents',
  LEAGUE_REGISTRATION_REMOVED: 'leagueEvents',
  CATEGORY_CHANGE_PROPOSED: 'leagueEvents',
};

export function categoryFor(type: NotificationType): PushCategory {
  return CATEGORY_BY_TYPE[type] ?? 'leagueEvents';
}

// Map the typed preference column to a category key. Keep in sync with the
// NotificationPreference Prisma model.
export type PreferenceFlags = Readonly<{
  pushInvitations: boolean;
  pushMatchDates: boolean;
  pushResults: boolean;
  pushPhotos: boolean;
  pushChat: boolean;
  pushLeagueEvents: boolean;
}>;

export function isEnabled(prefs: PreferenceFlags, category: PushCategory): boolean {
  switch (category) {
    case 'invitations':
      return prefs.pushInvitations;
    case 'matchDates':
      return prefs.pushMatchDates;
    case 'results':
      return prefs.pushResults;
    case 'photos':
      return prefs.pushPhotos;
    case 'chat':
      return prefs.pushChat;
    case 'leagueEvents':
      return prefs.pushLeagueEvents;
  }
}

export const DEFAULT_PREFERENCES: PreferenceFlags = {
  pushInvitations: true,
  pushMatchDates: true,
  pushResults: true,
  pushPhotos: true,
  pushChat: false,
  pushLeagueEvents: true,
};
