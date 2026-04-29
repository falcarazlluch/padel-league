# Points Penalty + Reglamento Page + Deadline Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three changes in one branch — (A) penalize teams -1 point for `EXPIRED_UNPLAYED` matches, (B) add a `/reglamento` page with footer + nav link, (C) implement a deadline-extension proposal flow.

**Architecture:** (A) Extend `calculateStandings` and its 3 callers. (B) New page + footer client/server components. (C) New Prisma model `DeadlineExtensionProposal` + 3 service methods on `SchedulingService` + actions + UI panel. All in one feature branch `feat/expiry-extension`.

**Tech Stack:** Next.js 15 App Router, Prisma 5, Tailwind CSS v4, Zod, Vitest.

---

## File Structure

**New files:**
- `src/app/(app)/reglamento/page.tsx` — Reglamento page (Server Component)
- `src/app/(app)/_components/footer.tsx` — Footer (Server Component)
- `prisma/migrations/20260429120000_deadline_extension_proposals/migration.sql`

**Modified files:**
- `src/modules/leagues/application/standings-calculator.ts` — accept `status`, handle `EXPIRED_UNPLAYED`
- `tests/unit/modules/leagues/standings-calculator.test.ts` — new test cases
- `src/app/(app)/dashboard/page.tsx` — query also includes `EXPIRED_UNPLAYED`
- `src/app/(app)/ligas/[slug]/page.tsx` — query also includes `EXPIRED_UNPLAYED`
- `src/modules/match-commentary/application/context-builder.ts` — query also includes `EXPIRED_UNPLAYED`
- `src/app/(app)/_components/nav-links.tsx` — add Reglamento link
- `src/app/(app)/_components/mobile-menu.tsx` — add Reglamento link
- `src/app/(app)/layout.tsx` — render `<Footer />` after `<main>`
- `prisma/schema.prisma` — `DeadlineExtensionProposal` + enum + relations
- `src/modules/leagues/application/scheduling-service.ts` — 3 new methods
- `src/app/(app)/ligas/[slug]/partidos/[matchId]/actions.ts` — 3 new server actions
- `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx` — load active extension proposal
- `src/app/(app)/ligas/[slug]/partidos/[matchId]/schedule-section.tsx` — render extension UI

---

## Task 1: Points penalty — update `calculateStandings`

**Files:**
- Modify: `src/modules/leagues/application/standings-calculator.ts`
- Modify: `tests/unit/modules/leagues/standings-calculator.test.ts`

- [ ] **Step 1: Update the type and logic in `standings-calculator.ts`**

Replace the file entirely with:

```typescript
import type { StandingEntry } from '../domain/types';

type MatchForStandings = {
  teamAId: string;
  teamBId: string;
  status: 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED';
  winnerTeamId: string | null;
  sets: { gamesA: number; gamesB: number }[];
};

export function calculateStandings(
  teamNames: Record<string, string>,
  matches: MatchForStandings[],
): StandingEntry[] {
  const map = new Map<string, StandingEntry>();

  for (const [teamId, teamName] of Object.entries(teamNames)) {
    map.set(teamId, {
      teamId, teamName, played: 0, won: 0, drawn: 0, lost: 0, points: 0,
      setsFor: 0, setsAgainst: 0, setsDiff: 0,
      gamesFor: 0, gamesAgainst: 0, gamesDiff: 0,
    });
  }

  for (const match of matches) {
    const a = map.get(match.teamAId);
    const b = map.get(match.teamBId);
    if (!a || !b) continue;

    a.played++;
    b.played++;

    if (match.status === 'EXPIRED_UNPLAYED') {
      a.points -= 1;
      b.points -= 1;
      continue;
    }

    let setsWonA = 0;
    let setsWonB = 0;
    for (const set of match.sets) {
      if (set.gamesA > set.gamesB) setsWonA++;
      else if (set.gamesB > set.gamesA) setsWonB++;
      a.gamesFor += set.gamesA;
      a.gamesAgainst += set.gamesB;
      b.gamesFor += set.gamesB;
      b.gamesAgainst += set.gamesA;
    }

    a.setsFor += setsWonA;
    a.setsAgainst += setsWonB;
    b.setsFor += setsWonB;
    b.setsAgainst += setsWonA;

    if (match.winnerTeamId === match.teamAId) {
      a.won++; a.points += 3; b.lost++;
    } else if (match.winnerTeamId === match.teamBId) {
      b.won++; b.points += 3; a.lost++;
    } else {
      a.drawn++; a.points++; b.drawn++; b.points++;
    }
  }

  for (const entry of map.values()) {
    entry.setsDiff = entry.setsFor - entry.setsAgainst;
    entry.gamesDiff = entry.gamesFor - entry.gamesAgainst;
  }

  return [...map.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.setsDiff !== a.setsDiff) return b.setsDiff - a.setsDiff;
    if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
    return b.setsFor - a.setsFor;
  });
}
```

- [ ] **Step 2: Update existing test helper to default to `CONFIRMED`**

The test file uses `Parameters<typeof calculateStandings>[1][number]` to derive the input type, so the type already updates. But the `makeMatch` helper doesn't pass `status`. Add it.

In `tests/unit/modules/leagues/standings-calculator.test.ts`, update the `makeMatch` helper:

```typescript
function makeMatch(
  teamAId: string,
  teamBId: string,
  sets: { gamesA: number; gamesB: number }[],
): ConfirmedMatch {
  const setsWonA = sets.filter((s) => s.gamesA > s.gamesB).length;
  const setsWonB = sets.filter((s) => s.gamesB > s.gamesA).length;
  const winnerTeamId = setsWonA > setsWonB ? teamAId : setsWonB > setsWonA ? teamBId : null;
  return { teamAId, teamBId, sets, winnerTeamId, status: 'CONFIRMED' };
}
```

