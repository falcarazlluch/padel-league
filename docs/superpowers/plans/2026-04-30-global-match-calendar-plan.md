# Global Match Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-30-global-match-calendar-design.md`

**Goal:** Render a personal month calendar (grid + list views) inside `/dashboard` showing every padel match the user is involved in or related to via their leagues, distinguishing three categories with distinct visual weight.

**Architecture:** Server-rendered. Month and view come from URL search params (`?cal=YYYY-MM&view=grid|list`). One service `CalendarService.listMatchesForUserMonth` runs three Prisma queries (own-league matches, other matches in user's leagues, independent matches) and returns a flat array of `CalendarMatch` items. Two server-rendered subcomponents (grid and list) consume the same data. A small client component owns the prev/next + view toggle and persists the toggle in `localStorage`.

**Tech Stack:** Next.js 15 App Router, React 18, Prisma 5, Tailwind, Vitest (unit + integration with testcontainers). No new dependencies.

---

## File Structure

**Created:**

- `src/modules/calendar/domain/types.ts` — `CalendarCategory`, `CalendarItemStatus`, `CalendarMatch`.
- `src/modules/calendar/application/calendar-service.ts` — `listMatchesForUserMonth(userId, year, month)` and the helper `monthRangeUtc(year, month)`.
- `src/modules/calendar/index.ts` — re-exports.
- `src/app/(app)/dashboard/_components/calendar-section.tsx` — server component glueing nav + grid/list.
- `src/app/(app)/dashboard/_components/calendar-grid.tsx` — server component for the month grid.
- `src/app/(app)/dashboard/_components/calendar-list.tsx` — server component for the chronological list.
- `src/app/(app)/dashboard/_components/calendar-nav.tsx` — client component (prev/next links + view toggle + localStorage sync).
- `tests/unit/modules/calendar/calendar-service.test.ts`
- `tests/integration/calendar-service.test.ts`

**Modified:**

- `src/app/(app)/dashboard/page.tsx` — accept `searchParams: Promise<{ cal?: string; view?: string }>`, render `<CalendarSection>` at the end.

---

## Task 1 — Domain types + `CalendarService` + unit tests

**Files:**
- Create: `src/modules/calendar/domain/types.ts`
- Create: `src/modules/calendar/application/calendar-service.ts`
- Create: `src/modules/calendar/index.ts`
- Create: `tests/unit/modules/calendar/calendar-service.test.ts`

- [ ] **Step 1: Create the types file**

`src/modules/calendar/domain/types.ts`:

```ts
export type CalendarCategory = 'OWN_LEAGUE' | 'OTHER_LEAGUE_MINE' | 'INDEPENDENT';

export type CalendarItemStatus = 'CONFIRMED' | 'TENTATIVE';

export type CalendarMatch = {
  id: string;
  category: CalendarCategory;
  status: CalendarItemStatus;
  scheduledAt: Date;
  title: string;
  href: string;
};
```

- [ ] **Step 2: Write failing unit tests**

`tests/unit/modules/calendar/calendar-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalendarService, monthRangeUtc } from '@/modules/calendar';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    match: { findMany: vi.fn() },
    independentMatch: { findMany: vi.fn() },
    teamMember: { findMany: vi.fn() },
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    match: { findMany: ReturnType<typeof vi.fn> };
    independentMatch: { findMany: ReturnType<typeof vi.fn> };
    teamMember: { findMany: ReturnType<typeof vi.fn> };
  };
}

describe('monthRangeUtc', () => {
  it('returns first millisecond of the month and first millisecond of next month', () => {
    const { start, end } = monthRangeUtc(2026, 4);
    expect(start.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('handles December rollover', () => {
    const { start, end } = monthRangeUtc(2026, 12);
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('CalendarService.listMatchesForUserMonth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies a match where the user belongs to teamA as OWN_LEAGUE', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findMany.mockResolvedValue([{ teamId: 't1' }]);
    prisma.match.findMany.mockResolvedValueOnce([
      {
        id: 'lm1',
        scheduledAt: new Date('2026-04-12T17:00:00Z'),
        status: 'DATE_CONFIRMED',
        teamA: { id: 't1', name: 'Halcones' },
        teamB: { id: 't2', name: 'Tigres' },
        league: { slug: 'liga-otono' },
      },
    ]).mockResolvedValueOnce([]); // category B query empty
    prisma.independentMatch.findMany.mockResolvedValue([]);

    const result = await CalendarService.listMatchesForUserMonth('u1', 2026, 4);
    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('OWN_LEAGUE');
    expect(result[0]!.status).toBe('CONFIRMED');
    expect(result[0]!.title).toBe('Halcones vs Tigres');
    expect(result[0]!.href).toBe('/ligas/liga-otono/partidos/lm1');
  });

  it('marks DATE_PROPOSED matches as TENTATIVE', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findMany.mockResolvedValue([]);
    prisma.match.findMany.mockResolvedValueOnce([
      {
        id: 'lm2',
        scheduledAt: new Date('2026-04-15T18:00:00Z'),
        status: 'DATE_PROPOSED',
        teamA: { id: 't1', name: 'A' },
        teamB: { id: 't2', name: 'B' },
        league: { slug: 's' },
      },
    ]).mockResolvedValueOnce([]);
    prisma.independentMatch.findMany.mockResolvedValue([]);

    const result = await CalendarService.listMatchesForUserMonth('u1', 2026, 4);
    expect(result[0]!.status).toBe('TENTATIVE');
  });

  it('classifies league matches in user’s leagues where they don’t play as OTHER_LEAGUE_MINE', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findMany.mockResolvedValue([]);
    prisma.match.findMany
      .mockResolvedValueOnce([]) // category A: user doesn't play
      .mockResolvedValueOnce([
        {
          id: 'lm3',
          scheduledAt: new Date('2026-04-20T17:00:00Z'),
          status: 'DATE_CONFIRMED',
          teamA: { id: 't3', name: 'X' },
          teamB: { id: 't4', name: 'Y' },
          league: { slug: 's' },
        },
      ]);
    prisma.independentMatch.findMany.mockResolvedValue([]);

    const result = await CalendarService.listMatchesForUserMonth('u1', 2026, 4);
    expect(result[0]!.category).toBe('OTHER_LEAGUE_MINE');
  });

  it('classifies independent matches as INDEPENDENT', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findMany.mockResolvedValue([]);
    prisma.match.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.independentMatch.findMany.mockResolvedValue([
      {
        id: 'im1',
        name: 'Sábado por la tarde',
        scheduledAt: new Date('2026-04-18T17:00:00Z'),
        status: 'OPEN',
      },
    ]);

    const result = await CalendarService.listMatchesForUserMonth('u1', 2026, 4);
    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('INDEPENDENT');
    expect(result[0]!.title).toBe('Sábado por la tarde');
    expect(result[0]!.href).toBe('/jugar/im1');
  });

  it('sorts merged results by scheduledAt ascending', async () => {
    const prisma = await getPrisma();
    prisma.teamMember.findMany.mockResolvedValue([]);
    prisma.match.findMany
      .mockResolvedValueOnce([
        {
          id: 'lm-late',
          scheduledAt: new Date('2026-04-25T17:00:00Z'),
          status: 'DATE_CONFIRMED',
          teamA: { id: 't1', name: 'A' },
          teamB: { id: 't2', name: 'B' },
          league: { slug: 's' },
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.independentMatch.findMany.mockResolvedValue([
      {
        id: 'im-early',
        name: 'X',
        scheduledAt: new Date('2026-04-05T17:00:00Z'),
        status: 'OPEN',
      },
    ]);

    const result = await CalendarService.listMatchesForUserMonth('u1', 2026, 4);
    expect(result.map((m) => m.id)).toEqual(['im-early', 'lm-late']);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm test:unit -- tests/unit/modules/calendar/calendar-service.test.ts
```
Expected: import error (the service does not exist yet).

- [ ] **Step 4: Implement the service**

`src/modules/calendar/application/calendar-service.ts`:

```ts
import { prisma } from '@/shared/db/client';
import type { CalendarMatch, CalendarItemStatus } from '../domain/types';

export function monthRangeUtc(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 1, 0, 0, 0)),
  };
}

function leagueMatchStatusToCalendar(status: string): CalendarItemStatus {
  return status === 'DATE_PROPOSED' ? 'TENTATIVE' : 'CONFIRMED';
}

export const CalendarService = {
  async listMatchesForUserMonth(userId: string, year: number, month: number): Promise<CalendarMatch[]> {
    const { start, end } = monthRangeUtc(year, month);

    const teamMembers = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const userTeamIds = teamMembers.map((m) => m.teamId);

    const [ownLeague, otherLeague, independent] = await Promise.all([
      // A — own-team league matches
      prisma.match.findMany({
        where: {
          scheduledAt: { gte: start, lt: end },
          status: { not: 'CANCELLED' },
          OR: [
            { teamA: { members: { some: { userId } } } },
            { teamB: { members: { some: { userId } } } },
          ],
        },
        include: {
          teamA: { select: { id: true, name: true } },
          teamB: { select: { id: true, name: true } },
          league: { select: { slug: true } },
        },
      }),
      // B — other matches in user's leagues
      prisma.match.findMany({
        where: {
          scheduledAt: { gte: start, lt: end },
          status: { not: 'CANCELLED' },
          league: {
            registrations: {
              some: { withdrawnAt: null, team: { members: { some: { userId } } } },
            },
          },
          NOT: {
            OR: [
              { teamA: { members: { some: { userId } } } },
              { teamB: { members: { some: { userId } } } },
            ],
          },
        },
        include: {
          teamA: { select: { id: true, name: true } },
          teamB: { select: { id: true, name: true } },
          league: { select: { slug: true } },
        },
      }),
      // C — independent matches
      prisma.independentMatch.findMany({
        where: {
          scheduledAt: { gte: start, lt: end },
          status: { not: 'CANCELLED' },
          OR: [
            { organizerId: userId },
            { participants: { some: { userId, status: 'ACCEPTED' } } },
            {
              invitations: {
                some: {
                  invitedUserId: userId,
                  acceptedAt: null,
                  expiresAt: { gt: new Date() },
                },
              },
            },
            ...(userTeamIds.length > 0
              ? [
                  {
                    invitations: {
                      some: {
                        invitedTeamId: { in: userTeamIds },
                        acceptedAt: null,
                        expiresAt: { gt: new Date() },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
      }),
    ]);

    const items: CalendarMatch[] = [];

    for (const m of ownLeague) {
      items.push({
        id: m.id,
        category: 'OWN_LEAGUE',
        status: leagueMatchStatusToCalendar(m.status),
        scheduledAt: m.scheduledAt!,
        title: `${m.teamA.name} vs ${m.teamB.name}`,
        href: `/ligas/${m.league.slug}/partidos/${m.id}`,
      });
    }
    for (const m of otherLeague) {
      items.push({
        id: m.id,
        category: 'OTHER_LEAGUE_MINE',
        status: leagueMatchStatusToCalendar(m.status),
        scheduledAt: m.scheduledAt!,
        title: `${m.teamA.name} vs ${m.teamB.name}`,
        href: `/ligas/${m.league.slug}/partidos/${m.id}`,
      });
    }
    for (const m of independent) {
      items.push({
        id: m.id,
        category: 'INDEPENDENT',
        status: 'CONFIRMED',
        scheduledAt: m.scheduledAt!,
        title: m.name,
        href: `/jugar/${m.id}`,
      });
    }

    items.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    return items;
  },
} as const;
```

- [ ] **Step 5: Create the module index**

`src/modules/calendar/index.ts`:

```ts
export { CalendarService, monthRangeUtc } from './application/calendar-service';
export type { CalendarMatch, CalendarCategory, CalendarItemStatus } from './domain/types';
```

- [ ] **Step 6: Run tests, expect all green**

```bash
pnpm test:unit -- tests/unit/modules/calendar/calendar-service.test.ts
```
Expected: 7 tests pass.

- [ ] **Step 7: Run typecheck**

```bash
pnpm typecheck
```
Expected: GREEN.

- [ ] **Step 8: Commit**

```bash
git add src/modules/calendar tests/unit/modules/calendar
git commit -m "feat(calendar): CalendarService + types"
```

---

## Task 2 — `CalendarGrid` server component

**Files:**
- Create: `src/app/(app)/dashboard/_components/calendar-grid.tsx`

- [ ] **Step 1: Write the component**

`src/app/(app)/dashboard/_components/calendar-grid.tsx`:

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import type { CalendarMatch } from '@/modules/calendar';

interface Props {
  year: number;        // 4-digit
  month: number;       // 1-12
  matches: CalendarMatch[];
  todayIso: string;    // YYYY-MM-DD in Madrid
}

const PILL_BY_CATEGORY: Record<CalendarMatch['category'], string> = {
  OWN_LEAGUE: 'bg-brand-navy text-white',
  OTHER_LEAGUE_MINE: 'bg-slate-50 text-slate-500 border border-slate-200',
  INDEPENDENT: 'bg-brand-yellow text-brand-navy font-semibold',
};

const WEEKDAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function dayKey(d: Date): string {
  // YYYY-MM-DD in UTC; the service stores `scheduledAt` in UTC; calendar
  // uses Madrid for "today" but UTC for grouping is acceptable per spec.
  return d.toISOString().slice(0, 10);
}

function buildGridDays(year: number, month: number): Date[] {
  // First Monday on/before day 1 of month, six-week grid.
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  // JS day-of-week: 0 = Sun, 1 = Mon … 6 = Sat. Monday-first offset.
  const offset = (firstOfMonth.getUTCDay() + 6) % 7;
  const start = new Date(firstOfMonth);
  start.setUTCDate(start.getUTCDate() - offset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push(d);
  }
  return days;
}

export function CalendarGrid({ year, month, matches, todayIso }: Props) {
  const days = buildGridDays(year, month);

  // Group matches by YYYY-MM-DD.
  const byDay = new Map<string, CalendarMatch[]>();
  for (const m of matches) {
    const k = dayKey(m.scheduledAt);
    const arr = byDay.get(k);
    if (arr) arr.push(m);
    else byDay.set(k, [m]);
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/60">
        {WEEKDAYS_ES.map((label) => (
          <div key={label} className="text-[11px] font-bold uppercase tracking-widest text-slate-500 px-2 py-1.5 text-center">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const inMonth = d.getUTCMonth() === month - 1;
          const k = dayKey(d);
          const todays = byDay.get(k) ?? [];
          const isToday = k === todayIso;
          return (
            <div
              key={i}
              className={`border-b border-r border-slate-100 last-of-row:border-r-0 min-h-[5rem] sm:min-h-[6rem] p-1 text-xs flex flex-col gap-0.5 ${
                inMonth ? '' : 'bg-slate-50/30'
              } ${isToday ? 'ring-2 ring-brand-blue ring-inset' : ''}`}
            >
              <span className={`text-[11px] font-bold ${inMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                {d.getUTCDate()}
              </span>
              <ul className="flex flex-col gap-0.5">
                {todays.slice(0, 3).map((m) => (
                  <li key={m.id}>
                    <Link
                      href={m.href as Route}
                      className={`block truncate rounded px-1.5 py-0.5 text-[10px] ${PILL_BY_CATEGORY[m.category]} ${
                        m.status === 'TENTATIVE' ? 'opacity-60 border border-dashed' : ''
                      } hover:opacity-90 transition-opacity`}
                    >
                      {m.title}
                    </Link>
                  </li>
                ))}
                {todays.length > 3 && (
                  <li className="text-[10px] text-slate-400 px-1.5">+{todays.length - 3}</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: GREEN.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dashboard/_components/calendar-grid.tsx"
git commit -m "feat(calendar): CalendarGrid server component"
```

---

## Task 3 — `CalendarList` server component

**Files:**
- Create: `src/app/(app)/dashboard/_components/calendar-list.tsx`

- [ ] **Step 1: Write the component**

`src/app/(app)/dashboard/_components/calendar-list.tsx`:

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import type { CalendarMatch } from '@/modules/calendar';

interface Props {
  matches: CalendarMatch[];
}

const DOT_BY_CATEGORY: Record<CalendarMatch['category'], string> = {
  OWN_LEAGUE: 'bg-brand-navy',
  OTHER_LEAGUE_MINE: 'bg-slate-300',
  INDEPENDENT: 'bg-brand-yellow',
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDayHeading(iso: string): string {
  const [y, m, dd] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1, dd!));
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Madrid',
  }).format(d);
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(d);
}

export function CalendarList({ matches }: Props) {
  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-6">
        <p className="text-slate-400 text-sm">No hay partidos programados en este mes.</p>
      </div>
    );
  }

  // Group by day-of-month iso key, preserving sorted order from input.
  const groups = new Map<string, CalendarMatch[]>();
  for (const m of matches) {
    const k = dayKey(m.scheduledAt);
    const arr = groups.get(k);
    if (arr) arr.push(m);
    else groups.set(k, [m]);
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([iso, dayMatches]) => (
        <div key={iso} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 capitalize">{formatDayHeading(iso)}</h3>
          <ul className="space-y-2">
            {dayMatches.map((m) => (
              <li key={m.id}>
                <Link
                  href={m.href as Route}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 transition-colors ${
                    m.status === 'TENTATIVE' ? 'text-slate-400 italic' : 'text-slate-700'
                  }`}
                >
                  <span className="text-sm tabular-nums w-12 shrink-0">{formatTime(m.scheduledAt)}</span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_BY_CATEGORY[m.category]} ${
                    m.status === 'TENTATIVE' ? 'opacity-60' : ''
                  }`} aria-hidden />
                  <span className="text-sm flex-1 truncate">{m.title}</span>
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider shrink-0">
                    {m.category === 'INDEPENDENT' ? 'Indep.' : m.category === 'OWN_LEAGUE' ? 'Liga' : 'Liga (otros)'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: GREEN.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dashboard/_components/calendar-list.tsx"
git commit -m "feat(calendar): CalendarList server component"
```

---

## Task 4 — `CalendarNav` client component (prev/next + view toggle)

**Files:**
- Create: `src/app/(app)/dashboard/_components/calendar-nav.tsx`

- [ ] **Step 1: Write the component**

`src/app/(app)/dashboard/_components/calendar-nav.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';

interface Props {
  year: number;
  month: number;
  view: 'grid' | 'list';
}

const MONTH_LABELS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function monthShift(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function buildHref(pathname: string, year: number, month: number, view: 'grid' | 'list'): Route {
  const cal = `${year}-${String(month).padStart(2, '0')}`;
  const params = new URLSearchParams();
  params.set('cal', cal);
  params.set('view', view);
  return `${pathname}?${params.toString()}` as Route;
}

export function CalendarNav({ year, month, view }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // On mount, align the URL with the persisted view if they differ.
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('calendarView') : null;
    if ((stored === 'grid' || stored === 'list') && stored !== view) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', stored);
      router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false });
    }
  }, [pathname, router, searchParams, view]);

  function persistView(next: 'grid' | 'list') {
    try {
      window.localStorage.setItem('calendarView', next);
    } catch {
      // ignore quota / SSR / privacy-mode failures
    }
  }

  const prev = monthShift(year, month, -1);
  const next = monthShift(year, month, 1);
  const today = new Date();
  const todayHref = `${pathname}?view=${view}` as Route;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Link
          href={buildHref(pathname, prev.year, prev.month, view)}
          className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
          aria-label="Mes anterior"
        >
          ←
        </Link>
        <span className="text-sm font-bold text-slate-700 min-w-[8rem] text-center">
          {MONTH_LABELS_ES[month - 1]} {year}
        </span>
        <Link
          href={buildHref(pathname, next.year, next.month, view)}
          className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
          aria-label="Mes siguiente"
        >
          →
        </Link>
        {(year !== today.getFullYear() || month !== today.getMonth() + 1) && (
          <Link
            href={todayHref}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Hoy
          </Link>
        )}
      </div>
      <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs font-semibold">
        <Link
          href={buildHref(pathname, year, month, 'grid')}
          onClick={() => persistView('grid')}
          className={`px-3 py-1.5 ${view === 'grid' ? 'bg-brand-navy text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} transition-colors`}
        >
          Grid
        </Link>
        <Link
          href={buildHref(pathname, year, month, 'list')}
          onClick={() => persistView('list')}
          className={`px-3 py-1.5 ${view === 'list' ? 'bg-brand-navy text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} transition-colors`}
        >
          Lista
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: GREEN.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dashboard/_components/calendar-nav.tsx"
git commit -m "feat(calendar): CalendarNav client component (prev/next + view toggle)"
```

---

## Task 5 — `CalendarSection` + wire into dashboard

**Files:**
- Create: `src/app/(app)/dashboard/_components/calendar-section.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Create `CalendarSection`**

`src/app/(app)/dashboard/_components/calendar-section.tsx`:

```tsx
import { CalendarService } from '@/modules/calendar';
import { CalendarGrid } from './calendar-grid';
import { CalendarList } from './calendar-list';
import { CalendarNav } from './calendar-nav';

interface Props {
  userId: string;
  year: number;
  month: number;
  view: 'grid' | 'list';
}

const LEGEND = [
  { label: 'Mías', color: 'bg-brand-navy' },
  { label: 'Liga', color: 'bg-slate-300' },
  { label: 'Indep.', color: 'bg-brand-yellow' },
];

function todayMadridIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(new Date());
}

export async function CalendarSection({ userId, year, month, view }: Props) {
  const matches = await CalendarService.listMatchesForUserMonth(userId, year, month);
  const todayIso = todayMadridIso();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-brand-navy">Calendario</h2>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          {LEGEND.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${l.color}`} aria-hidden />
              {l.label}
            </span>
          ))}
        </div>
      </div>
      <CalendarNav year={year} month={month} view={view} />
      {view === 'grid' ? (
        <CalendarGrid year={year} month={month} matches={matches} todayIso={todayIso} />
      ) : (
        <CalendarList matches={matches} />
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire into `/dashboard/page.tsx`**

Open `src/app/(app)/dashboard/page.tsx`. Update the function signature and append the section.

a) Add the import near the top:

```tsx
import { CalendarSection } from './_components/calendar-section';
```

b) Update the function signature:

```tsx
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cal?: string; view?: string }>;
}) {
```

c) Right after the existing `if (!token) redirect('/login');` and `const user = await getValidatedSession(token);`, parse the search params:

```tsx
const sp = await searchParams;
const today = new Date();
let calYear = today.getUTCFullYear();
let calMonth = today.getUTCMonth() + 1;
if (sp.cal && /^\d{4}-\d{2}$/.test(sp.cal)) {
  const [y, m] = sp.cal.split('-').map(Number);
  if (y && m && m >= 1 && m <= 12) {
    calYear = y;
    calMonth = m;
  }
}
const calView: 'grid' | 'list' = sp.view === 'list' ? 'list' : 'grid';
```

d) Render `<CalendarSection>` at the end of the existing JSX (just before the closing `</div>` of the outermost `<div className="space-y-8">`):

