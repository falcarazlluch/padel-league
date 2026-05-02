import type { CalendarEvent } from './types';

const CRLF = '\r\n';

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatUtc(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function foldLine(line: string): string {
  // RFC 5545: lines longer than 75 octets must be folded with CRLF + single space.
  // We approximate using char length; tolerable for our short fields.
  if (line.length <= 75) return line;
  const out: string[] = [];
  out.push(line.slice(0, 75));
  let rest = line.slice(75);
  while (rest.length > 0) {
    out.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return out.join(CRLF);
}

export function buildIcsString(event: CalendarEvent): string {
  const dtstart = formatUtc(event.startUtc);
  const dtend = formatUtc(new Date(event.startUtc.getTime() + event.durationMinutes * 60_000));
  const dtstamp = formatUtc(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PadelLeague//Match//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
  ];
  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }
  lines.push(`URL:${event.url}`);

  if (event.alarmMinutes > 0) {
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push('DESCRIPTION:Recordatorio');
    lines.push(`TRIGGER:-PT${event.alarmMinutes}M`);
    lines.push('END:VALARM');
  }

  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join(CRLF) + CRLF;
}
