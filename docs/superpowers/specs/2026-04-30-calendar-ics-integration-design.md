# Calendar (.ics) integration for matches — design

**Status:** approved (brainstorming closed 2026-04-30)
**Author:** PadelLeague
**Scope:** "Add to calendar" link for any scheduled match (independent or league). Generates an iCalendar (`.ics`) on demand, no OAuth, no Microsoft-specific integration.

## Goal

When a match has a confirmed date, let the user download an `.ics` file that adds the match to their calendar (Outlook, Google Calendar, Apple Calendar, etc.). Include the link both on the match detail page and in the email invitation.

## Non-goals

- OAuth integration with Microsoft Graph (creating events directly in the user's calendar without intervention).
- Outlook-specific deep links — `.ics` already covers Outlook and every other major calendar without per-vendor work.
- Two-way sync / push updates: if the match date changes, the user re-downloads. Calendars dedupe via stable UID + SEQUENCE.
- Cancellation propagation (`STATUS:CANCELLED`).
- ATTENDEE / METHOD:REQUEST flows (RSVP loops). Only METHOD:PUBLISH ("here's an event you can add").
- Subscribable calendar feeds (URL the calendar app polls).
- Per-user time-zone preferences. Times are written in UTC; the calendar app shows local time.
- Tracking who downloaded the .ics.

## Approved decisions

| # | Question | Answer |
|---|---|---|
| 1 | Technical approach | A — server-rendered `.ics` file. No OAuth, no Microsoft-specific integration. |
| 2 | Event details (title, duration, location, description, alarms, UID) | Default duration 90 min. Title = match name (or `<TeamA> vs <TeamB>` for league). Description = organizer + participants + URL back. Location = `match.location`. 60-min alarm. UID stable per match. SEQUENCE bumps on update. |
| 3 | Where the link appears | B — match detail pages AND the email invitation template. |
| Auth | Endpoints require session and respect the page's visibility rules | Independent private: members/invitees only. Independent public: any logged-in user. League: any logged-in user. |

## Architecture

### Files

**Created:**

- `src/shared/calendar/ics-builder.ts` — pure function that turns a `CalendarEvent` struct into a RFC-5545-compliant `.ics` string. No I/O.
- `src/shared/calendar/match-event-builder.ts` — fetches a match (independent or league), authorises, and produces a `CalendarEvent`.
- `src/shared/calendar/types.ts` — `CalendarEvent` type + helpers.
- `src/app/api/calendar/independent-match/[id]/event.ics/route.ts` — GET endpoint for independent matches.
- `src/app/api/calendar/league-match/[id]/event.ics/route.ts` — GET endpoint for league matches.
- `src/modules/calendar/presentation/add-to-calendar-button.tsx` — small client component (anchor with `download` attr).
- `tests/unit/shared/calendar/ics-builder.test.ts`
- `tests/unit/shared/calendar/match-event-builder.test.ts`
- `tests/integration/calendar-ics-endpoint.test.ts`

**Modified:**

- `src/app/(app)/jugar/[id]/page.tsx` — render `<AddToCalendarButton>` when `scheduledAt` is set.
- `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx` — same.
- `src/worker/email-templates/ind-match-invite.tsx` — add an "Añadir al calendario" link below the existing CTA when `addToCalendarUrl` is provided.
- `src/app/(app)/jugar/[id]/actions.ts` — `inviteByEmail` and `inviteEntityToMatchAction` populate `addToCalendarUrl` when publishing the email job.

### `CalendarEvent` shape

```ts
export type CalendarEvent = {
  uid: string;            // 'match-<id>@padelleague.app'
  sequence: number;       // monotonic increasing across updates
  summary: string;
  description: string;
  location: string | null;
  url: string;            // back to the match detail page
  startUtc: Date;
  durationMinutes: number;
  alarmMinutes: number;   // 60 by default
};
```

### `buildIcsString` rules

- Wraps in `BEGIN:VCALENDAR` ... `END:VCALENDAR`.
- `PRODID:-//PadelLeague//Match//ES`.
- `METHOD:PUBLISH`.
- Single `VEVENT` per call.
- `DTSTART` / `DTEND` in UTC: `YYYYMMDDTHHMMSSZ`.
- `DTSTAMP` is the moment the .ics is generated (also UTC).
- `DTEND = DTSTART + durationMinutes`.
- Escapes `\`, `,`, `;`, `\n` per RFC 5545. Helper:
  ```ts
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  ```
- Folds lines >75 octets according to RFC 5545 (continuation with leading space).
- Adds `BEGIN:VALARM` ... `END:VALARM` with `ACTION:DISPLAY` and `TRIGGER:-PT<alarmMinutes>M` when `alarmMinutes > 0`.
- `SEQUENCE`: derived from `Math.floor(match.updatedAt.getTime() / 1000)`. Monotonic, deterministic, no extra state.

### Endpoints

Both follow the same pattern:

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { buildIndependentMatchEvent } from '@/shared/calendar/match-event-builder';
import { buildIcsString } from '@/shared/calendar/ics-builder';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getValidatedSession(sessionToken).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const built = await buildIndependentMatchEvent(id, user.id);
  if (built.kind === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (built.kind === 'not-found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (built.kind === 'no-date') return NextResponse.json({ error: 'No scheduled date' }, { status: 400 });

  const ics = buildIcsString(built.event);
  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${built.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
```

The league variant differs only in calling `buildLeagueMatchEvent(id, user.id)`.

### Authorisation in `match-event-builder.ts`

`buildIndependentMatchEvent(matchId, callerUserId)`:
1. Load the match with participants, invitations, hostTeam.
2. If not found → `{ kind: 'not-found' }`.
3. If `scheduledAt` is null → `{ kind: 'no-date' }`.
4. If `visibility === 'PRIVATE'`:
   - Caller must be in: organizer, participants, invitedUserId of any pending invitation, member of any invitedTeamId of pending invitations, or member of hostTeam. Otherwise → `{ kind: 'forbidden' }`.
5. If `visibility === 'PUBLIC'`: any logged-in user passes.
6. Build `CalendarEvent`:
   - `uid = 'match-' + match.id + '@padelleague.app'`.
   - `summary = match.name`.
   - `description = "Organiza " + match.organizer.name + "\nParticipantes: " + match.participants.map(p => p.user.name).join(", ") + "\n\nVer en la app: " + url`.
   - `location = match.location`.
   - `url = ${APP_URL}/jugar/${match.id}`.
7. Return `{ kind: 'ok', event, filename: 'partido-<slug>.ics' }`.

`buildLeagueMatchEvent(matchId, callerUserId)` is the same but always allows logged-in users (no PRIVATE check) and:
- `summary = ${teamA.name} vs ${teamB.name}`.
- `description = "<teamA.name>: <teamA.members.map(m => m.name).join(', ')> · <teamB.name>: <teamB.members.map(m => m.name).join(', ')>\n\nLiga: <league.name>"`.
- `url = ${APP_URL}/ligas/${match.league.slug}/partidos/${match.id}`.
- `location = match.location ?? null` (verify whether league `Match` has a `location` field; if not, omit).

### UI integration

`AddToCalendarButton` renders an `<a href={...} download={filename}>` styled like other secondary buttons in the app. No JS state; the browser triggers a download on click. Falls back to opening the .ics in-tab on mobile (which is fine; iOS / Outlook mobile import directly).

Insertion in match detail pages: below the `scheduledAt` line, only when `scheduledAt` is non-null. The button uses the corresponding endpoint URL.

### Email integration

`ind-match-invite.tsx` (server-rendered React Email template) gains an optional `addToCalendarUrl` prop. When present and the match has a date, render a secondary CTA "Añadir al calendario" linking to the .ics endpoint. The three publishers of `ind-match-invite` jobs (`inviteByEmail`, `inviteUserToMatchAction`, the team branch of `inviteEntityToMatchAction`) populate the URL when `match.scheduledAt` is set.

## Privacy and security

- Both endpoints require an authenticated session.
- Independent private matches enforce the same membership/invitee check that the page itself enforces.
- The .ics body contains participant names; that's the same information visible on the match page, so no extra exposure.
- `Cache-Control: private, no-store` — keep proxies and shared caches out.
- No tokens in the URL; we rely on cookie auth. Email links require the recipient to be logged in; failing that, the standard Next.js redirect-to-login flow handles it.

## Testing

Detailed test cases per the brainstorming Section 5:

### Unit
- `ics-builder.test.ts` — escaping, line folding, UTC formatting, alarm presence, snapshot of a complete event.
- `match-event-builder.test.ts` — auth branches return correct kinds; independent vs league shapes differ as specified.

### Integration
- `calendar-ics-endpoint.test.ts` — 401, 403, 404, 400, 200 paths; correct headers; body contains the expected key lines (UID, BEGIN/END VCALENDAR, BEGIN/END VEVENT).

## Risks

- **CRLF requirement**: RFC 5545 requires CRLF line endings. Some calendars are forgiving with LF, but Apple and older Outlook insist on CRLF. The builder explicitly emits `\r\n`.
- **Long descriptions** with multi-line participant lists may exceed common visualisation widths. Calendars handle this fine; just confirm no escaping bugs around `\n` (literal `\n` text within the value, not a real newline).
- **Time zone**: writing in UTC is the safest cross-vendor choice. If users in TZ-extreme regions ever complain, we can switch to `TZID=Europe/Madrid` with a VTIMEZONE block. Not now.
- **Description length**: keep under ~300 characters to avoid line-fold edge cases. Truncate participant lists at 8 names if necessary.
- **Email rendering**: React Email + Resend handles HTML well; the new "Añadir al calendario" link must be a plain `<a>` element (no JS, no fancy styling).
