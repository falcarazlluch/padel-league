# Calendar (.ics) Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-30-calendar-ics-integration-design.md`

**Goal:** Generate a downloadable `.ics` file on demand for any scheduled match (independent or league); expose it from the match detail page and the email invitation.

**Architecture:** A pure RFC-5545 builder (`ics-builder.ts`) and a thin data-aware wrapper (`match-event-builder.ts`) feed two new GET routes (one per match type). A small client component places a "Añadir al calendario" anchor on the match detail page. The email template gains an optional CTA. No OAuth, no token in URLs — auth is the existing session cookie.

**Tech Stack:** Next.js 15 App Router, Prisma 5, Vitest (unit + integration with testcontainers), React Email for the invitation template. No new dependencies.

---

## File Structure

**Created:**

- `src/shared/calendar/types.ts` — `CalendarEvent` type + branded result types.
- `src/shared/calendar/ics-builder.ts` — `buildIcsString(event)` pure function.
- `src/shared/calendar/match-event-builder.ts` — `buildIndependentMatchEvent` + `buildLeagueMatchEvent`.
- `src/app/api/calendar/independent-match/[id]/event.ics/route.ts`
- `src/app/api/calendar/league-match/[id]/event.ics/route.ts`
- `src/app/(app)/_components/add-to-calendar-button.tsx` — small client component (lives next to other shared app components).
- `tests/unit/shared/calendar/ics-builder.test.ts`
- `tests/unit/shared/calendar/match-event-builder.test.ts`
- `tests/integration/calendar-ics-endpoint.test.ts`

**Modified:**

- `src/app/(app)/jugar/[id]/page.tsx` — render the button when `match.scheduledAt` is set.
- `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx` — render the button when the league match has a confirmed date.
- `src/worker/email-templates/ind-match-invite.tsx` — accept optional `addToCalendarUrl` prop and render a secondary CTA.
- `src/app/(app)/jugar/[id]/actions.ts` — populate `addToCalendarUrl` when publishing the email job in `inviteByEmail`, `inviteEntityToMatchAction`, and `sendTeamInviteNotifications`.

---

## Task 1 — Pure `ics-builder.ts` + unit tests

**Files:**
- Create: `src/shared/calendar/types.ts`
- Create: `src/shared/calendar/ics-builder.ts`
- Create: `tests/unit/shared/calendar/ics-builder.test.ts`

- [ ] **Step 1: Write the types**

`src/shared/calendar/types.ts`:

```ts
export type CalendarEvent = {
  uid: string;
  sequence: number;
  summary: string;
  description: string;
  location: string | null;
  url: string;
  startUtc: Date;
  durationMinutes: number;
  alarmMinutes: number;
};
```

- [ ] **Step 2: Write failing unit tests**

`tests/unit/shared/calendar/ics-builder.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm test:unit -- tests/unit/shared/calendar/ics-builder.test.ts
```
Expected: import error (the file does not exist yet).

- [ ] **Step 4: Implement `ics-builder.ts`**

`src/shared/calendar/ics-builder.ts`:

```ts
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
```

- [ ] **Step 5: Run tests, expect 8/8 pass**

```bash
pnpm test:unit -- tests/unit/shared/calendar/ics-builder.test.ts
```
Expected: 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/calendar/types.ts \
        src/shared/calendar/ics-builder.ts \
        tests/unit/shared/calendar/ics-builder.test.ts
git commit -m "feat(calendar): pure ics-builder for RFC 5545 events"
```

---

## Task 2 — `match-event-builder.ts` + unit tests

**Files:**
- Create: `src/shared/calendar/match-event-builder.ts`
- Create: `tests/unit/shared/calendar/match-event-builder.test.ts`

- [ ] **Step 1: Write failing unit tests**

`tests/unit/shared/calendar/match-event-builder.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildIndependentMatchEvent, buildLeagueMatchEvent } from '@/shared/calendar/match-event-builder';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    independentMatch: { findUnique: vi.fn() },
    match: { findUnique: vi.fn() },
    teamMember: { findFirst: vi.fn() },
  },
}));