(Type alias `ConfirmedMatch` is already derived from the function signature so it'll auto-accept the new `status` field.)

- [ ] **Step 3: Add new test cases for `EXPIRED_UNPLAYED`**

Append to the same `describe('calculateStandings', ...)` block in `standings-calculator.test.ts`:

```typescript
  it('deducts 1 point from each team when match is EXPIRED_UNPLAYED', () => {
    const matches = [{
      teamAId: 't1',
      teamBId: 't2',
      status: 'EXPIRED_UNPLAYED' as const,
      winnerTeamId: null,
      sets: [],
    }];
    const standings = calculateStandings(teamNames, matches);
    const t1 = standings.find((s) => s.teamId === 't1')!;
    const t2 = standings.find((s) => s.teamId === 't2')!;
    expect(t1.points).toBe(-1);
    expect(t2.points).toBe(-1);
    expect(t1.played).toBe(1);
    expect(t2.played).toBe(1);
    expect(t1.won).toBe(0);
    expect(t1.drawn).toBe(0);
    expect(t1.lost).toBe(0);
  });

  it('does not accumulate sets/games for EXPIRED_UNPLAYED matches', () => {
    const matches = [{
      teamAId: 't1',
      teamBId: 't2',
      status: 'EXPIRED_UNPLAYED' as const,
      winnerTeamId: null,
      sets: [],
    }];
    const standings = calculateStandings(teamNames, matches);
    const t1 = standings.find((s) => s.teamId === 't1')!;
    expect(t1.setsFor).toBe(0);
    expect(t1.setsAgainst).toBe(0);
    expect(t1.gamesFor).toBe(0);
    expect(t1.gamesAgainst).toBe(0);
  });

  it('mixes CONFIRMED wins with EXPIRED_UNPLAYED penalties correctly', () => {
    const matches = [
      makeMatch('t1', 't2', [{ gamesA: 6, gamesB: 3 }, { gamesA: 6, gamesB: 4 }]),
      {
        teamAId: 't1',
        teamBId: 't3',
        status: 'EXPIRED_UNPLAYED' as const,
        winnerTeamId: null,
        sets: [],
      },
    ];
    const standings = calculateStandings(teamNames, matches);
    const t1 = standings.find((s) => s.teamId === 't1')!;
    expect(t1.points).toBe(2); // 3 (win) - 1 (no-show) = 2
    expect(t1.played).toBe(2);
    expect(t1.won).toBe(1);
  });
```

- [ ] **Step 4: Run tests**

```bash
pnpm test:unit -- tests/unit/modules/leagues/standings-calculator.test.ts
```

Expected: all existing tests + 3 new tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/leagues/application/standings-calculator.ts tests/unit/modules/leagues/standings-calculator.test.ts
git commit -m "feat(standings): -1 point penalty for EXPIRED_UNPLAYED matches"
```

---

## Task 2: Update callers to include `EXPIRED_UNPLAYED`

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/ligas/[slug]/page.tsx`
- Modify: `src/modules/match-commentary/application/context-builder.ts`

For each file, find the `prisma.match.findMany` query that fetches matches for standings calculation and add `'EXPIRED_UNPLAYED'` to the status filter, plus pass `status` in the mapped object.

- [ ] **Step 1: Update `src/app/(app)/dashboard/page.tsx`**

Find the block (inside `Promise.all` over `userLeagues.map`):

```typescript
const confirmedMatches = await prisma.match.findMany({
  where: { leagueId: league.id, status: { in: ['CONFIRMED', 'ADMIN_RESOLVED'] } },
  include: { confirmedResult: { include: { sets: true } } },
});
const teamNamesMap = Object.fromEntries(league.teams.map((t) => [t.id, t.name]));
const standings = calculateStandings(
  teamNamesMap,
  confirmedMatches.map((m) => ({
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    winnerTeamId: m.winnerTeamId,
    sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
  })),
);
```

Replace with:

```typescript
const matchesForStandings = await prisma.match.findMany({
  where: { leagueId: league.id, status: { in: ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'] } },
  include: { confirmedResult: { include: { sets: true } } },
});
const teamNamesMap = Object.fromEntries(league.teams.map((t) => [t.id, t.name]));
const standings = calculateStandings(
  teamNamesMap,
  matchesForStandings.map((m) => ({
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    status: m.status as 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED',
    winnerTeamId: m.winnerTeamId,
    sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
  })),
);
```

- [ ] **Step 2: Update `src/app/(app)/ligas/[slug]/page.tsx`**

Find the block:

```typescript
const confirmedMatches = await prisma.match.findMany({
  where: { leagueId: league.id, status: { in: ['CONFIRMED', 'ADMIN_RESOLVED'] } },
  include: { confirmedResult: { include: { sets: true } } },
});

const teamNamesMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
const standingMatches = confirmedMatches.map((m) => ({
  teamAId: m.teamAId,
  teamBId: m.teamBId,
  winnerTeamId: m.winnerTeamId,
  sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
}));

const standings = calculateStandings(teamNamesMap, standingMatches);
```

Replace with:

```typescript
const matchesForStandings = await prisma.match.findMany({
  where: { leagueId: league.id, status: { in: ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'] } },
  include: { confirmedResult: { include: { sets: true } } },
});

const teamNamesMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
const standingMatches = matchesForStandings.map((m) => ({
  teamAId: m.teamAId,
  teamBId: m.teamBId,
  status: m.status as 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED',
  winnerTeamId: m.winnerTeamId,
  sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
}));

const standings = calculateStandings(teamNamesMap, standingMatches);
```

- [ ] **Step 3: Update `src/modules/match-commentary/application/context-builder.ts`**

Find the block (inside `buildContext`):

```typescript
const confirmedMatches = await prisma.match.findMany({
  where: {
    leagueId: match.league.id,
    status: { in: ['CONFIRMED', 'ADMIN_RESOLVED'] },
  },
  include: { confirmedResult: { include: { sets: true } } },
});

const standings = calculateStandings(
  teamNamesMap,
  confirmedMatches.map((m) => ({
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    winnerTeamId: m.winnerTeamId,
    sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
  })),
);
```

Replace with:

```typescript
const standingsMatches = await prisma.match.findMany({
  where: {
    leagueId: match.league.id,
    status: { in: ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'] },
  },
  include: { confirmedResult: { include: { sets: true } } },
});

const standings = calculateStandings(
  teamNamesMap,
  standingsMatches.map((m) => ({
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    status: m.status as 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED',
    winnerTeamId: m.winnerTeamId,
    sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
  })),
);
```

- [ ] **Step 4: Verify**

```bash
pnpm typecheck 2>&1 | grep -E "dashboard/page|ligas/\[slug\]/page|context-builder" | head -10
```

Expected: no NEW errors in these files.

```bash
pnpm test:unit 2>&1 | tail -3
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/dashboard/page.tsx src/app/\(app\)/ligas/\[slug\]/page.tsx src/modules/match-commentary/application/context-builder.ts
git commit -m "feat(standings): include EXPIRED_UNPLAYED matches in standings calculation"
```

---

## Task 3: Reglamento page + nav links

**Files:**
- Create: `src/app/(app)/reglamento/page.tsx`
- Modify: `src/app/(app)/_components/nav-links.tsx`
- Modify: `src/app/(app)/_components/mobile-menu.tsx`

- [ ] **Step 1: Create `src/app/(app)/reglamento/page.tsx`**

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Reglamento — Padel League' };

export default function ReglamentoPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Documentación</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Reglamento</h1>
        <p className="text-sm text-slate-400 mt-1">Cómo funcionan las ligas, los partidos y el sistema de puntos.</p>
      </div>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-brand-navy">Sistema de puntos</h2>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li><strong>Ganar partido:</strong> 3 puntos</li>
          <li><strong>Empatar:</strong> 1 punto</li>
          <li><strong>Perder:</strong> 0 puntos</li>
          <li><strong>No jugar</strong> (deadline expirado): −1 punto para ambos equipos</li>
        </ul>
        <p className="text-sm text-slate-600">
          La clasificación ordena por: puntos → diferencia de sets → diferencia de juegos → sets ganados.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-brand-navy">Reglas de los partidos</h2>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>Todos los partidos son al <strong>mejor de 3 sets</strong>.</li>
          <li>Cada equipo está formado por <strong>2 jugadores</strong>.</li>
          <li>Una vez jugado el partido, cualquier jugador puede enviar el resultado.</li>
          <li>El equipo rival tiene <strong>7 días</strong> para confirmar o disputar.</li>
          <li>Si pasan 7 días sin respuesta, el resultado se aprueba automáticamente.</li>
          <li>En caso de disputa, un administrador resuelve.</li>
        </ul>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-brand-navy">Calendario y jornadas</h2>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>El calendario se genera automáticamente al activar la liga (round-robin).</li>
          <li>Cada jornada tiene una <strong>fecha límite</strong> (deadline).</li>
          <li>Antes del deadline, los dos equipos deben acordar fecha y hora del partido.</li>
          <li>Cualquier jugador puede proponer fecha; el equipo rival acepta o propone otra.</li>
          <li>Si llega el deadline sin partido jugado, cuenta como <strong>no jugado</strong> (−1 punto a cada equipo).</li>
          <li>
            Antes de que llegue el deadline, cualquier equipo puede <strong>proponer extender el plazo</strong>.
            El rival debe aceptarlo. Una vez aceptado, el nuevo deadline sustituye al anterior.
          </li>
          <li>Las extensiones son ilimitadas, siempre dentro del rango de fechas de la liga.</li>
          <li>Una vez expirado un partido, no se puede revivir.</li>
        </ul>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-brand-navy">Disputas</h2>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>Si un equipo no está de acuerdo con un resultado enviado, puede disputarlo dentro de los 7 días.</li>
          <li>La disputa la resuelve un administrador con visibilidad sobre el contexto del partido.</li>
          <li>
            Resoluciones posibles: dar el partido al equipo X, dar el partido al equipo Y,
            marcar como no jugado, o desestimar la disputa.
          </li>
        </ul>
      </article>
    </div>
  );
}
```

- [ ] **Step 2: Add Reglamento link to `nav-links.tsx`**

In `src/app/(app)/_components/nav-links.tsx`, add a `<Link>` entry between "Jugar" and the SUPER_ADMIN block:

```tsx
      <Link href={'/jugar' as Route} className={linkClass(pathname.startsWith('/jugar'))} aria-current={pathname.startsWith('/jugar') ? 'page' : undefined}>
        Jugar
      </Link>
      <Link href={'/reglamento' as Route} className={linkClass(pathname.startsWith('/reglamento'))} aria-current={pathname.startsWith('/reglamento') ? 'page' : undefined}>
        Reglamento
      </Link>
      {isSuperAdmin && (
```

- [ ] **Step 3: Add Reglamento link to `mobile-menu.tsx`**

In `src/app/(app)/_components/mobile-menu.tsx`, add a Link entry between "Jugar" and the `isSuperAdmin && Disputas` block:

```tsx
          <Link href={'/jugar' as Route} onClick={close} className={linkClass(pathname.startsWith('/jugar'))}>
            Jugar
          </Link>
          <Link href={'/reglamento' as Route} onClick={close} className={linkClass(pathname.startsWith('/reglamento'))}>
            Reglamento
          </Link>
          {isSuperAdmin && (
```

- [ ] **Step 4: Verify**

```bash
pnpm typecheck 2>&1 | grep -E "reglamento|nav-links|mobile-menu" | head
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/reglamento/ src/app/\(app\)/_components/nav-links.tsx src/app/\(app\)/_components/mobile-menu.tsx
git commit -m "feat(ui): add /reglamento page and nav links"
```

---

## Task 4: Footer

**Files:**
- Create: `src/app/(app)/_components/footer.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create `src/app/(app)/_components/footer.tsx`**

```tsx
import Link from 'next/link';
import Image from 'next/image';
import type { Route } from 'next';

export function Footer() {
  return (
    <footer className="border-t border-slate-200/80 bg-white mt-12">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
        <div className="space-y-3">
          <Link href="/dashboard" className="inline-flex items-center">
            <Image
              src="/logo.png"
              alt="Padel League"
              width={140}
              height={56}
              className="h-12 w-auto object-contain"
              unoptimized
            />
          </Link>
          <p className="text-xs text-slate-400">Gestión de ligas de pádel.</p>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">App</p>
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li><Link href={'/ligas' as Route} className="hover:text-brand-navy transition-colors">Ligas</Link></li>
            <li><Link href={'/partidos' as Route} className="hover:text-brand-navy transition-colors">Mis partidos</Link></li>
            <li><Link href={'/jugar' as Route} className="hover:text-brand-navy transition-colors">Jugar</Link></li>
            <li><Link href={'/reglamento' as Route} className="hover:text-brand-navy transition-colors">Reglamento</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Cuenta</p>
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li><Link href={'/perfil' as Route} className="hover:text-brand-navy transition-colors">Mi perfil</Link></li>
            <li>
              <form action="/api/auth/logout" method="post" className="inline">
                <button type="submit" className="hover:text-brand-navy transition-colors">Salir</button>
              </form>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Legal</p>
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li><Link href={'/aviso-legal' as Route} className="hover:text-brand-navy transition-colors">Aviso legal</Link></li>
            <li><Link href={'/privacidad' as Route} className="hover:text-brand-navy transition-colors">Privacidad</Link></li>
            <li><Link href={'/cookies' as Route} className="hover:text-brand-navy transition-colors">Cookies</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200/80">
        <div className="max-w-6xl mx-auto px-6 py-4 text-xs text-slate-400 text-center">
          © {new Date().getFullYear()} Padel League · Todos los derechos reservados
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Render `<Footer />` in `(app)/layout.tsx`**

Open `src/app/(app)/layout.tsx`. Add the import alongside `MobileMenu`:

```tsx
import { Footer } from './_components/footer';
```

After the `<main>...{children}</main>` line (which is the last element inside the wrapper div), add `<Footer />`:

```tsx
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      <Footer />
    </div>
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck 2>&1 | grep -E "footer|layout" | head
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/_components/footer.tsx src/app/\(app\)/layout.tsx
git commit -m "feat(ui): add Footer with logo and link columns"
```

---

## Task 5: Schema migration for `DeadlineExtensionProposal`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260429120000_deadline_extension_proposals/migration.sql`

- [ ] **Step 1: Add the enum and model in `prisma/schema.prisma`**

Find the existing `model SchedulingProposal` (around line 360). After it, add:

```prisma
enum ExtensionProposalStatus {
  PROPOSED
  ACCEPTED
  REJECTED
  SUPERSEDED
}

model DeadlineExtensionProposal {
  id                 String                    @id @default(cuid())
  matchId            String                    @map("match_id")
  proposedByUserId   String                    @map("proposed_by_user_id")
  proposedDeadlineAt DateTime                  @map("proposed_deadline_at")
  status             ExtensionProposalStatus   @default(PROPOSED)
  respondedByUserId  String?                   @map("responded_by_user_id")
  respondedAt        DateTime?                 @map("responded_at")
  createdAt          DateTime                  @default(now()) @map("created_at")

  match     Match @relation(fields: [matchId], references: [id], onDelete: Cascade)
  proposer  User  @relation("ExtensionProposer", fields: [proposedByUserId], references: [id], onDelete: Restrict)
  responder User? @relation("ExtensionResponder", fields: [respondedByUserId], references: [id], onDelete: Restrict)

  @@index([matchId, status])
  @@map("deadline_extension_proposals")
}
```

- [ ] **Step 2: Add back-relations**

In `model Match { ... }`, add a list back-relation among the existing relations (e.g., near `schedulingProposals SchedulingProposal[]`):

```prisma
  extensionProposals    DeadlineExtensionProposal[]
```

In `model User { ... }`, add the two relation back-references among existing User relations:

```prisma
  extensionsProposed    DeadlineExtensionProposal[] @relation("ExtensionProposer")
  extensionsResponded   DeadlineExtensionProposal[] @relation("ExtensionResponder")
```

- [ ] **Step 3: Create the migration SQL file**

Create directory: `prisma/migrations/20260429120000_deadline_extension_proposals/`

Create file `prisma/migrations/20260429120000_deadline_extension_proposals/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "ExtensionProposalStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "deadline_extension_proposals" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "proposed_by_user_id" TEXT NOT NULL,
    "proposed_deadline_at" TIMESTAMP(3) NOT NULL,
    "status" "ExtensionProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "responded_by_user_id" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deadline_extension_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deadline_extension_proposals_match_id_status_idx" ON "deadline_extension_proposals"("match_id", "status");

-- AddForeignKey
ALTER TABLE "deadline_extension_proposals" ADD CONSTRAINT "deadline_extension_proposals_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_extension_proposals" ADD CONSTRAINT "deadline_extension_proposals_proposed_by_user_id_fkey"
  FOREIGN KEY ("proposed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_extension_proposals" ADD CONSTRAINT "deadline_extension_proposals_responded_by_user_id_fkey"
  FOREIGN KEY ("responded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

(Verify the actual table names `matches` and `users` exist in `schema.prisma` — check `@@map("matches")` and `@@map("users")`. Adjust if needed.)

- [ ] **Step 4: Regenerate Prisma client**

```bash
pnpm prisma generate
```

If it fails with the cert error, copy from main:
```bash
rm -rf node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma
cp -r "../../node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma" "node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma"
```

But the main copy may also be stale — if so, use `NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm prisma generate` (same workaround as the AI commentary spec).

- [ ] **Step 5: Verify**

```bash
pnpm typecheck 2>&1 | grep -E "DeadlineExtension|ExtensionProposal" | head
```

Expected: no errors.

```bash
pnpm test:unit 2>&1 | tail -3
```

Expected: existing tests still passing.

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat(db): add DeadlineExtensionProposal model"
```

---

## Task 6: Service methods + unit tests

**Files:**
- Modify: `src/modules/leagues/application/scheduling-service.ts`

- [ ] **Step 1: Add 3 new methods to `SchedulingService`**

Open `src/modules/leagues/application/scheduling-service.ts`. Add a Zod import if not already present at the top:

```typescript
// (zod is likely already imported; if not, add: import { z } from 'zod';)
```

At the top of the file, after the existing imports, add this constant:

```typescript
const NON_EXTENDABLE_STATUSES = [
  'EXPIRED_UNPLAYED',
  'CONFIRMED',
  'ADMIN_RESOLVED',
  'CANCELLED',
  'PENDING_VALIDATION',
  'DISPUTED',
] as const;
```

Inside the `SchedulingService` object (before the closing `} as const;`), add these methods (all 3 together):

```typescript
  async proposeDeadlineExtension(
    matchId: string,
    userId: string,
    newDeadlineAt: Date,
  ): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        league: { select: { endDate: true } },
        teamA: { select: { members: { select: { userId: true } } } },
        teamB: { select: { members: { select: { userId: true } } } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');

    const teamAIds = match.teamA.members.map((m) => m.userId);
    const teamBIds = match.teamB.members.map((m) => m.userId);
    if (!teamAIds.includes(userId) && !teamBIds.includes(userId)) {
      throw new AuthorizationError('NOT_TEAM_MEMBER', 'Solo los miembros del partido pueden proponer extensión.');
    }

    if ((NON_EXTENDABLE_STATUSES as readonly string[]).includes(match.status)) {
      throw new DomainError('MATCH_NOT_EXTENDABLE', 'Este partido ya no admite extensiones de plazo.');
    }

    if (newDeadlineAt.getTime() <= match.deadlineAt.getTime()) {
      throw new DomainError('DEADLINE_NOT_LATER', 'La nueva fecha debe ser posterior al deadline actual.');
    }

    if (newDeadlineAt.getTime() <= Date.now()) {
      throw new DomainError('DEADLINE_IN_PAST', 'La nueva fecha debe ser futura.');
    }

    if (newDeadlineAt.getTime() >= match.league.endDate.getTime()) {
      throw new DomainError('DEADLINE_AFTER_LEAGUE_END', 'La nueva fecha debe ser anterior al fin de la liga.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.deadlineExtensionProposal.updateMany({
        where: { matchId, status: 'PROPOSED' },
        data: { status: 'SUPERSEDED' },
      });
      await tx.deadlineExtensionProposal.create({
        data: { matchId, proposedByUserId: userId, proposedDeadlineAt: newDeadlineAt },
      });
    });

    // Notify rival team (fire-and-forget)
    const proposerOnA = teamAIds.includes(userId);
    const rivalIds = proposerOnA ? teamBIds : teamAIds;
    if (rivalIds.length > 0) {
      NotificationService.createMany(
        rivalIds.map((uid) => ({
          userId: uid,
          type: 'EXTENSION_PROPOSED' as const,
          title: 'Propuesta de extensión de plazo',
          body: `Te proponen extender el plazo de un partido hasta el ${newDeadlineAt.toLocaleDateString('es-ES')}.`,
          metadata: { matchId },
        })),
      ).catch(() => undefined);
    }
  },

  async acceptDeadlineExtension(proposalId: string, userId: string): Promise<void> {
    const proposal = await prisma.deadlineExtensionProposal.findUnique({
      where: { id: proposalId },
      include: {
        match: {
          include: {
            teamA: { select: { members: { select: { userId: true } } } },
            teamB: { select: { members: { select: { userId: true } } } },
          },
        },
      },
    });
    if (!proposal) throw new NotFoundError('PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');
    if (proposal.status !== 'PROPOSED') {
      throw new DomainError('PROPOSAL_NOT_PROPOSED', 'Esta propuesta ya fue procesada.');
    }

    const teamAIds = proposal.match.teamA.members.map((m) => m.userId);
    const teamBIds = proposal.match.teamB.members.map((m) => m.userId);
    if (!teamAIds.includes(userId) && !teamBIds.includes(userId)) {
      throw new AuthorizationError('NOT_TEAM_MEMBER', 'Solo los miembros del partido pueden responder.');
    }

    const proposerOnA = teamAIds.includes(proposal.proposedByUserId);
    const userOnA = teamAIds.includes(userId);
    if (proposerOnA === userOnA) {
      throw new AuthorizationError('SAME_TEAM', 'No puedes aceptar tu propia propuesta.');
    }

    if ((NON_EXTENDABLE_STATUSES as readonly string[]).includes(proposal.match.status)) {
      throw new DomainError('MATCH_NOT_EXTENDABLE', 'Este partido ya no admite extensiones.');
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.deadlineExtensionProposal.updateMany({
        where: { id: proposalId, status: 'PROPOSED' },
        data: { status: 'ACCEPTED', respondedByUserId: userId, respondedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new DomainError('PROPOSAL_RACE', 'La propuesta fue procesada por otra operación.');
      }
      await tx.match.update({
        where: { id: proposal.matchId },
        data: { deadlineAt: proposal.proposedDeadlineAt },
      });
    });

    // Notify proposer (fire-and-forget)
    NotificationService.create({
      userId: proposal.proposedByUserId,
      type: 'EXTENSION_ACCEPTED',
      title: 'Tu propuesta de extensión fue aceptada',
      body: `El nuevo plazo es el ${proposal.proposedDeadlineAt.toLocaleDateString('es-ES')}.`,
      metadata: { matchId: proposal.matchId },
    }).catch(() => undefined);
  },

  async rejectDeadlineExtension(proposalId: string, userId: string): Promise<void> {
    const proposal = await prisma.deadlineExtensionProposal.findUnique({
      where: { id: proposalId },
      include: {
        match: {
          include: {
            teamA: { select: { members: { select: { userId: true } } } },
            teamB: { select: { members: { select: { userId: true } } } },
          },
        },
      },
    });
    if (!proposal) throw new NotFoundError('PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');
    if (proposal.status !== 'PROPOSED') {
      throw new DomainError('PROPOSAL_NOT_PROPOSED', 'Esta propuesta ya fue procesada.');
    }

    const teamAIds = proposal.match.teamA.members.map((m) => m.userId);
    const teamBIds = proposal.match.teamB.members.map((m) => m.userId);
    if (!teamAIds.includes(userId) && !teamBIds.includes(userId)) {
      throw new AuthorizationError('NOT_TEAM_MEMBER', 'Solo los miembros del partido pueden responder.');
    }

    const proposerOnA = teamAIds.includes(proposal.proposedByUserId);
    const userOnA = teamAIds.includes(userId);
    if (proposerOnA === userOnA) {
      throw new AuthorizationError('SAME_TEAM', 'No puedes rechazar tu propia propuesta.');
    }

    await prisma.deadlineExtensionProposal.update({
      where: { id: proposalId },
      data: { status: 'REJECTED', respondedByUserId: userId, respondedAt: new Date() },
    });

    NotificationService.create({
      userId: proposal.proposedByUserId,
      type: 'EXTENSION_REJECTED',
      title: 'Tu propuesta de extensión fue rechazada',
      body: 'El equipo rival no ha aceptado la nueva fecha.',
      metadata: { matchId: proposal.matchId },
    }).catch(() => undefined);
  },
```

- [ ] **Step 2: Verify imports**

The methods use `NotFoundError`, `AuthorizationError`, `DomainError`, `prisma`, `NotificationService`. Verify they're already imported at the top of `scheduling-service.ts`:

```bash
head -15 src/modules/leagues/application/scheduling-service.ts
```

If `NotificationService` is missing, add:
```typescript
import { NotificationService } from '@/modules/notifications';
```

If any error class is missing, add it to the import from `@/shared/errors`.

- [ ] **Step 3: Add notification types to schema**

Open `prisma/schema.prisma` and find the `enum NotificationType`. Add the three new types if not present:

```prisma
enum NotificationType {
  // ...existing values
  EXTENSION_PROPOSED
  EXTENSION_ACCEPTED
  EXTENSION_REJECTED
}
```

If already present (defensive), leave as-is.

- [ ] **Step 4: Update the migration to add the enum values**

If the values are NEW in the schema, append to the migration file `prisma/migrations/20260429120000_deadline_extension_proposals/migration.sql`:

```sql
-- AlterEnum: NotificationType
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXTENSION_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXTENSION_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXTENSION_REJECTED';
```

(`IF NOT EXISTS` makes this idempotent.)

Re-run `pnpm prisma generate`.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "scheduling-service" | head
```

Expected: no NEW errors.

- [ ] **Step 6: Run tests**

```bash
pnpm test:unit
```

Expected: all existing tests still passing.

- [ ] **Step 7: Commit**

```bash
git add prisma/ src/modules/leagues/application/scheduling-service.ts
git commit -m "feat(scheduling): add propose/accept/reject deadline extension methods"
```

---

## Task 7: Server actions

**Files:**
- Modify: `src/app/(app)/ligas/[slug]/partidos/[matchId]/actions.ts`

- [ ] **Step 1: Add 3 new actions**

Open `src/app/(app)/ligas/[slug]/partidos/[matchId]/actions.ts`. Append at the bottom of the file:

```typescript
const proposeExtensionSchema = z.object({
  matchId: z.string().cuid(),
  slug: z.string().min(1),
  newDeadlineAt: z
    .string()
    .min(1, 'Selecciona una fecha.')
    .transform((v) => new Date(v))
    .refine((d) => !isNaN(d.getTime()), { message: 'Fecha no válida.' }),
});

export async function proposeDeadlineExtensionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();

  const parsed = proposeExtensionSchema.safeParse({
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
    newDeadlineAt: formData.get('newDeadlineAt'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await SchedulingService.proposeDeadlineExtension(
      parsed.data.matchId,
      user.id,
      parsed.data.newDeadlineAt,
    );
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    revalidatePath('/partidos');
    return { success: true };
  } catch (err: unknown) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const respondExtensionSchema = z.object({
  proposalId: z.string().cuid(),
  matchId: z.string().cuid(),
  slug: z.string().min(1),
});

export async function acceptDeadlineExtensionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = respondExtensionSchema.safeParse({
    proposalId: formData.get('proposalId'),
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
  });
  if (!parsed.success) return { error: 'Datos inválidos.' };

  try {
    await SchedulingService.acceptDeadlineExtension(parsed.data.proposalId, user.id);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    revalidatePath('/partidos');
    return { success: true };
  } catch (err: unknown) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function rejectDeadlineExtensionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = respondExtensionSchema.safeParse({
    proposalId: formData.get('proposalId'),
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
  });
  if (!parsed.success) return { error: 'Datos inválidos.' };

  try {
    await SchedulingService.rejectDeadlineExtension(parsed.data.proposalId, user.id);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    return { success: true };
  } catch (err: unknown) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
```

- [ ] **Step 2: Verify**

```bash
pnpm typecheck 2>&1 | grep -E "ligas/\[slug\]/partidos/\[matchId\]/actions" | head
```

Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ligas/[slug]/partidos/[matchId]/actions.ts"
git commit -m "feat(actions): add propose/accept/reject deadline extension server actions"
```

---

## Task 8: UI integration in `schedule-section.tsx`

**Files:**
- Modify: `src/app/(app)/ligas/[slug]/partidos/[matchId]/schedule-section.tsx`
- Modify: `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx`

- [ ] **Step 1: Load active extension proposal in `page.tsx`**

Open `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx`. Find the existing data-fetching block (where `match`, `commentaries`, `isLeagueAdmin` are fetched).

Add a new fetch alongside the existing ones for the active extension proposal:

```typescript
  const activeExtension = await prisma.deadlineExtensionProposal.findFirst({
    where: { matchId, status: 'PROPOSED' },
    include: {
      proposer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
```

Compute whether the user is the proposer or rival (or neither) using the existing team membership info. Add this near where similar derived values are computed:

```typescript
  let extensionState: 'none' | 'mine' | 'rival' = 'none';
  if (activeExtension) {
    const proposerOnA = match.teamA.members.some((m) => m.userId === activeExtension.proposedByUserId);
    const userOnA = match.teamA.members.some((m) => m.userId === currentUser.id);
    if (proposerOnA === userOnA) extensionState = 'mine';
    else extensionState = 'rival';
  }
```

(Adjust variable names — `match.teamA.members` and `currentUser.id` to whatever the existing code uses. Use `grep -n "teamA\|currentUser\|userId" page.tsx` to locate.)

Update the `<ScheduleSection>` component invocation to pass the new props (find where it's rendered):

```tsx
<ScheduleSection
  matchId={match.id}
  slug={slug}
  matchStatus={match.status}
  matchDeadlineAt={match.deadlineAt}
  leagueEndDate={match.league.endDate}
  proposalState={proposalState}
  proposedDate={match.activeProposal?.proposedDate ?? null}
  scheduledAt={match.scheduledAt ?? null}
  isTeamMember={isTeamMember}
  extensionState={extensionState}
  activeExtension={activeExtension ? {
    id: activeExtension.id,
    proposedDeadlineAt: activeExtension.proposedDeadlineAt,
    proposerName: activeExtension.proposer.name,
  } : null}
/>
```

Also include `match.league.endDate` in the prisma query if not already (it should be — verify).

- [ ] **Step 2: Update `schedule-section.tsx` props and render the extension UI**

Open `src/app/(app)/ligas/[slug]/partidos/[matchId]/schedule-section.tsx`. Add the new imports:

```typescript
import {
  proposeDate,
  acceptProposal,
  proposeDeadlineExtensionAction,
  acceptDeadlineExtensionAction,
  rejectDeadlineExtensionAction,
} from './actions';
```

Update the `Props` type:

```typescript
type Props = {
  matchId: string;
  slug: string;
  matchStatus: string;
  matchDeadlineAt: Date;
  leagueEndDate: Date;
  proposalState: 'none' | 'mine' | 'rival';
  proposedDate: Date | null;
  scheduledAt: Date | null;
  isTeamMember: boolean;
  extensionState: 'none' | 'mine' | 'rival';
  activeExtension: { id: string; proposedDeadlineAt: Date; proposerName: string } | null;
};
```

Update the function signature destructure:

```typescript
export function ScheduleSection({
  matchId, slug, matchStatus, matchDeadlineAt, leagueEndDate,
  proposalState, proposedDate, scheduledAt, isTeamMember,
  extensionState, activeExtension,
}: Props) {
```

After the existing `useActionState` calls (`proposeState`, `acceptState`), add:

```typescript
  const [extProposeState, extProposeAction, extProposePending] = useActionState(proposeDeadlineExtensionAction, null);
  const [extAcceptState, extAcceptAction, extAcceptPending] = useActionState(acceptDeadlineExtensionAction, null);
  const [extRejectState, extRejectAction, extRejectPending] = useActionState(rejectDeadlineExtensionAction, null);
  const [showExtensionForm, setShowExtensionForm] = useState(false);
```

At the bottom of the component's returned JSX (before the closing `</div>` of the outermost wrapper, OR as a sibling section depending on existing structure), add the extension UI block. The exact placement depends on the existing JSX shape; insert it right after the existing scheduling blocks, BEFORE the final closing tag:

```tsx
      {/* Deadline extension UI */}
      {isTeamMember && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-brand-navy">Plazo del partido</p>
            <p className="text-xs text-slate-400">
              Vence el {matchDeadlineAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </p>
          </div>

          {extensionState === 'rival' && activeExtension && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
              <p className="text-sm text-blue-800">
                <strong>{activeExtension.proposerName}</strong> propone extender hasta el{' '}
                <strong>{activeExtension.proposedDeadlineAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</strong>
              </p>
              <div className="flex gap-2">
                <form action={extAcceptAction}>
                  <input type="hidden" name="proposalId" value={activeExtension.id} />
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="slug" value={slug} />
                  <button type="submit" disabled={extAcceptPending}
                    className="text-xs px-3 py-1.5 bg-gradient-to-br from-emerald-500 to-green-600 text-white font-bold rounded-full shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {extAcceptPending ? '...' : 'Aceptar'}
                  </button>
                </form>
                <form action={extRejectAction}>
                  <input type="hidden" name="proposalId" value={activeExtension.id} />
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="slug" value={slug} />
                  <button type="submit" disabled={extRejectPending}
                    className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-full hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    Rechazar
                  </button>
                </form>
              </div>
              {extAcceptState && 'error' in extAcceptState && (
                <p className="text-xs text-red-600">{extAcceptState.error}</p>
              )}
              {extRejectState && 'error' in extRejectState && (
                <p className="text-xs text-red-600">{extRejectState.error}</p>
              )}
            </div>
          )}

          {extensionState === 'mine' && activeExtension && (
            <p className="text-sm text-slate-600 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
              ⏳ Has propuesto extender hasta el{' '}
              <strong>{activeExtension.proposedDeadlineAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</strong>.
              Esperando respuesta del rival.
            </p>
          )}

          {extensionState === 'none' && !showExtensionForm && (
            <button
              type="button"
              onClick={() => setShowExtensionForm(true)}
              className="text-xs px-3 py-1.5 bg-brand-navy/8 text-brand-navy font-semibold rounded-full border border-brand-navy/15 hover:bg-brand-navy/12 transition-colors"
            >
              Proponer ampliación de plazo
            </button>
          )}

          {extensionState === 'none' && showExtensionForm && (
            <form action={extProposeAction} className="space-y-2">
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="slug" value={slug} />
              <label className="block text-xs font-medium text-slate-700">
                Nueva fecha límite (debe ser posterior al deadline actual y anterior al fin de liga)
              </label>
              <input
                type="date"
                name="newDeadlineAt"
                required
                min={new Date(matchDeadlineAt.getTime() + 86400000).toISOString().slice(0, 10)}
                max={new Date(leagueEndDate.getTime() - 86400000).toISOString().slice(0, 10)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={extProposePending}
                  className="text-xs px-3 py-1.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold rounded-full shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {extProposePending ? 'Enviando...' : 'Proponer'}
                </button>
                <button type="button" onClick={() => setShowExtensionForm(false)}
                  className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-full hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
              </div>
              {extProposeState && 'error' in extProposeState && (
                <p className="text-xs text-red-600">{extProposeState.error}</p>
              )}
              {extProposeState && 'success' in extProposeState && (
                <p className="text-xs text-emerald-600">Propuesta enviada.</p>
              )}
            </form>
          )}
        </div>
      )}
```

This goes inside the component but as a separate block. If the existing component has multiple early-return branches (like `DATE_CONFIRMED`), the extension UI should NOT appear in those — only in the main extendable-match path. The simplest is to wrap it inside the existing main branch, or to skip it when `matchStatus` is in the non-extendable list (`EXPIRED_UNPLAYED`, `CONFIRMED`, `ADMIN_RESOLVED`, `CANCELLED`, `PENDING_VALIDATION`, `DISPUTED`).

Add an early check at the top of the JSX (or before rendering the extension block):

```typescript
  const NON_EXTENDABLE = ['EXPIRED_UNPLAYED', 'CONFIRMED', 'ADMIN_RESOLVED', 'CANCELLED', 'PENDING_VALIDATION', 'DISPUTED'];
  const canExtend = !NON_EXTENDABLE.includes(matchStatus);
```

And gate the entire extension JSX block: `{isTeamMember && canExtend && ( ... )}`.

- [ ] **Step 3: Verify**

```bash
pnpm typecheck 2>&1 | grep -E "schedule-section|ligas/\[slug\]/partidos/\[matchId\]/page" | head
```

Expected: no NEW errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ligas/[slug]/partidos/[matchId]/"
git commit -m "feat(ui): deadline extension panel in schedule section"
```

---

## Final verification

After all 8 tasks:

- [ ] **Final typecheck**

```bash
pnpm typecheck
```

Expected: no NEW errors (pre-existing errors are OK).

- [ ] **Run all unit tests**

```bash
pnpm test:unit
```

Expected: all existing tests + new standings tests passing.
