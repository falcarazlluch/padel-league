# Spec 5: Calendario y Jornadas — Design

## Overview

Add fixture generation with round numbers when a league is activated, a jornadas (rounds) view inside each league page, a global "Mis partidos" view with quick-action cards, and a libre scheduling flow on the match detail page.

---

## 1. Data Model

### `Match.round Int?`

Add a nullable integer field `round` to the `Match` model. Populated by the fixture generator at league activation. `null` for matches created before this spec (backwards compatibility).

```prisma
model Match {
  // ...existing fields...
  round Int?
}
```

Migration: `prisma migrate dev --name add-match-round`

### `MatchSchedulingProposal` (no changes)

Existing model with states `PROPOSED / ACCEPTED / REJECTED / COUNTERED / SUPERSEDED` is used as-is. Libre scheduling logic: when a new proposal is created, any existing `PROPOSED` proposal for the same match is set to `SUPERSEDED` in the same transaction.

### Match statuses used

| Status | Meaning |
|---|---|
| `SCHEDULED` | No agreed date |
| `DATE_PROPOSED` | Active proposal pending acceptance |
| `DATE_CONFIRMED` | Date agreed by both teams |
| `CONFIRMED` | Result confirmed |
| `ADMIN_RESOLVED` | Admin resolved dispute |
| `EXPIRED_UNPLAYED` | League ended, match not played (or bye slot) |

---

## 2. Fixture Generation

### Algorithm

Circle method (round-robin). Given N teams:
- If N is even: N-1 rounds, each team plays once per round
- If N is odd: N rounds, one team gets a bye each round

Steps:
1. Shuffle teams randomly at activation time (using a simple Fisher-Yates shuffle)
2. Fix the last team; rotate the rest N-1 times
3. Each rotation produces one round's pairings
4. Bye slots (odd N) get a `Match` created with `awayTeamId: null`, status `EXPIRED_UNPLAYED` immediately

### Files changed

- `src/modules/leagues/application/fixture-generator.ts` — add `round` to returned pairs, accept shuffled team array
- `src/modules/leagues/application/league-service.ts` — `activateLeague`: shuffle teams, call generator, `createMany` with `round`, guard against duplicate activation (if matches already exist for this league, skip generation)

### Activation guard

```typescript
const existingCount = await tx.match.count({ where: { leagueId } });
if (existingCount > 0) return; // already generated
```

---

## 3. Jornadas View — League Page (`/ligas/[slug]`)

### Navigation

New "Partidos" tab alongside "Clasificación". Active tab driven by `?tab=partidos` search param (default: "Clasificación" for backwards compatibility).

### Jornada selector

Pills `J1 … Jn` from distinct `round` values of the league's matches. Active jornada from `?jornada=N` search param. Default: lowest round with at least one match not yet confirmed (status `SCHEDULED`, `DATE_PROPOSED`, or `DATE_CONFIRMED`). If all played, default to last round.

Pills render as `<Link href="?tab=partidos&jornada=N">` — no client-side state, shareable URLs.

### Match card color coding

| Condition | Background | Border |
|---|---|---|
| `CONFIRMED` or `ADMIN_RESOLVED` — has winner | `bg-green-50` (winner row) / `bg-red-50` (loser row) | green / red |
| `CONFIRMED` — draw (equal sets won) | both rows `bg-orange-50` | orange |
| `SCHEDULED` | `bg-yellow-50` | yellow |
| `DATE_PROPOSED` | `bg-blue-50` | blue |
| `DATE_CONFIRMED` | `bg-blue-50` | blue |
| `EXPIRED_UNPLAYED` or bye | `bg-gray-50` | gray |

Result display: sets from `confirmedResult.sets`, format `6-4 / 7-5`. Winner determined by sets won count. Equal sets won = draw.

"Proponer fecha" button on `SCHEDULED` cards navigates to `/partidos/[matchId]`.

### Component structure

```
/ligas/[slug]/page.tsx         — Server Component, reads ?tab and ?jornada
/ligas/[slug]/_components/
  partidos-tab.tsx             — renders pills + match list for selected jornada
  match-card-jornada.tsx       — single match card with color logic
```

---

## 4. Global "Mis partidos" (`/partidos`)

### Route

`/partidos` — new page, Server Component. Shows all matches where the authenticated user belongs to one of the two teams (via `TeamMember`).

### Grouping and ordering

- Matches with `DATE_CONFIRMED` or `CONFIRMED` or `ADMIN_RESOLVED`: grouped by date, ascending
- Matches `DATE_PROPOSED`: grouped under "Pendiente de confirmar"
- Matches `SCHEDULED`: grouped under "Sin programar", ordered by league deadline ascending
- `EXPIRED_UNPLAYED`: at the bottom, collapsed by default