vi.mock('@/shared/config/env', () => ({
  env: () => ({ APP_URL: 'https://example.com' }),
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    independentMatch: { findUnique: ReturnType<typeof vi.fn> };
    match: { findUnique: ReturnType<typeof vi.fn> };
    teamMember: { findFirst: ReturnType<typeof vi.fn> };
  };
}

describe('buildIndependentMatchEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not-found when match does not exist', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue(null);

    const result = await buildIndependentMatchEvent('m-missing', 'u1');
    expect(result.kind).toBe('not-found');
  });

  it('returns no-date when scheduledAt is null', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      name: 'M',
      visibility: 'PUBLIC',
      organizerId: 'u1',
      scheduledAt: null,
      location: null,
      hostTeamId: null,
      updatedAt: new Date(),
      organizer: { id: 'u1', name: 'Org' },
      participants: [],
      invitations: [],
      hostTeam: null,
    });

    const result = await buildIndependentMatchEvent('m1', 'u1');
    expect(result.kind).toBe('no-date');
  });

  it('returns ok for PUBLIC match with any logged-in user', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      name: 'Sábado',
      visibility: 'PUBLIC',
      organizerId: 'u1',
      scheduledAt: new Date('2026-05-03T17:00:00Z'),
      location: 'Club',
      hostTeamId: null,
      updatedAt: new Date('2026-04-01T10:00:00Z'),
      organizer: { id: 'u1', name: 'Org' },
      participants: [{ user: { id: 'u1', name: 'Org' } }],
      invitations: [],
      hostTeam: null,
    });

    const result = await buildIndependentMatchEvent('m1', 'u-stranger');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.event.summary).toBe('Sábado');
    expect(result.event.url).toBe('https://example.com/jugar/m1');
    expect(result.event.location).toBe('Club');
    expect(result.event.uid).toBe('match-m1@padelleague.app');
  });

  it('returns forbidden for PRIVATE match when caller is not a member, invitee, or organizer', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      name: 'Privado',
      visibility: 'PRIVATE',
      organizerId: 'u1',
      scheduledAt: new Date('2026-05-03T17:00:00Z'),
      location: null,
      hostTeamId: null,
      updatedAt: new Date(),
      organizer: { id: 'u1', name: 'Org' },
      participants: [{ user: { id: 'u1', name: 'Org' } }],
      invitations: [],
      hostTeam: null,
    });
    prisma.teamMember.findFirst.mockResolvedValue(null);

    const result = await buildIndependentMatchEvent('m1', 'u-stranger');
    expect(result.kind).toBe('forbidden');
  });

  it('returns ok for PRIVATE match when caller is the organizer', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      name: 'Privado',
      visibility: 'PRIVATE',
      organizerId: 'u1',
      scheduledAt: new Date('2026-05-03T17:00:00Z'),
      location: null,
      hostTeamId: null,
      updatedAt: new Date(),
      organizer: { id: 'u1', name: 'Org' },
      participants: [{ user: { id: 'u1', name: 'Org' } }],
      invitations: [],
      hostTeam: null,
    });

    const result = await buildIndependentMatchEvent('m1', 'u1');
    expect(result.kind).toBe('ok');
  });

  it('derives sequence from updatedAt epoch / 1000', async () => {
    const prisma = await getPrisma();
    const updatedAt = new Date('2026-04-30T18:00:00Z');
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      name: 'X',
      visibility: 'PUBLIC',
      organizerId: 'u1',
      scheduledAt: new Date('2026-05-03T17:00:00Z'),
      location: null,
      hostTeamId: null,
      updatedAt,
      organizer: { id: 'u1', name: 'Org' },
      participants: [],
      invitations: [],
      hostTeam: null,
    });

    const result = await buildIndependentMatchEvent('m1', 'u-any');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.event.sequence).toBe(Math.floor(updatedAt.getTime() / 1000));
  });
});

