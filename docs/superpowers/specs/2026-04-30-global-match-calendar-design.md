# Global match calendar — design

**Status:** approved (brainstorming closed 2026-04-30)
**Author:** PadelLeague
**Scope:** Personal calendar of the logged-in user. Renders a month grid (default) and an optional list view of matches the user is involved in or related to via their leagues.

## Goal

Show, in a single place inside `/dashboard`, every padel match that matters to the user, organised by day. Three categories with distinct visual weight:

| Category | What it includes | Visual weight |
|---|---|---|
| `OWN_LEAGUE` | League matches where one of the two teams has the user as a member | Most prominent (filled brand-navy pill) |
| `OTHER_LEAGUE_MINE` | League matches in leagues the user is registered in (via any team), where neither team has the user as a member | Discreet (outlined slate pill) |
| `INDEPENDENT` | Independent matches (`/jugar`) where the user is organizer, accepted participant, or has a pending non-expired invitation (direct or via a team they belong to) | Differentiated (filled brand-yellow pill) |

Matches with `MatchStatus = 'DATE_PROPOSED'` are tentative — same colour as their category but rendered with `opacity-60` and dashed border.

## Non-goals

- Filters by specific team, league, or status. The three categories already group the data meaningfully.
- Search inside the calendar.
- Week or day views. Only month grid + chronological list.
- Drag-to-reschedule or any interaction that modifies the match.
- Expand-on-click for "+N more" overflow days. First version shows just the count.
- Whole-month `.ics` export. The per-match calendar feature already exists; users add matches individually.
- Daily reminder push.
- Public shareable calendar URL.

## Approved decisions

| # | Question | Answer |
|---|---|---|
| 1 | Audience | Personal — the logged-in user only. |
| 2 | Categorization | Three categories with distinct visual weight (above). |
| 3a | Time range | Unlimited — any past or future month, navigated via prev/next buttons. |
| 3b | Match scope | Confirmed dates + tentative (`DATE_PROPOSED`) league matches. Cancelled matches excluded. |
| 3c | League scope | Active + in registration + finalized leagues the user has been registered in. No filter on `League.status`. |
| 4 | Location | Section inside `/dashboard`, at the bottom. |
| 5 | View | List by default, optional toggle to month grid. Preference persisted in `localStorage`. |
| 6 | Visual styling | Pill-based with category-specific colour; dashed + faded for tentative. |

## Architecture

The calendar is server-rendered. Month and view come from URL search params (`?cal=YYYY-MM&view=grid|list`). Prev/next navigation is `<Link>` clicks that update `cal`. The view toggle is a small client component that updates `view` and persists the choice to `localStorage`; on next mount it can pre-set the URL param if it diverges.

### File structure

**Created:**

- `src/modules/calendar/domain/types.ts` — `CalendarMatch`, `CalendarCategory`, `CalendarItemStatus`.
- `src/modules/calendar/application/calendar-service.ts` — `listMatchesForUserMonth(userId, year, month)`.
- `src/modules/calendar/index.ts` — re-exports.
- `src/app/(app)/dashboard/_components/calendar-section.tsx` — server component, takes `userId, year, month, view` and renders the appropriate sub-component.
- `src/app/(app)/dashboard/_components/calendar-grid.tsx` — server component, month grid layout.
- `src/app/(app)/dashboard/_components/calendar-list.tsx` — server component, list-by-day layout.
- `src/app/(app)/dashboard/_components/calendar-nav.tsx` — client component (prev/next + view toggle).
- `tests/unit/modules/calendar/calendar-service.test.ts`
- `tests/integration/calendar-service.test.ts`

**Modified:**

- `src/app/(app)/dashboard/page.tsx` — read `searchParams.cal` and `searchParams.view`, render `<CalendarSection>` at the end.

### Domain types

