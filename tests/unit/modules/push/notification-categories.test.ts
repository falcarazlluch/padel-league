import { describe, it, expect } from 'vitest';
import type { NotificationType } from '@prisma/client';
import {
  categoryFor,
  isEnabled,
  DEFAULT_PREFERENCES,
  ALL_CATEGORIES,
} from '@/modules/push';

// Authoritative list — duplicated here so an accidental enum change makes the
// test fail until the category map is updated.
const ALL_TYPES: NotificationType[] = [
  'TEAM_INVITATION',
  'TEAM_INVITATION_ACCEPTED',
  'TEAM_INVITATION_REJECTED',
  'TEAM_MEMBER_LEFT',
  'INDEPENDENT_MATCH_INVITE',
  'INDEPENDENT_MATCH_JOIN_REQUEST',
  'INDEPENDENT_MATCH_CONFIRMED',
  'INDEPENDENT_MATCH_CANCELLED',
  'MATCH_ASSIGNED',
  'DATE_PROPOSED',
  'DATE_ACCEPTED',
  'DATE_REJECTED',
  'EXTENSION_PROPOSED',
  'EXTENSION_ACCEPTED',
  'EXTENSION_REJECTED',
  'DEADLINE_REMINDER',
  'INDEPENDENT_MATCH_DATE_CHANGED',
  'RESULT_SUBMITTED',
  'RESULT_CONFIRMED',
  'RESULT_REJECTED',
  'COMMENTARY_GENERATED',
  'DISPUTE_OPENED',
  'DISPUTE_RESOLVED',
  'MATCH_PHOTO_UPLOADED',
  'MATCH_PHOTO_COMMENT',
  'MATCH_PHOTO_MENTION',
  'INDEPENDENT_MATCH_CHAT',
  'LEAGUE_STARTING',
  'LEAGUE_FINISHED',
  'LEAGUE_REGISTRATION_OPEN',
  'LEAGUE_REGISTRATION_ADDED',
  'LEAGUE_REGISTRATION_REMOVED',
  'CATEGORY_CHANGE_PROPOSED',
];

describe('push notification categories', () => {
  it('maps every NotificationType to one of the known categories', () => {
    for (const type of ALL_TYPES) {
      const cat = categoryFor(type);
      expect(ALL_CATEGORIES).toContain(cat);
    }
  });

  it('routes chat-related types to the chat category', () => {
    expect(categoryFor('INDEPENDENT_MATCH_CHAT')).toBe('chat');
  });

  it('routes photo-related types to the photos category', () => {
    expect(categoryFor('MATCH_PHOTO_UPLOADED')).toBe('photos');
    expect(categoryFor('MATCH_PHOTO_COMMENT')).toBe('photos');
    expect(categoryFor('MATCH_PHOTO_MENTION')).toBe('photos');
  });

  it('routes invitation-related types to invitations', () => {
    expect(categoryFor('TEAM_INVITATION')).toBe('invitations');
    expect(categoryFor('INDEPENDENT_MATCH_INVITE')).toBe('invitations');
    expect(categoryFor('INDEPENDENT_MATCH_CONFIRMED')).toBe('invitations');
  });

  it('default preferences have chat OFF, everything else ON', () => {
    expect(DEFAULT_PREFERENCES.pushChat).toBe(false);
    expect(DEFAULT_PREFERENCES.pushInvitations).toBe(true);
    expect(DEFAULT_PREFERENCES.pushMatchDates).toBe(true);
    expect(DEFAULT_PREFERENCES.pushResults).toBe(true);
    expect(DEFAULT_PREFERENCES.pushPhotos).toBe(true);
    expect(DEFAULT_PREFERENCES.pushLeagueEvents).toBe(true);
  });

  it('isEnabled honours the matching flag', () => {
    expect(isEnabled(DEFAULT_PREFERENCES, 'chat')).toBe(false);
    expect(isEnabled(DEFAULT_PREFERENCES, 'invitations')).toBe(true);
    expect(isEnabled({ ...DEFAULT_PREFERENCES, pushPhotos: false }, 'photos')).toBe(false);
  });
});
