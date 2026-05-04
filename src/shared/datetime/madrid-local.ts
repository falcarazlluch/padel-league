/**
 * Treats a wall-clock string ("YYYY-MM-DDTHH:mm" or with seconds) as local
 * Europe/Madrid time and returns the corresponding UTC `Date` instant.
 *
 * Why this exists: `<input type="datetime-local">` submits a timezone-naïve
 * string. Plain `new Date(s)` interprets that string in the *runtime's* local
 * timezone. On Vercel the runtime is UTC, so a Spanish user typing "18:00"
 * ends up stored as `18:00 UTC`. When we render back with
 * `Intl.DateTimeFormat({ timeZone: 'Europe/Madrid' })` the user sees a +1/+2h
 * offset depending on DST.
 *
 * The whole app already renders datetimes in Madrid (Spanish padel league),
 * so the symmetric server-side parse is "interpret the wall-clock as Madrid"
 * regardless of what the runtime thinks "local" means.
 *
 * The helper is DST-aware via Intl.DateTimeFormat with timeZoneName.
 */
const MADRID = 'Europe/Madrid';

function getMadridOffsetMs(instantMs: number): number {
  // Format the instant in Madrid and as if it were UTC, then diff the
  // wall-clock parts to recover the offset. This works through DST
  // transitions because Intl handles them.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(instantMs)).map((p) => [p.type, p.value]),
  );
  // `hour: '2-digit'` with hour12=false can format midnight as "24" in some
  // locales — the en-CA locale used here outputs "00", but normalise just in
  // case to keep the math safe.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const madridIso = `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}Z`;
  return new Date(madridIso).getTime() - instantMs;
}

/**
 * Parse a `YYYY-MM-DDTHH:mm[:ss]` wall-clock string as Madrid local time and
 * return its UTC instant. Returns Invalid Date for malformed input.
 */
export function parseMadridLocal(input: string): Date {
  if (typeof input !== 'string') return new Date(NaN);
  const trimmed = input.trim();
  // Accept with or without seconds; reject anything else early so callers can
  // refine with `!isNaN(date.getTime())`.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return new Date(NaN);
  }
  const padded = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
  // Naïve interpretation: treat the wall-clock as if it were UTC.
  const naiveAsUtc = new Date(`${padded}Z`).getTime();
  if (Number.isNaN(naiveAsUtc)) return new Date(NaN);
  // The Madrid offset for *this wall-clock* ≈ Madrid offset at the naïve
  // instant. Off-by-an-hour can only happen during the 1h gap of a spring-
  // forward DST transition, which is far below the granularity that anyone
  // schedules a padel match at.
  const offsetMs = getMadridOffsetMs(naiveAsUtc);
  return new Date(naiveAsUtc - offsetMs);
}