describe('buildLeagueMatchEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not-found when match does not exist', async () => {
    const prisma = await getPrisma();
    prisma.match.findUnique.mockResolvedValue(null);

    const result = await buildLeagueMatchEvent('lm-missing', 'u1');
    expect(result.kind).toBe('not-found');
  });

  it('builds summary as "<TeamA> vs <TeamB>" and url to ligas slug', async () => {
    const prisma = await getPrisma();
    prisma.match.findUnique.mockResolvedValue({
      id: 'lm1',
      scheduledAt: new Date('2026-05-03T17:00:00Z'),
      updatedAt: new Date('2026-04-30T18:00:00Z'),
      teamA: {
        id: 'tA',
        name: 'Halcones',
        members: [{ user: { id: 'u1', name: 'Cap' } }, { user: { id: 'u2', name: 'Par' } }],
      },
      teamB: {
        id: 'tB',
        name: 'Tigres',
        members: [{ user: { id: 'u3', name: 'C' } }, { user: { id: 'u4', name: 'D' } }],
      },
      league: { id: 'l1', name: 'Liga Otoño', slug: 'liga-otono' },
    });

    const result = await buildLeagueMatchEvent('lm1', 'u-any');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.event.summary).toBe('Halcones vs Tigres');
    expect(result.event.url).toBe('https://example.com/ligas/liga-otono/partidos/lm1');
    expect(result.event.uid).toBe('match-lm1@padelleague.app');
  });

  it('returns no-date when scheduledAt is null', async () => {
    const prisma = await getPrisma();
    prisma.match.findUnique.mockResolvedValue({
      id: 'lm1',
      scheduledAt: null,
      updatedAt: new Date(),
      teamA: { id: 'tA', name: 'A', members: [] },
      teamB: { id: 'tB', name: 'B', members: [] },
      league: { id: 'l1', name: 'L', slug: 's' },
    });

    const result = await buildLeagueMatchEvent('lm1', 'u-any');
    expect(result.kind).toBe('no-date');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test:unit -- tests/unit/shared/calendar/match-event-builder.test.ts
```
Expected: import error.

- [ ] **Step 3: Implement `match-event-builder.ts`**

`src/shared/calendar/match-event-builder.ts`:

```ts
import { prisma } from '@/shared/db/client';
import { env } from '@/shared/config/env';
import type { CalendarEvent } from './types';

const DEFAULT_DURATION_MINUTES = 90;
const DEFAULT_ALARM_MINUTES = 60;

export type BuildResult =
  | { kind: 'ok'; event: CalendarEvent; filename: string }
  | { kind: 'not-found' }
  | { kind: 'forbidden' }
  | { kind: 'no-date' };

function makeFilename(slug: string): string {
  // Conservative ASCII filename — strip diacritics + non-alphanumerics.
  const cleaned = slug
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return `${cleaned || 'partido'}.ics`;
}

export async function buildIndependentMatchEvent(matchId: string, callerUserId: string): Promise<BuildResult> {
  const match = await prisma.independentMatch.findUnique({
    where: { id: matchId },
    include: {
      organizer: { select: { id: true, name: true } },
      participants: {
        where: { status: 'ACCEPTED' },
        include: { user: { select: { id: true, name: true } } },
      },
      invitations: {
        where: { acceptedAt: null },
        select: { invitedUserId: true, invitedTeamId: true, expiresAt: true },
      },
      hostTeam: { select: { id: true, members: { select: { userId: true } } } },
    },
  });
  if (!match) return { kind: 'not-found' };
  if (!match.scheduledAt) return { kind: 'no-date' };

  if (match.visibility === 'PRIVATE') {
    const isOrganizer = match.organizerId === callerUserId;
    const isParticipant = match.participants.some((p) => p.user.id === callerUserId);
    const isInvitedUser = match.invitations.some(
      (i) => i.invitedUserId === callerUserId && i.expiresAt > new Date(),
    );
    const teamInviteIds = match.invitations
      .filter((i) => i.invitedTeamId !== null && i.expiresAt > new Date())
      .map((i) => i.invitedTeamId as string);
    const isHostTeamMember = match.hostTeam?.members.some((m) => m.userId === callerUserId) ?? false;

    let isInvitedTeamMember = false;
    if (teamInviteIds.length > 0) {
      const member = await prisma.teamMember.findFirst({
        where: { userId: callerUserId, teamId: { in: teamInviteIds } },
        select: { id: true },
      });
      isInvitedTeamMember = !!member;
    }

    if (!isOrganizer && !isParticipant && !isInvitedUser && !isHostTeamMember && !isInvitedTeamMember) {
      return { kind: 'forbidden' };
    }
  }

  const participantNames = match.participants.map((p) => p.user.name);
  const description =
    `Organiza ${match.organizer.name}` +
    (participantNames.length > 0 ? `\nParticipantes: ${participantNames.join(', ')}` : '') +
    `\n\nVer en la app: ${env().APP_URL}/jugar/${match.id}`;

  const event: CalendarEvent = {
    uid: `match-${match.id}@padelleague.app`,
    sequence: Math.floor(match.updatedAt.getTime() / 1000),
    summary: match.name,
    description,
    location: match.location,
    url: `${env().APP_URL}/jugar/${match.id}`,
    startUtc: match.scheduledAt,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    alarmMinutes: DEFAULT_ALARM_MINUTES,
  };

  return { kind: 'ok', event, filename: makeFilename(match.name) };
}

export async function buildLeagueMatchEvent(matchId: string, _callerUserId: string): Promise<BuildResult> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: {
        include: { members: { include: { user: { select: { id: true, name: true } } } } },
      },
      teamB: {
        include: { members: { include: { user: { select: { id: true, name: true } } } } },
      },
      league: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!match) return { kind: 'not-found' };
  if (!match.scheduledAt) return { kind: 'no-date' };

  // League matches are visible to any logged-in user — no per-match auth check.

  const teamARoster = match.teamA.members.map((m) => m.user.name).join(', ');
  const teamBRoster = match.teamB.members.map((m) => m.user.name).join(', ');
  const description =
    `${match.teamA.name}: ${teamARoster}\n${match.teamB.name}: ${teamBRoster}\n\nLiga: ${match.league.name}\n\nVer en la app: ${env().APP_URL}/ligas/${match.league.slug}/partidos/${match.id}`;

  const event: CalendarEvent = {
    uid: `match-${match.id}@padelleague.app`,
    sequence: Math.floor(match.updatedAt.getTime() / 1000),
    summary: `${match.teamA.name} vs ${match.teamB.name}`,
    description,
    location: null, // league `Match` model has no location field today.
    url: `${env().APP_URL}/ligas/${match.league.slug}/partidos/${match.id}`,
    startUtc: match.scheduledAt,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    alarmMinutes: DEFAULT_ALARM_MINUTES,
  };

  return { kind: 'ok', event, filename: makeFilename(`${match.teamA.name}-vs-${match.teamB.name}`) };
}
```

- [ ] **Step 4: Run tests, expect all green**

```bash
pnpm test:unit -- tests/unit/shared/calendar/match-event-builder.test.ts
```
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/calendar/match-event-builder.ts \
        tests/unit/shared/calendar/match-event-builder.test.ts
git commit -m "feat(calendar): match-event-builder for independent and league matches"
```