```tsx
<CalendarSection userId={user.id} year={calYear} month={calMonth} view={calView} />
```

- [ ] **Step 3: Run typecheck and build**

```bash
pnpm typecheck
pnpm next build
```
Expected: GREEN.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/_components/calendar-section.tsx" \
        "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): wire CalendarSection at the bottom"
```

---

## Task 6 — Integration test for `CalendarService`

**Files:**
- Create: `tests/integration/calendar-service.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { CalendarService } from '@/modules/calendar';

const prisma = testPrisma();

async function user(name: string, suffix: string) {
  return prisma.user.create({
    data: { name, email: `${suffix}@t.com`, passwordHash: 'h', emailVerifiedAt: new Date() },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('CalendarService.listMatchesForUserMonth — integration', () => {
  it('returns own-team league matches as OWN_LEAGUE and others as OTHER_LEAGUE_MINE', async () => {
    const me = await user('Me', `me-${Date.now()}`);
    const partner = await user('Partner', `pa-${Date.now()}`);
    const rivalA1 = await user('R1', `r1-${Date.now()}`);
    const rivalA2 = await user('R2', `r2-${Date.now()}`);
    const rivalB1 = await user('R3', `r3-${Date.now()}`);
    const rivalB2 = await user('R4', `r4-${Date.now()}`);

    const myTeam = await prisma.team.create({
      data: {
        name: 'Mi Equipo',
        category: 'INTERMEDIATE',
        createdByUserId: me.id,
        members: { create: [{ userId: me.id }, { userId: partner.id }] },
      },
    });
    const teamX = await prisma.team.create({
      data: {
        name: 'Equipo X',
        category: 'INTERMEDIATE',
        createdByUserId: rivalA1.id,
        members: { create: [{ userId: rivalA1.id }, { userId: rivalA2.id }] },
      },
    });
    const teamY = await prisma.team.create({
      data: {
        name: 'Equipo Y',
        category: 'INTERMEDIATE',
        createdByUserId: rivalB1.id,
        members: { create: [{ userId: rivalB1.id }, { userId: rivalB2.id }] },
      },
    });

    const league = await prisma.league.create({
      data: {
        name: 'Liga Otoño',
        slug: `liga-otono-${Date.now()}`,
        category: 'INTERMEDIATE',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-05-30'),
        registrationStart: new Date('2026-03-01'),
        registrationEnd: new Date('2026-03-31'),
        status: 'ACTIVE',
        createdByUserId: me.id,
        registrations: {
          create: [
            { teamId: myTeam.id },
            { teamId: teamX.id },
            { teamId: teamY.id },
          ],
        },
      },
    });

    // Match where I play
    const myMatch = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: myTeam.id,
        teamBId: teamX.id,
        scheduledAt: new Date('2026-04-12T17:00:00Z'),
        status: 'DATE_CONFIRMED',
        deadlineAt: new Date('2026-04-19T17:00:00Z'),
      },
    });

    // Match between two other teams (in same league I'm registered in)
    const otherMatch = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamX.id,
        teamBId: teamY.id,
        scheduledAt: new Date('2026-04-20T17:00:00Z'),
        status: 'DATE_PROPOSED',
        deadlineAt: new Date('2026-04-27T17:00:00Z'),
      },
    });

    const result = await CalendarService.listMatchesForUserMonth(me.id, 2026, 4);
    expect(result).toHaveLength(2);

    const own = result.find((r) => r.id === myMatch.id);
    expect(own?.category).toBe('OWN_LEAGUE');
    expect(own?.status).toBe('CONFIRMED');
    expect(own?.title).toBe('Mi Equipo vs Equipo X');

    const other = result.find((r) => r.id === otherMatch.id);
    expect(other?.category).toBe('OTHER_LEAGUE_MINE');
    expect(other?.status).toBe('TENTATIVE');
    expect(other?.title).toBe('Equipo X vs Equipo Y');
  });

  it('includes independent matches I organize', async () => {
    const me = await user('Me', `me-${Date.now()}`);

    const im = await prisma.independentMatch.create({
      data: {
        organizerId: me.id,
        name: 'Sábado por la tarde',
        visibility: 'PUBLIC',
        maxPlayers: 4,
        scheduledAt: new Date('2026-04-10T17:00:00Z'),
      },
    });

    const result = await CalendarService.listMatchesForUserMonth(me.id, 2026, 4);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(im.id);
    expect(result[0]!.category).toBe('INDEPENDENT');
    expect(result[0]!.title).toBe('Sábado por la tarde');
  });

  it('strictly filters by month (no spillover to neighbour months)', async () => {
    const me = await user('Me', `me-${Date.now()}`);

    // March 31 — should NOT appear in April query
    await prisma.independentMatch.create({
      data: {
        organizerId: me.id,
        name: 'March match',
        visibility: 'PUBLIC',
        maxPlayers: 4,
        scheduledAt: new Date('2026-03-31T22:00:00Z'),
      },
    });
    // April 1 — should appear
    await prisma.independentMatch.create({
      data: {
        organizerId: me.id,
        name: 'April match',
        visibility: 'PUBLIC',
        maxPlayers: 4,
        scheduledAt: new Date('2026-04-01T05:00:00Z'),
      },
    });
    // May 1 — should NOT appear
    await prisma.independentMatch.create({
      data: {
        organizerId: me.id,
        name: 'May match',
        visibility: 'PUBLIC',
        maxPlayers: 4,
        scheduledAt: new Date('2026-05-01T05:00:00Z'),
      },
    });

    const result = await CalendarService.listMatchesForUserMonth(me.id, 2026, 4);
    expect(result.map((r) => r.title)).toEqual(['April match']);
  });
});
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: GREEN. (Tests do not run locally without docker — they execute in CI / Vercel.)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/calendar-service.test.ts
git commit -m "test(calendar): integration test for CalendarService"
```

---

## Task 7 — Final validation + push

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

1. Open `/dashboard`. Scroll to the bottom. The new "Calendario" section appears with the current month grid.
2. Day with one of your league matches shows a navy pill `Equipo A vs Equipo B`. Click → navigates to the league match page.
3. Day with another match in your league (between two other teams) shows a faded outlined pill. Click → match page.
4. Day with one of your independent matches shows a yellow pill. Click → independent match page.
5. Press `←` and `→` to navigate prev/next month. URL updates to `?cal=2026-03&view=grid`.
6. Click `Lista`. Layout switches to chronological list. URL updates to `?view=list`. Reload — view stays as list (localStorage persists). Try toggle back to grid; persists.
7. A match with `status = DATE_PROPOSED` appears with dashed border and 60% opacity in grid; in list it's italic + slate-400.
8. Today's day cell is highlighted with a brand-blue ring.
9. A month with no matches shows the "No hay partidos programados en este mes." message in list view, or an empty grid in grid view.
10. Past months: navigate `←` several times — historical matches show.

---

## Risks and follow-ups

- **Time zone**: month boundaries use UTC; a Madrid user might see a match scheduled at 23:00 Madrid on March 31 as part of April (the UTC date is April 1). Acceptable per spec — typical league matches are during day hours.
- **Multi-team in same league**: covered by the OR + NOT clauses; integration test gives medium confidence. Verify by eye if this case appears in production.
- **Performance for heavy users**: a user with many leagues and finalized history may pull large result sets. The month range cap keeps it bounded; if a real user complains, add a `take: 200` ceiling.
- **localStorage hydration flicker**: the client `<CalendarNav>` does a soft `router.replace` on mount if the persisted view differs from the URL. Brief FOUC of grid → list possible. Acceptable; can be hardened with a `<noscript>`-style fallback later.
- **Empty state**: list view explicitly shows "No hay partidos…"; grid view simply renders an empty grid. Visually informative enough.
