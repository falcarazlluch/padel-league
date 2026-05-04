import { describe, it, expect } from 'vitest';
import { extractMentionCandidates, resolveMentionsToUserIds } from '@/modules/match-photos';

describe('extractMentionCandidates', () => {
  it('extracts a basic @mention at the start of the body', () => {
    expect(extractMentionCandidates('@alice nice shot')).toEqual(['alice']);
  });

  it('extracts multiple mentions and dedupes them (case-insensitive)', () => {
    expect(extractMentionCandidates('@Alice @bob @ALICE great game')).toEqual(['alice', 'bob']);
  });

  it('does NOT treat email-looking strings as mentions', () => {
    // The "@" must be at the start or preceded by whitespace.
    expect(extractMentionCandidates('reach me at alice@example.com')).toEqual([]);
  });

  it('handles Spanish characters in mentions', () => {
    expect(extractMentionCandidates('genial @José y @María')).toEqual(['josé', 'maría']);
  });

  it('rejects mentions shorter than 2 chars', () => {
    expect(extractMentionCandidates('@a too short')).toEqual([]);
  });

  it('caps mentions at 30 characters', () => {
    const longHandle = 'a'.repeat(40);
    expect(extractMentionCandidates(`@${longHandle}`)).toEqual([
      'a'.repeat(30),
    ]);
  });

  it('returns empty array for empty/non-string input', () => {
    expect(extractMentionCandidates('')).toEqual([]);
    expect(extractMentionCandidates(null as unknown as string)).toEqual([]);
  });
});

describe('resolveMentionsToUserIds', () => {
  const participants = [
    { id: 'u1', name: 'Alice Smith' },
    { id: 'u2', name: 'Bob' },
    { id: 'u3', name: 'María Pérez' },
  ];

  it('matches a candidate against the participant first name', () => {
    expect(resolveMentionsToUserIds(['alice'], participants)).toEqual(['u1']);
  });

  it('matches against the full name when the participant has a single word', () => {
    expect(resolveMentionsToUserIds(['bob'], participants)).toEqual(['u2']);
  });

  it('matches Spanish first names', () => {
    expect(resolveMentionsToUserIds(['maría'], participants)).toEqual(['u3']);
  });

  it('returns empty when no candidate matches anyone', () => {
    expect(resolveMentionsToUserIds(['charlie'], participants)).toEqual([]);
  });

  it('returns an empty list for empty candidates', () => {
    expect(resolveMentionsToUserIds([], participants)).toEqual([]);
  });

  it('matches case-insensitively', () => {
    expect(resolveMentionsToUserIds(['ALICE'], participants)).toEqual(['u1']);
  });
});