---

## Task 3 — `/api/calendar/independent-match/[id]/event.ics` route

**Files:**
- Create: `src/app/api/calendar/independent-match/[id]/event.ics/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { buildIndependentMatchEvent } from '@/shared/calendar/match-event-builder';
import { buildIcsString } from '@/shared/calendar/ics-builder';
import { logger } from '@/shared/logger';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getValidatedSession(sessionToken).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const built = await buildIndependentMatchEvent(id, user.id);
    if (built.kind === 'not-found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (built.kind === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
  } catch (err) {
    logger().error({ err, matchId: id, userId: user.id }, 'calendar.ind-match.failed');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: GREEN.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/calendar/independent-match/[id]/event.ics/route.ts"
git commit -m "feat(api): GET /api/calendar/independent-match/[id]/event.ics"
```

---

## Task 4 — `/api/calendar/league-match/[id]/event.ics` route

**Files:**
- Create: `src/app/api/calendar/league-match/[id]/event.ics/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { buildLeagueMatchEvent } from '@/shared/calendar/match-event-builder';
import { buildIcsString } from '@/shared/calendar/ics-builder';
import { logger } from '@/shared/logger';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getValidatedSession(sessionToken).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const built = await buildLeagueMatchEvent(id, user.id);
    if (built.kind === 'not-found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (built.kind === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
  } catch (err) {
    logger().error({ err, matchId: id, userId: user.id }, 'calendar.league-match.failed');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run typecheck and tests**

```bash
pnpm typecheck
pnpm test:unit
```
Expected: GREEN.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/calendar/league-match/[id]/event.ics/route.ts"
git commit -m "feat(api): GET /api/calendar/league-match/[id]/event.ics"
```