### Quick-action cards

| Status | Card color | Action |
|---|---|---|
| `SCHEDULED` | Yellow | "Proponer fecha" → link to `/partidos/[matchId]` |
| `DATE_PROPOSED` (rival proposed) | Blue | "Aceptar" (Server Action inline) + "Proponer otra" → link to `/partidos/[matchId]` |
| `DATE_PROPOSED` (I proposed) | Light blue | "Esperando al rival" — no action button |
| `DATE_CONFIRMED` | Blue | Shows date/time |
| `CONFIRMED` / `ADMIN_RESOLVED` | Green | Shows result |
| `EXPIRED_UNPLAYED` | Gray | "Partido no jugado" |

"I proposed" detection: check if the latest `MatchSchedulingProposal` with status `PROPOSED` was created by a member of the user's team.

### Nav link

Add "Mis partidos" to the main navigation bar (`src/app/(app)/layout.tsx`).

### Component structure

```
/partidos/
  page.tsx                     — Server Component, data fetching
  _components/
    match-card-mis-partidos.tsx — quick-action card
    accept-proposal-action.ts  — Server Action for inline accept
```

---

## 5. Scheduling Flow — Match Detail (`/partidos/[matchId]`)

### Existing page

`/partidos/[matchId]` already exists. Add a "Programar partido" section above the result submission section.

### Section states

**No active proposal (`SCHEDULED`):**
```
📅 Programar partido
[datetime-local input]  [Proponer]
```

**Rival proposed (`DATE_PROPOSED`, rival is proposer):**
```
📬 El rival propone: Vie 25 Abr · 19:30h
[Confirmar fecha]  [Proponer otra fecha]
```
"Confirmar fecha" → Server Action, sets match to `DATE_CONFIRMED`, creates notification.
"Proponer otra fecha" → shows the datetime-local form (replaces the section inline via React state).

**I proposed (`DATE_PROPOSED`, I am proposer):**
```
⏳ Propuesta enviada: Vie 25 Abr · 19:30h — esperando al rival
[Cambiar propuesta]
```
"Cambiar propuesta" → shows datetime-local form.

**`DATE_CONFIRMED`:**
```
✅ Partido programado: Vie 25 Abr · 19:30h
```

### Server Actions (`/partidos/[matchId]/actions.ts`)

- `proposeDate(matchId, proposedAt: Date)` — supersedes any active proposal, creates new `MatchSchedulingProposal` with `PROPOSED`, sets match to `DATE_PROPOSED`, sends notification to rival team members
- `acceptProposal(matchId)` — accepts latest `PROPOSED` proposal, sets proposal to `ACCEPTED`, match to `DATE_CONFIRMED`, sends notification to proposing team members
- `cancelProposal(matchId)` — sets latest `PROPOSED` to `SUPERSEDED`, match back to `SCHEDULED` (used only if user wants to withdraw without counter-proposing)

### Libre flow invariant

At most one `MatchSchedulingProposal` with status `PROPOSED` per match at any time. Enforced in `proposeDate` transaction:

```typescript
await tx.matchSchedulingProposal.updateMany({
  where: { matchId, status: 'PROPOSED' },
  data: { status: 'SUPERSEDED' },
});
```

### Notifications

Uses existing `NotificationService`:
- `proposeDate` → notify all members of the rival team: "X ha propuesto una fecha para vuestro partido"
- `acceptProposal` → notify all members of the proposing team: "El rival ha confirmado la fecha"

---

## 6. Error Handling

- **League with 0 or 1 team activated**: `generateFixtures` returns empty array, `createMany` with 0 records — no error, just no matches shown
- **Match not found**: 404 via Next.js `notFound()`
- **Unauthorized action** (non-member tries to propose): check team membership in Server Action, return `{ error: 'No autorizado' }`
- **DB errors in Server Actions**: caught, return `{ error: 'Error interno. Inténtalo de nuevo.' }`
- **Concurrent proposals**: `updateMany` for SUPERSEDED + `create` in same transaction prevents race conditions

---

## 7. Testing

- `fixture-generator.test.ts` — circle method produces correct round count, each team appears once per round, no duplicate pairings
- `league-service.test.ts` — `activateLeague` calls generator, persists `round`, guard prevents duplicate generation
- `match-scheduling.test.ts` — `proposeDate` supersedes prior proposal, `acceptProposal` sets correct statuses, unauthorized user blocked
- Integration: activate league → verify N-1 rounds created with correct pairings and `round` values

---

## Out of Scope

- Drag-and-drop rescheduling of entire jornadas
- Admin override of round assignments post-activation
- Push notifications (mobile)
- iCal / calendar export
