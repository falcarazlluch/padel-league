// Tiny formatters shared by notification bodies, email templates, etc.
// Keep this module pure (no DB access) — callers fetch the data and pass it in.

/**
 * Format a list of sets as a short score string for notifications:
 *   [{ setNumber: 1, gamesA: 6, gamesB: 4 }, { setNumber: 2, gamesA: 6, gamesB: 3 }]
 *   → "6-4, 6-3"
 *
 * Sorted by setNumber ascending. Tiebreaks/super-tiebreaks are rendered
 * literally (the gamesA/gamesB values already carry them in this schema).
 */
export function formatSetScore(
  sets: ReadonlyArray<{ setNumber: number; gamesA: number; gamesB: number }>,
): string {
  if (sets.length === 0) return '';
  return [...sets]
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((s) => `${s.gamesA}-${s.gamesB}`)
    .join(', ');
}

/**
 * Human-friendly Madrid-local date+time for notification bodies.
 * "sábado, 13 de mayo de 2026, 18:30". Returns undefined if no date.
 */
export function formatMatchDateTime(date: Date | null | undefined): string | undefined {
  if (!date) return undefined;
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
}