---

## Task 5 — `AddToCalendarButton` + integration in match detail pages

**Files:**
- Create: `src/app/(app)/_components/add-to-calendar-button.tsx`
- Modify: `src/app/(app)/jugar/[id]/page.tsx`
- Modify: `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx`

- [ ] **Step 1: Create the client component**

`src/app/(app)/_components/add-to-calendar-button.tsx`:

```tsx
'use client';

interface Props {
  href: string;
}

export function AddToCalendarButton({ href }: Props) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
    >
      📅 Añadir al calendario
    </a>
  );
}
```

(`download` attribute omitted on purpose — some browsers ignore it for cross-origin / data-uri responses; the `Content-Disposition: attachment` header on the route already triggers a download in every browser.)

- [ ] **Step 2: Insert into `/jugar/[id]/page.tsx`**

Open the file. Find the block that renders `match.scheduledAt`:

```tsx
{match.scheduledAt && (
  <p className="text-sm text-gray-600 mt-1">{formatScheduledAt(match.scheduledAt)}</p>
)}
```

Replace with:

```tsx
{match.scheduledAt && (
  <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
    <p className="text-sm text-gray-600">{formatScheduledAt(match.scheduledAt)}</p>
    <AddToCalendarButton href={`/api/calendar/independent-match/${id}/event.ics`} />
  </div>
)}
```

Add the import at the top of the file:

```tsx
import { AddToCalendarButton } from '@/app/(app)/_components/add-to-calendar-button';
```

- [ ] **Step 3: Insert into `/ligas/[slug]/partidos/[matchId]/page.tsx`**

Read the page first to find the block that renders the league match's `scheduledAt`. The pattern: locate the JSX node that prints the date and, alongside it, render:

```tsx
{match.scheduledAt && (
  <AddToCalendarButton href={`/api/calendar/league-match/${match.id}/event.ics`} />
)}
```

Add the import:

```tsx
import { AddToCalendarButton } from '@/app/(app)/_components/add-to-calendar-button';
```

If the page does not currently render `scheduledAt`, add a small section near the top with `match.scheduledAt && ...`.

- [ ] **Step 4: Run typecheck and build**

```bash
pnpm typecheck
pnpm next build
```
Expected: GREEN.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/_components/add-to-calendar-button.tsx" \
        "src/app/(app)/jugar/[id]/page.tsx" \
        "src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx"
