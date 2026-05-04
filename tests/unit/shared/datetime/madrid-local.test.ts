import { describe, it, expect } from 'vitest';
import { parseMadridLocal } from '@/shared/datetime/madrid-local';

describe('parseMadridLocal', () => {
  it('treats a summer wall-clock as Europe/Madrid (UTC+2 during DST)', () => {
    // 2026-05-20 18:00 in Madrid (CEST = UTC+2) → 16:00 UTC.
    const d = parseMadridLocal('2026-05-20T18:00');
    expect(d.toISOString()).toBe('2026-05-20T16:00:00.000Z');
  });

  it('treats a winter wall-clock as Europe/Madrid (UTC+1 outside DST)', () => {
    // 2026-01-15 18:00 in Madrid (CET = UTC+1) → 17:00 UTC.
    const d = parseMadridLocal('2026-01-15T18:00');
    expect(d.toISOString()).toBe('2026-01-15T17:00:00.000Z');
  });

  it('round-trips when the same Date is rendered back in Madrid', () => {
    const d = parseMadridLocal('2026-05-20T18:00');
    const fmt = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(fmt.format(d)).toBe('18:00');
  });

  it('accepts the YYYY-MM-DDTHH:mm:ss form', () => {
    const d = parseMadridLocal('2026-05-20T18:00:30');
    expect(d.toISOString()).toBe('2026-05-20T16:00:30.000Z');
  });

  it('returns Invalid Date for malformed input', () => {
    expect(Number.isNaN(parseMadridLocal('not-a-date').getTime())).toBe(true);
    expect(Number.isNaN(parseMadridLocal('2026-13-40T99:99').getTime())).toBe(true);
    expect(Number.isNaN(parseMadridLocal('').getTime())).toBe(true);
    expect(Number.isNaN(parseMadridLocal(null as unknown as string).getTime())).toBe(true);
  });
});
