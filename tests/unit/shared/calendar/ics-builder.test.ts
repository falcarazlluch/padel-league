import { describe, it, expect } from 'vitest';
import { buildIcsString } from '@/shared/calendar/ics-builder';
import type { CalendarEvent } from '@/shared/calendar/types';

const baseEvent: CalendarEvent = {
  uid: 'match-abc@padelleague.app',
  sequence: 0,
  summary: 'Sábado por la tarde',
  description: 'Organiza Juan',
  location: 'Club de Pádel',
  url: 'https://example.com/jugar/abc',
  startUtc: new Date('2026-05-03T17:00:00Z'),
  durationMinutes: 90,
  alarmMinutes: 60,
};

describe('buildIcsString', () => {
  it('wraps in VCALENDAR + VEVENT envelopes with CRLF line endings', () => {
    const ics = buildIcsString(baseEvent);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    // Ensure CRLF line separators (no bare \n inside the body).
    expect(ics.split('\r\n').length).toBeGreaterThan(5);
  });

  it('emits DTSTART, DTEND, UID, SUMMARY, LOCATION, URL', () => {
    const ics = buildIcsString(baseEvent);
    expect(ics).toContain('UID:match-abc@padelleague.app');
    expect(ics).toContain('DTSTART:20260503T170000Z');
    expect(ics).toContain('DTEND:20260503T183000Z');
    expect(ics).toContain('SUMMARY:Sábado por la tarde');
    expect(ics).toContain('LOCATION:Club de Pádel');
    expect(ics).toContain('URL:https://example.com/jugar/abc');
  });

  it('emits a VALARM block when alarmMinutes > 0', () => {
    const ics = buildIcsString(baseEvent);
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT60M');
    expect(ics).toContain('END:VALARM');
  });

  it('omits the VALARM block when alarmMinutes is 0', () => {
    const ics = buildIcsString({ ...baseEvent, alarmMinutes: 0 });
    expect(ics).not.toContain('BEGIN:VALARM');
  });

  it('omits the LOCATION property when location is null', () => {
    const ics = buildIcsString({ ...baseEvent, location: null });
    expect(ics).not.toContain('LOCATION:');
  });

  it('escapes special chars in summary, location and description', () => {
    const ics = buildIcsString({
      ...baseEvent,
      summary: 'Match: A, B; "tonight"',
      location: 'Club; calle 1, 2',
      description: 'Line 1\nLine 2; with backslash \\',
    });
    expect(ics).toContain('SUMMARY:Match: A\\, B\\; "tonight"');
    expect(ics).toContain('LOCATION:Club\\; calle 1\\, 2');
    expect(ics).toContain('DESCRIPTION:Line 1\\nLine 2\\; with backslash \\\\');
  });

  it('folds long lines per RFC 5545', () => {
    const longSummary = 'A'.repeat(150);
    const ics = buildIcsString({ ...baseEvent, summary: longSummary });
    // Find the SUMMARY line (it should be folded across multiple lines).
    const lines = ics.split('\r\n');
    const summaryStart = lines.findIndex((l) => l.startsWith('SUMMARY:'));
    expect(summaryStart).toBeGreaterThanOrEqual(0);
    // Line at summaryStart is at most 75 octets; the next line starts with a space (continuation).
    expect(lines[summaryStart]!.length).toBeLessThanOrEqual(75);
    expect(lines[summaryStart + 1]!.startsWith(' ')).toBe(true);
  });

  it('includes SEQUENCE', () => {
    const ics = buildIcsString({ ...baseEvent, sequence: 17 });
    expect(ics).toContain('SEQUENCE:17');
  });
});
