/**
 * Conservative @mention parser. Extracts plausible candidates from a comment
 * body so the service can match them against the match's participant roster
 * (the only people allowed to receive a mention notification).
 *
 * Rules:
 *  - "@" followed by 2-30 characters from a permissive set: letters,
 *    digits, ASCII underscore, and the Spanish letters most commonly used
 *    in player names. Names with spaces are NOT supported in v1 — pick the
 *    first word.
 *  - The "@" must be at the start of the body or preceded by whitespace,
 *    so e-mail-looking strings like "alice@example.com" do not produce
 *    spurious mentions.
 *  - Returns lowercased candidates without the "@" prefix; deduplicated.
 *
 * The matching against the participant roster (case-insensitive, prefix-
 * sensitive) is intentionally NOT in this file — it requires a DB query
 * and is owned by the service.
 */
const MENTION_RE = /(?:^|\s)@([\p{L}\p{N}_]{2,30})/gu;

export function extractMentionCandidates(body: string): string[] {
  if (!body || typeof body !== 'string') return [];
  const out = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    const candidate = match[1];
    if (candidate) out.add(candidate.toLowerCase());
  }
  return Array.from(out);
}

/**
 * Match a list of mention candidates against a list of participant names.
 * Comparison is case-insensitive and matches either:
 *   - exact full name (lowercased), OR
 *   - the first word of the participant's name (since mentions don't carry
 *     spaces).
 *
 * Returns the user IDs whose name matched any candidate.
 */
export function resolveMentionsToUserIds(
  candidates: string[],
  participants: Array<{ id: string; name: string }>,
): string[] {
  if (candidates.length === 0) return [];
  const candidateSet = new Set(candidates.map((c) => c.toLowerCase()));
  const matched = new Set<string>();
  for (const p of participants) {
    const normalisedFull = p.name.trim().toLowerCase();
    const firstWord = normalisedFull.split(/\s+/)[0] ?? '';
    if (candidateSet.has(normalisedFull) || (firstWord.length >= 2 && candidateSet.has(firstWord))) {
      matched.add(p.id);
    }
  }
  return Array.from(matched);
}