```ts
import type { IndependentMatchStatus, MatchStatus } from '@prisma/client';

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

### Service

`CalendarService.listMatchesForUserMonth(userId: string, year: number, month: number): Promise<CalendarMatch[]>`.

1. Compute `start` and `end` of the month in Madrid time, converted to UTC `Date` objects. Helper `monthRangeUtc(year, month)` returns `{ start, end }`.

2. Three Prisma queries (run with `Promise.all`):

   **A — `OWN_LEAGUE`**: matches where `teamA.members` or `teamB.members` includes `userId`, `scheduledAt` in range, status not `CANCELLED`. Map each to `{ category: 'OWN_LEAGUE', status: m.status === 'DATE_PROPOSED' ? 'TENTATIVE' : 'CONFIRMED', title: '<TeamA> vs <TeamB>', href: '/ligas/<league.slug>/partidos/<match.id>', scheduledAt }`.

   **B — `OTHER_LEAGUE_MINE`**: matches where the league has any registration whose team has `userId` as a member, `scheduledAt` in range, status not `CANCELLED`, AND neither `teamA` nor `teamB` has the user (NOT clause). Map similarly.

   **C — `INDEPENDENT`**: independent matches where `scheduledAt` in range, status not `CANCELLED`, and one of: organizerId is the user; participants includes user with `status = 'ACCEPTED'`; pending non-expired invitation (`invitedUserId = userId` OR `invitedTeamId` in user's team list). Map to `{ category: 'INDEPENDENT', status: 'CONFIRMED', title: match.name, href: '/jugar/<match.id>' }`.

3. Concatenate and sort by `scheduledAt` ascending. Return.

Edge case — multi-team within one league: a user in two teams of the same league sees a match between those two teams once in `OWN_LEAGUE`. The Prisma OR with `members.some({userId})` against a single match row yields one row regardless of how many of their teams match; the NOT clause for category B keeps that row out of B.

### URL params

- `cal=YYYY-MM` — selected month. Missing or malformed → current month in Madrid.
- `view=grid|list` — selected view. Missing → `list`.

`<CalendarNav>` (client) reads the current `cal` and `view` from props and renders:
- `<Link href="?cal=2026-03&view=...">←</Link>` and `<Link href="?cal=2026-05&view=...">→</Link>`.
- "Hoy" → `<Link href="?view=...">` (no `cal=`).
- Toggle: two buttons `[grid] [list]` that submit URL change. On mount, if `localStorage.getItem('calendarView')` is set and differs from the URL `view`, the component does a soft client-side navigation to align (without scroll jump).

### UI specifics

#### Grid

7-column CSS grid (`grid-cols-7`). 6 rows max (any month fits in ≤6 weeks). Days of previous/next month grayed (`text-slate-300`). Min-height per cell: `h-20` desktop, `h-16` mobile. Each cell:

- Day number top-left.
- Stack of pastillas:
  - `OWN_LEAGUE`: `bg-brand-navy text-white text-[10px] px-1.5 py-0.5 rounded`.
  - `OTHER_LEAGUE_MINE`: `bg-slate-50 text-slate-500 border border-slate-200 text-[10px] px-1.5 py-0.5 rounded`.
  - `INDEPENDENT`: `bg-brand-yellow text-brand-navy font-semibold text-[10px] px-1.5 py-0.5 rounded`.
  - Tentative: append `opacity-60 border border-dashed`.
- Pastilla title truncated; click opens the match page (`<Link href={...}>`).
- If more than `MAX_PASTILLAS_PER_DAY = 3` (desktop) or `2` (mobile via responsive class), show `+N` text at the bottom.
- Today: `ring-2 ring-brand-blue`.

#### List

Group `CalendarMatch[]` by day. Each day renders:

```tsx
<div>
  <h3 className="text-sm font-semibold text-slate-700 mb-2">Sábado, 12 de abril</h3>
  <ul className="space-y-1">
    {/* one row per match, sorted by scheduledAt */}
  </ul>
</div>
```

Row: `<Link>` with hour pre-formatted (`Intl.DateTimeFormat es-ES, hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid'`), category dot (`🔵🟡⚪`) or coloured icon, title, secondary text (liga name or "independiente"). Tentative rows use `text-slate-400 italic`.

If month is empty: `<p className="text-slate-400 text-sm">No hay partidos programados en este mes.</p>`.

#### Header (always shown)

```
Calendario              [← Abril 2026 →]   [grid] [lista]   🔵 mías  ⚪ liga  🟡 indep
```

The legend is a small inline group below the toggle on mobile.

## Privacy

The endpoint scope is the logged-in user. The service queries return only data the user has access to:
- Own league matches: visible already on league pages.
- Other league matches in user's leagues: also visible on the league page (rankings).
- Independent matches: only those the user organizes / participates / has been invited to. No leakage.

No new endpoints are introduced — the calendar fetches via the dashboard server component. No tokens, no public access.

## Testing

### Unit (`tests/unit/modules/calendar/calendar-service.test.ts`)

- Match where `teamA.members` contains user → `OWN_LEAGUE`.
- Match in user's league, neither team has the user → `OTHER_LEAGUE_MINE`.
- Match in a league the user is NOT registered in → excluded.
- League match with `status = 'DATE_PROPOSED'` → `CalendarItemStatus = 'TENTATIVE'`.
- Match with `status = 'CANCELLED'` → excluded.
- Independent match with `organizerId == userId` → `INDEPENDENT`.
- Independent match where user has a pending non-expired invitation → `INDEPENDENT`.
- Independent match where user's invitation expired → excluded.
- User in team A and team C of same league, match between A and C → exactly one item in `OWN_LEAGUE`.

### Integration (`tests/integration/calendar-service.test.ts`)

- Setup ACTIVE, INSCRIPTION, and FINALIZED leagues. Verify the service includes matches from all three statuses (no filter on `League.status`).
- Verify month range strictly: a match scheduled for the last day of March does not appear when querying April; a match on April 1 does.
- Concurrent: a user in 5 teams across 5 leagues, multiple matches per league. Result has each match exactly once.

## Risks and follow-ups

- **Performance**: a user in many leagues with long history might generate large queries. The month-range filter caps each query to roughly the events in one month, typically small. If a heavy user appears, add a limit (e.g. 200 events per month) and surface a warning.
- **Multi-team in same league** edge case is covered by tests but worth eye-balling at QA.
- **Time zone**: month ranges are computed in `Europe/Madrid`. A user in another timezone may see slight day-shifting at the boundaries. Acceptable for a private league app whose users are all in Spain.
- **Mobile density**: 7-column grid is tight. Pastillas are size `text-[10px]`; if the title is long, it truncates aggressively. List view is the recommended fallback for mobile users with many matches.
- **localStorage availability**: server component cannot read `localStorage`. The client `<CalendarNav>` reads it on mount and may issue a soft navigation if the persisted view differs from the URL. Tiny FOUC acceptable.