git commit -m "feat(jugar,ligas): add-to-calendar button on match detail pages"
```

---

## Task 6 — Email template + populate `addToCalendarUrl`

**Files:**
- Modify: `src/worker/email-templates/ind-match-invite.tsx`
- Modify: `src/app/(app)/jugar/[id]/actions.ts`

- [ ] **Step 1: Extend the email template**

Replace `src/worker/email-templates/ind-match-invite.tsx` with:

```tsx
import * as React from 'react';

interface Props {
  organizerName: string;
  matchName: string;
  matchUrl: string;
  scheduledAt?: string;
  location?: string;
  addToCalendarUrl?: string;
}

export function IndMatchInviteEmail({
  organizerName,
  matchName,
  matchUrl,
  scheduledAt,
  location,
  addToCalendarUrl,
}: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Te invitan a un partido de pádel</h1>
      <p><strong>{organizerName}</strong> te invita a unirte al partido <strong>&ldquo;{matchName}&rdquo;</strong>.</p>
      {scheduledAt && <p>Fecha: {scheduledAt}</p>}
      {location && <p>Lugar: {location}</p>}
      <a
        href={matchUrl}
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          background: '#0D1E45',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px',
          marginTop: '1rem',
        }}
      >
        Ver partido y unirme
      </a>
      {addToCalendarUrl && (
        <p style={{ marginTop: '0.75rem' }}>
          <a
            href={addToCalendarUrl}
            style={{
              display: 'inline-block',
              padding: '0.5rem 1rem',
              border: '1px solid #cbd5e1',
              color: '#475569',
              textDecoration: 'none',
              borderRadius: '4px',
              fontSize: '0.875rem',
            }}
          >
            📅 Añadir al calendario
          </a>
        </p>
      )}
      <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
        El enlace es válido durante 7 días. Si no esperabas esta invitación, puedes ignorar este email.
      </p>
    </div>
  );
}

export const indMatchInviteSubject = 'Te invitan a un partido de pádel';
```

- [ ] **Step 2: Update each publisher to set `addToCalendarUrl`**

Open `src/app/(app)/jugar/[id]/actions.ts`. There are three places that publish a `send-email` job with template `ind-match-invite`:

1. Inside `inviteByEmail` (around line 80).
2. Inside helper `sendUserInviteEmail` (called from `inviteEntityToMatchAction`).
3. Inside helper `sendTeamInviteNotifications` (called from `inviteEntityToMatchAction`).

In each, where the `data` object passed to `q.publish('send-email', { ... })` is built, add:

```ts
addToCalendarUrl: match?.scheduledAt
  ? `${env().APP_URL}/api/calendar/independent-match/${parsed.data.matchId}/event.ics`
  : undefined,
```

(For the helpers, replace `parsed.data.matchId` with the corresponding parameter — read each helper to see the variable name; usually it's `matchId`.)

The job worker handles the data passthrough automatically — no worker change needed because the React Email template just consumes the new optional prop.

- [ ] **Step 3: Run typecheck and tests**

```bash
pnpm typecheck
pnpm test:unit
```
Expected: GREEN.

- [ ] **Step 4: Commit**

```bash
git add src/worker/email-templates/ind-match-invite.tsx \
        "src/app/(app)/jugar/[id]/actions.ts"
git commit -m "feat(email): add 'Añadir al calendario' CTA to ind-match-invite"
```

---

## Task 7 — Integration test for the endpoints

**Files:**
- Create: `tests/integration/calendar-ics-endpoint.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { buildIndependentMatchEvent, buildLeagueMatchEvent } from '@/shared/calendar/match-event-builder';
import { buildIcsString } from '@/shared/calendar/ics-builder';

const prisma = testPrisma();

async function user(name: string, suffix: string) {
  return prisma.user.create({
    data: { name, email: `${suffix}@t.com`, passwordHash: 'h', emailVerifiedAt: new Date() },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('calendar match-event-builder + ics-builder — integration', () => {
  it('produces a valid .ics for a public independent match', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    const m = await prisma.independentMatch.create({
      data: {
        organizerId: org.id,
        name: 'Sábado por la tarde',
        visibility: 'PUBLIC',
        maxPlayers: 4,
        scheduledAt: new Date('2026-05-03T17:00:00Z'),
        location: 'Club de Pádel',
      },
    });

    const built = await buildIndependentMatchEvent(m.id, org.id);
    expect(built.kind).toBe('ok');
    if (built.kind !== 'ok') return;

    const ics = buildIcsString(built.event);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain(`UID:match-${m.id}@padelleague.app`);
    expect(ics).toContain('SUMMARY:Sábado por la tarde');
    expect(ics).toContain('LOCATION:Club de Pádel');
    expect(ics).toContain('DTSTART:20260503T170000Z');
    expect(ics).toContain('DTEND:20260503T183000Z');
  });

  it('forbids non-members from a private independent match', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    const stranger = await user('Stranger', `str-${Date.now()}`);
    const m = await prisma.independentMatch.create({
      data: {
        organizerId: org.id,
        name: 'Privado',
        visibility: 'PRIVATE',
        maxPlayers: 4,
        scheduledAt: new Date('2026-05-03T17:00:00Z'),
      },
    });

    const built = await buildIndependentMatchEvent(m.id, stranger.id);
    expect(built.kind).toBe('forbidden');
  });

  it('returns no-date when match has no scheduledAt', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    const m = await prisma.independentMatch.create({
      data: {
        organizerId: org.id,
        name: 'Sin fecha',
        visibility: 'PUBLIC',
        maxPlayers: 4,
      },
    });

    const built = await buildIndependentMatchEvent(m.id, org.id);
    expect(built.kind).toBe('no-date');
  });
});
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: GREEN. (Tests do not run locally without docker — they execute in CI.)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/calendar-ics-endpoint.test.ts
git commit -m "test(calendar): integration tests for .ics endpoint helpers"
```

---

## Task 8 — Final validation + push

- [ ] **Step 1: Full local validation**

```bash
pnpm typecheck && pnpm test:unit && pnpm next build
```
Expected: all GREEN.

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Manual smoke after deploy**

1. Open a scheduled independent match in `/jugar/[id]`. Confirm the "📅 Añadir al calendario" button appears next to the date.
2. Click. The browser downloads a `.ics`. Open it in Outlook (or any calendar app). Confirm the event appears with the right title, time, location, 60-minute reminder.
3. Edit the match (cancel + re-create with different date) and re-download. Confirm Outlook updates the same event (UID + bumped SEQUENCE) instead of duplicating.
4. Try the link without being logged in — get redirected to login.
5. Open a scheduled league match in `/ligas/[slug]/partidos/[matchId]`. Repeat 1-2.
6. Receive an email invitation: confirm the second CTA "Añadir al calendario" appears and downloads correctly.

---

## Risks and follow-ups

- **Time-zone display**: events in UTC will show in the user's local zone in their calendar. If the user is in a non-Madrid zone the time displayed might surprise them. Acceptable for now.
- **Long descriptions**: if a private match has many participants, the description grows. RFC 5545 line folding handles it but Outlook is sometimes flaky with extremely long values. Truncate participant lists at 8 names if a complaint surfaces.
- **CRLF correctness**: a few editors / linters auto-trim `\r`. The integration tests use `.toContain('BEGIN:VCALENDAR')` rather than asserting CRLF directly — the unit tests cover that.
- **League match `location` field**: the league `Match` model in the current schema has no `location` column (verified at design time). If a future PR adds one, just expose it in `buildLeagueMatchEvent`.
- **Email rendering**: React Email is generally tolerant. The new CTA is a plain `<a>` with inline styles to maximise client compatibility.
