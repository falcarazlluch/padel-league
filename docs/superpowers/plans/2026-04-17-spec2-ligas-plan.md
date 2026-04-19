# Plan 2: Ligas — UI Foundation + Liga Management

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First player-visible feature — Tailwind CSS styling + full liga management with teams, round-robin fixtures, and standings table.

**Architecture:** Tailwind CSS v4 (auto-detects content, no config file needed) for styling. `src/modules/leagues/` holds domain types + application logic isolated from Next.js. Server Components for data, Server Actions for mutations. Pages live under `src/app/(app)/ligas/`.

**Tech Stack:** Tailwind CSS v4, `@tailwindcss/postcss`, Prisma 5.22, Next.js 15 Server Components, Server Actions, Zod v4

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `postcss.config.mjs` | Create | Enable Tailwind v4 PostCSS plugin |
| `src/app/globals.css` | Modify | Add `@import "tailwindcss"` |
| `src/app/(app)/layout.tsx` | Modify | Replace inline styles with Tailwind; add liga nav link |
| `src/app/(auth)/layout.tsx` | Modify | Replace inline styles with Tailwind |
| `src/app/(auth)/login/page.tsx` | Modify | Replace inline styles with Tailwind |
| `src/app/(app)/dashboard/page.tsx` | Modify | Link to ligas list |
| `src/modules/leagues/domain/types.ts` | Create | Domain types (LeagueRow, TeamRow, MatchRow, StandingEntry) |
| `src/modules/leagues/application/league-service.ts` | Create | CRUD: createLeague, listLeagues, getLeagueBySlug, createTeam, addTeamMember, removeTeamMember, activateLeague |
| `src/modules/leagues/application/fixture-generator.ts` | Create | Round-robin fixture generation |
| `src/modules/leagues/application/standings-calculator.ts` | Create | Standings algorithm with tiebreakers |
| `src/modules/leagues/index.ts` | Create | Re-exports public API |
| `src/app/(app)/ligas/page.tsx` | Create | Liga list (all ligas user can see) |
| `src/app/(app)/ligas/nueva/page.tsx` | Create | Create liga form |
| `src/app/(app)/ligas/actions.ts` | Create | Server Actions: createLeagueAction, createTeamAction, addMemberAction, removeMemberAction, activateLeagueAction |
| `src/app/(app)/ligas/[slug]/page.tsx` | Create | Liga detail: teams, standings, matches |
| `src/app/(app)/ligas/[slug]/equipos/nueva/page.tsx` | Create | Create team form |
| `tests/unit/modules/leagues/fixture-generator.test.ts` | Create | Round-robin correctness |
| `tests/unit/modules/leagues/standings-calculator.test.ts` | Create | Standings + tiebreaker correctness |

---

## Task 1: Install Tailwind CSS v4 + Style Existing Pages

**Files:**
- Create: `postcss.config.mjs`
- Modify: `src/app/globals.css`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(auth)/layout.tsx`
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Install Tailwind v4**

```bash
pnpm add -D tailwindcss @tailwindcss/postcss
```

- [ ] **Step 2: Create PostCSS config**

Create `postcss.config.mjs`:
```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 3: Update globals.css**

Replace entire `src/app/globals.css` content:
```css
@import "tailwindcss";

*, *::before, *::after {
  box-sizing: border-box;
}
```

- [ ] **Step 4: Update auth layout with Tailwind**

Replace `src/app/(auth)/layout.tsx`:
```tsx
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update login page with Tailwind**

Replace `src/app/(auth)/login/page.tsx`:
```tsx
import Link from 'next/link';
import type { Route } from 'next';
import { loginAction } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = '/dashboard' } = await searchParams;
  const formAction = loginAction as unknown as (formData: FormData) => Promise<void>;

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">PadelLeague</h1>
      <p className="text-sm text-gray-500 mb-6">Inicia sesión en tu cuenta</p>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          Entrar
        </button>
        <Link
          href={'/recuperar-password' as Route}
          className="text-sm text-center text-blue-600 hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </>
  );
}
```

- [ ] **Step 6: Update app layout with Tailwind + liga nav link**

Replace `src/app/(app)/layout.tsx`:
```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');

  try {
    await getValidatedSession(token);
  } catch {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-gray-900 text-lg">
            PadelLeague
          </Link>
          <Link href="/ligas" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Ligas
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/perfil" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Mi perfil
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 7: Update dashboard page**

Replace `src/app/(app)/dashboard/page.tsx`:
```tsx
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');
  const user = await getValidatedSession(token);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Bienvenido, {user.name}</h1>
      <p className="text-sm text-gray-500 mb-8">Gestiona tus ligas de pádel</p>
      <Link
        href="/ligas"
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
      >
        Ver ligas
      </Link>
    </div>
  );
}
```

- [ ] **Step 8: Typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(ui): install Tailwind CSS v4 + style existing pages"
```

---

## Task 2: Leagues Domain Types + Application Service

**Files:**
- Create: `src/modules/leagues/domain/types.ts`
- Create: `src/modules/leagues/application/league-service.ts`
- Create: `src/modules/leagues/index.ts`

- [ ] **Step 1: Write types**

Create `src/modules/leagues/domain/types.ts`:
```ts
import type { LeagueStatus, MatchFormat, LeagueMemberRole, MatchStatus } from '@prisma/client';

export type LeagueRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  status: LeagueStatus;
  matchFormat: MatchFormat;
  defaultDeadlineDays: number;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  createdByUserId: string;
  createdAt: Date;
};

export type TeamRow = {
  id: string;
  leagueId: string;
  name: string;
  members: { userId: string; user: { id: string; name: string; email: string } }[];
};

export type MatchRow = {
  id: string;
  leagueId: string;
  teamAId: string;
  teamBId: string;
  status: MatchStatus;
  scheduledAt: Date | null;
  deadlineAt: Date;
  teamA: { id: string; name: string };
  teamB: { id: string; name: string };
};

export type StandingEntry = {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  setsFor: number;
  setsAgainst: number;
  setsDiff: number;
  gamesFor: number;
  gamesAgainst: number;
  gamesDiff: number;
};

export type CreateLeagueInput = {
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  matchFormat?: MatchFormat;
  defaultDeadlineDays?: number;
  createdByUserId: string;
};

export type CreateTeamInput = {
  leagueId: string;
  name: string;
};
```

- [ ] **Step 2: Write league service**

Create `src/modules/leagues/application/league-service.ts`:
```ts
import { prisma } from '@/shared/db/client';
import { ConflictError, NotFoundError, AuthorizationError, DomainError } from '@/shared/errors';
import type { CreateLeagueInput, CreateTeamInput, LeagueRow, TeamRow, MatchRow } from '../domain/types';
import { LeagueStatus } from '@prisma/client';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const LeagueService = {
  async create(input: CreateLeagueInput): Promise<LeagueRow> {
    const baseSlug = toSlug(input.name);
    const existing = await prisma.league.findMany({ where: { slug: { startsWith: baseSlug } } });
    const slug = existing.length === 0 ? baseSlug : `${baseSlug}-${existing.length + 1}`;

    const league = await prisma.league.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        matchFormat: input.matchFormat ?? 'FLEXIBLE',
        defaultDeadlineDays: input.defaultDeadlineDays ?? 21,
        createdByUserId: input.createdByUserId,
        members: {
          create: { userId: input.createdByUserId, role: 'LEAGUE_ADMIN' },
        },
      },
    });
    return league;
  },

  async list(): Promise<LeagueRow[]> {
    return prisma.league.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  async getBySlug(slug: string): Promise<LeagueRow> {
    const league = await prisma.league.findUnique({ where: { slug } });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Liga no encontrada.');
    return league;
  },

  async getTeams(leagueId: string): Promise<TeamRow[]> {
    return prisma.team.findMany({
      where: { leagueId },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
      orderBy: { name: 'asc' },
    });
  },

  async getMatches(leagueId: string): Promise<MatchRow[]> {
    return prisma.match.findMany({
      where: { leagueId },
      include: {
        teamA: { select: { id: true, name: true } },
        teamB: { select: { id: true, name: true } },
      },
      orderBy: { deadlineAt: 'asc' },
    });
  },

  async createTeam(input: CreateTeamInput): Promise<{ id: string; name: string }> {
    const exists = await prisma.team.findFirst({
      where: { leagueId: input.leagueId, name: input.name },
    });
    if (exists) throw new ConflictError('TEAM_EXISTS', 'Ya existe un equipo con ese nombre en esta liga.');

    return prisma.team.create({ data: { leagueId: input.leagueId, name: input.name } });
  },

  async addTeamMember(teamId: string, userId: string): Promise<void> {
    const team = await prisma.team.findUnique({ where: { id: teamId }, include: { members: true } });
    if (!team) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');
    if (team.members.length >= 2) throw new DomainError('TEAM_FULL', 'El equipo ya tiene 2 miembros.');
    if (team.members.some((m) => m.userId === userId))
      throw new ConflictError('MEMBER_EXISTS', 'El jugador ya es miembro de este equipo.');

    const league = await prisma.league.findUnique({ where: { id: team.leagueId } });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Liga no encontrada.');
    if (league.status !== 'DRAFT')
      throw new DomainError('LEAGUE_NOT_DRAFT', 'No se pueden modificar equipos de una liga activa.');

    await prisma.teamMember.create({ data: { teamId, userId } });
  },

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    const member = await prisma.teamMember.findFirst({ where: { teamId, userId } });
    if (!member) throw new NotFoundError('MEMBER_NOT_FOUND', 'El jugador no es miembro de este equipo.');

    const team = await prisma.team.findUnique({ where: { id: teamId }, include: { league: true } });
    if (team?.league.status !== 'DRAFT')
      throw new DomainError('LEAGUE_NOT_DRAFT', 'No se pueden modificar equipos de una liga activa.');

    await prisma.teamMember.delete({ where: { id: member.id } });
  },

  async activateLeague(leagueId: string, requestingUserId: string): Promise<void> {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: { teams: { include: { members: true } } },
    });
    if (!league) throw new NotFoundError('LEAGUE_NOT_FOUND', 'Liga no encontrada.');
    if (league.status !== 'DRAFT')
      throw new DomainError('LEAGUE_NOT_DRAFT', 'La liga ya está activa o finalizada.');

    const member = await prisma.leagueMember.findFirst({
      where: { leagueId, userId: requestingUserId, role: 'LEAGUE_ADMIN' },
    });
    if (!member) throw new AuthorizationError('NOT_LEAGUE_ADMIN', 'Solo el admin de liga puede activarla.');

    if (league.teams.length < 2)
      throw new DomainError('NOT_ENOUGH_TEAMS', 'La liga necesita al menos 2 equipos para activarse.');

    const teamsWithWrongSize = league.teams.filter((t) => t.members.length !== 2);
    if (teamsWithWrongSize.length > 0) {
      const names = teamsWithWrongSize.map((t) => t.name).join(', ');
      throw new DomainError('TEAM_SIZE_INVALID', `Los siguientes equipos no tienen exactamente 2 jugadores: ${names}.`);
    }

    await prisma.league.update({ where: { id: leagueId }, data: { status: 'ACTIVE' } });
  },
} as const;
```

- [ ] **Step 3: Create module index**

Create `src/modules/leagues/index.ts`:
```ts
export { LeagueService } from './application/league-service';
export { generateFixtures } from './application/fixture-generator';
export { calculateStandings } from './application/standings-calculator';
export type { LeagueRow, TeamRow, MatchRow, StandingEntry, CreateLeagueInput, CreateTeamInput } from './domain/types';
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/
git commit -m "feat(leagues): domain types + LeagueService (create, list, teams, activate)"
```

---

## Task 3: Fixture Generator

**Files:**
- Create: `src/modules/leagues/application/fixture-generator.ts`
- Create: `tests/unit/modules/leagues/fixture-generator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/modules/leagues/fixture-generator.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generateFixtures } from '@/modules/leagues/application/fixture-generator';

describe('generateFixtures', () => {
  it('generates correct number of matches for 4 teams (round-robin)', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    // 4 teams = 4*(4-1)/2 = 6 matches
    expect(matches).toHaveLength(6);
  });

  it('each pair plays exactly once', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    const pairs = matches.map((m) => [m.teamAId, m.teamBId].sort().join('-'));
    expect(new Set(pairs).size).toBe(6);
  });

  it('generates correct number of matches for 3 teams (odd)', () => {
    const teams = ['t1', 't2', 't3'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    // 3 teams = 3*(3-1)/2 = 3 matches
    expect(matches).toHaveLength(3);
  });

  it('generates correct number of matches for 5 teams', () => {
    const teams = ['t1', 't2', 't3', 't4', 't5'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    // 5 teams = 5*(5-1)/2 = 10 matches
    expect(matches).toHaveLength(10);
  });

  it('each match has a deadlineAt set to startDate + deadlineDays', () => {
    const startDate = new Date('2025-01-01');
    const matches = generateFixtures(['t1', 't2'], startDate, 21);
    const expected = new Date('2025-01-01');
    expected.setDate(expected.getDate() + 21);
    expect(matches[0]!.deadlineAt.getTime()).toBe(expected.getTime());
  });

  it('no team plays itself', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    matches.forEach((m) => expect(m.teamAId).not.toBe(m.teamBId));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:unit tests/unit/modules/leagues/fixture-generator.test.ts
```
Expected: FAIL — `Cannot find module '@/modules/leagues/application/fixture-generator'`

- [ ] **Step 3: Implement fixture generator**

Create `src/modules/leagues/application/fixture-generator.ts`:
```ts
type FixtureMatch = {
  teamAId: string;
  teamBId: string;
  deadlineAt: Date;
};

export function generateFixtures(
  teamIds: string[],
  leagueStartDate: Date,
  defaultDeadlineDays: number,
): FixtureMatch[] {
  const matches: FixtureMatch[] = [];
  const deadline = new Date(leagueStartDate);
  deadline.setDate(deadline.getDate() + defaultDeadlineDays);

  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      matches.push({
        teamAId: teamIds[i]!,
        teamBId: teamIds[j]!,
        deadlineAt: new Date(deadline),
      });
    }
  }

  return matches;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:unit tests/unit/modules/leagues/fixture-generator.test.ts
```
Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/leagues/application/fixture-generator.ts tests/unit/modules/leagues/fixture-generator.test.ts
git commit -m "feat(leagues): round-robin fixture generator + tests"
```

---

## Task 4: Standings Calculator

**Files:**
- Create: `src/modules/leagues/application/standings-calculator.ts`
- Create: `tests/unit/modules/leagues/standings-calculator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/modules/leagues/standings-calculator.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { calculateStandings } from '@/modules/leagues/application/standings-calculator';

type ConfirmedMatch = Parameters<typeof calculateStandings>[1][number];

const teamNames: Record<string, string> = { t1: 'Team 1', t2: 'Team 2', t3: 'Team 3', t4: 'Team 4' };

function makeMatch(
  teamAId: string,
  teamBId: string,
  sets: { gamesA: number; gamesB: number }[],
): ConfirmedMatch {
  const setsWonA = sets.filter((s) => s.gamesA > s.gamesB).length;
  const setsWonB = sets.filter((s) => s.gamesB > s.gamesA).length;
  const winnerTeamId = setsWonA > setsWonB ? teamAId : setsWonB > setsWonA ? teamBId : null;
  return { teamAId, teamBId, sets, winnerTeamId };
}

describe('calculateStandings', () => {
  it('gives 3 points to winner and 0 to loser', () => {
    const matches = [makeMatch('t1', 't2', [{ gamesA: 6, gamesB: 3 }, { gamesA: 6, gamesB: 2 }])];
    const standings = calculateStandings(teamNames, matches);
    const t1 = standings.find((s) => s.teamId === 't1')!;
    const t2 = standings.find((s) => s.teamId === 't2')!;
    expect(t1.points).toBe(3);
    expect(t2.points).toBe(0);
    expect(t1.won).toBe(1);
    expect(t2.lost).toBe(1);
  });

  it('gives 1 point each for a draw', () => {
    const matches = [makeMatch('t1', 't2', [{ gamesA: 6, gamesB: 3 }, { gamesA: 3, gamesB: 6 }])];
    const standings = calculateStandings(teamNames, matches);
    const t1 = standings.find((s) => s.teamId === 't1')!;
    const t2 = standings.find((s) => s.teamId === 't2')!;
    expect(t1.points).toBe(1);
    expect(t2.points).toBe(1);
    expect(t1.drawn).toBe(1);
  });

  it('sorts by points descending', () => {
    const matches = [
      makeMatch('t1', 't2', [{ gamesA: 6, gamesB: 3 }, { gamesA: 6, gamesB: 2 }]),
      makeMatch('t2', 't3', [{ gamesA: 6, gamesB: 3 }, { gamesA: 6, gamesB: 2 }]),
    ];
    const standings = calculateStandings(teamNames, matches);
    expect(standings[0]!.teamId).toBe('t1');
    expect(standings[1]!.teamId).toBe('t2');
    expect(standings[2]!.teamId).toBe('t3');
  });

  it('tracks sets for/against correctly', () => {
    const matches = [makeMatch('t1', 't2', [{ gamesA: 6, gamesB: 3 }, { gamesA: 6, gamesB: 2 }])];
    const standings = calculateStandings(teamNames, matches);
    const t1 = standings.find((s) => s.teamId === 't1')!;
    expect(t1.setsFor).toBe(2);
    expect(t1.setsAgainst).toBe(0);
  });

  it('returns entry for every team even with no matches played', () => {
    const standings = calculateStandings(teamNames, []);
    expect(standings).toHaveLength(4);
    standings.forEach((s) => {
      expect(s.points).toBe(0);
      expect(s.played).toBe(0);
    });
  });

  it('tiebreak by set difference when points equal', () => {
    // t1 wins 2-0 sets, t2 wins 2-1 sets (both 3 points)
    const matches = [
      makeMatch('t1', 't3', [{ gamesA: 6, gamesB: 3 }, { gamesA: 6, gamesB: 2 }]),
      makeMatch('t2', 't3', [{ gamesA: 6, gamesB: 3 }, { gamesA: 3, gamesB: 6 }, { gamesA: 6, gamesB: 3 }]),
    ];
    const standings = calculateStandings(teamNames, matches);
    const t1 = standings.find((s) => s.teamId === 't1')!;
    const t2 = standings.find((s) => s.teamId === 't2')!;
    expect(t1.points).toBe(3);
    expect(t2.points).toBe(3);
    // t1 has setsDiff=2, t2 has setsDiff=1 → t1 is ranked higher
    expect(standings.indexOf(t1)).toBeLessThan(standings.indexOf(t2));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:unit tests/unit/modules/leagues/standings-calculator.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement standings calculator**

Create `src/modules/leagues/application/standings-calculator.ts`:
```ts
import type { StandingEntry } from '../domain/types';

type ConfirmedMatch = {
  teamAId: string;
  teamBId: string;
  winnerTeamId: string | null;
  sets: { gamesA: number; gamesB: number }[];
};

export function calculateStandings(
  teamNames: Record<string, string>,
  confirmedMatches: ConfirmedMatch[],
): StandingEntry[] {
  const map = new Map<string, StandingEntry>();

  for (const [teamId, teamName] of Object.entries(teamNames)) {
    map.set(teamId, {
      teamId,
      teamName,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      points: 0,
      setsFor: 0,
      setsAgainst: 0,
      setsDiff: 0,
      gamesFor: 0,
      gamesAgainst: 0,
      gamesDiff: 0,
    });
  }

  for (const match of confirmedMatches) {
    const a = map.get(match.teamAId);
    const b = map.get(match.teamBId);
    if (!a || !b) continue;

    a.played++;
    b.played++;

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
      a.won++;
      a.points += 3;
      b.lost++;
    } else if (match.winnerTeamId === match.teamBId) {
      b.won++;
      b.points += 3;
      a.lost++;
    } else {
      a.drawn++;
      a.points++;
      b.drawn++;
      b.points++;
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:unit tests/unit/modules/leagues/standings-calculator.test.ts
```
Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/leagues/application/standings-calculator.ts tests/unit/modules/leagues/standings-calculator.test.ts
git commit -m "feat(leagues): standings calculator with tiebreakers + tests"
```

---

## Task 5: Server Actions for Liga + Team Management

**Files:**
- Create: `src/app/(app)/ligas/actions.ts`

- [ ] **Step 1: Write actions**

Create `src/app/(app)/ligas/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { LeagueService } from '@/modules/leagues';
import { generateFixtures } from '@/modules/leagues';
import { prisma } from '@/shared/db/client';
import { isUserFacingError } from '@/shared/errors';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

const createLeagueSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  description: z.string().max(500).optional(),
  startDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Fecha de inicio inválida'),
  endDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Fecha de fin inválida'),
});

export async function createLeagueAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();
  const parsed = createLeagueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }
  const { name, description, startDate, endDate } = parsed.data;
  if (new Date(endDate) <= new Date(startDate)) {
    return { error: 'La fecha de fin debe ser posterior a la de inicio.' };
  }
  try {
    const league = await LeagueService.create({
      name,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      createdByUserId: user.id,
    });
    redirect(`/ligas/${league.slug}` as Route);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const createTeamSchema = z.object({
  leagueId: z.string().cuid(),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(60),
});

export async function createTeamAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  await getSession();
  const parsed = createTeamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  const { leagueId, name } = parsed.data;
  try {
    await LeagueService.createTeam({ leagueId, name });
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const addMemberSchema = z.object({
  teamId: z.string().cuid(),
  userEmail: z.string().email('Email inválido'),
});

export async function addTeamMemberAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  await getSession();
  const parsed = addMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  const { teamId, userEmail } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) return { error: 'No existe ningún usuario con ese email.' };

  try {
    await LeagueService.addTeamMember(teamId, user.id);
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function removeTeamMemberAction(teamId: string, userId: string): Promise<{ error?: string }> {
  await getSession();
  try {
    await LeagueService.removeTeamMember(teamId, userId);
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function activateLeagueAction(leagueId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await LeagueService.activateLeague(leagueId, user.id);
    // generate fixtures
    const teams = await prisma.team.findMany({ where: { leagueId } });
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) return { error: 'Liga no encontrada.' };

    const fixtures = generateFixtures(
      teams.map((t) => t.id),
      league.startDate,
      league.defaultDeadlineDays,
    );
    await prisma.match.createMany({
      data: fixtures.map((f) => ({ ...f, leagueId })),
    });
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/ligas/actions.ts
git commit -m "feat(leagues): server actions for league/team management + activate"
```

---

## Task 6: Liga List Page + Create Liga Page

**Files:**
- Create: `src/app/(app)/ligas/page.tsx`
- Create: `src/app/(app)/ligas/nueva/page.tsx`

- [ ] **Step 1: Create ligas list page**

Create `src/app/(app)/ligas/page.tsx`:
```tsx
import Link from 'next/link';
import { LeagueService } from '@/modules/leagues';
import type { LeagueStatus } from '@prisma/client';

const STATUS_LABEL: Record<LeagueStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activa',
  FINISHED: 'Finalizada',
  ARCHIVED: 'Archivada',
};

const STATUS_CLASS: Record<LeagueStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-green-100 text-green-700',
  FINISHED: 'bg-blue-100 text-blue-700',
  ARCHIVED: 'bg-gray-100 text-gray-400',
};

export default async function LigasPage() {
  const leagues = await LeagueService.list();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ligas</h1>
        <Link
          href="/ligas/nueva"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          Nueva liga
        </Link>
      </div>

      {leagues.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">No hay ligas todavía</p>
          <p className="text-sm">Crea la primera liga para empezar</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((league) => (
            <Link
              key={league.id}
              href={`/ligas/${league.slug}`}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h2 className="font-semibold text-gray-900 leading-tight">{league.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_CLASS[league.status]}`}>
                  {STATUS_LABEL[league.status]}
                </span>
              </div>
              {league.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{league.description}</p>
              )}
              <p className="text-xs text-gray-400">
                {league.startDate.toLocaleDateString('es-ES')} –{' '}
                {league.endDate.toLocaleDateString('es-ES')}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create nueva liga page**

Create `src/app/(app)/ligas/nueva/page.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { createLeagueAction } from '../actions';

const initialState = { error: undefined as string | undefined };

export default function NuevaLigaPage() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (prev: typeof initialState, formData: FormData) => {
      const result = await createLeagueAction(prev, formData);
      return result;
    },
    initialState,
  );

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nueva liga</h1>
      <form action={formAction} className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
        {state.error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {state.error}
          </div>
        )}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Nombre de la liga <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Ej: Liga Verano 2025"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Descripción
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Descripción opcional..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
              Fecha inicio <span className="text-red-500">*</span>
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
              Fecha fin <span className="text-red-500">*</span>
            </label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {pending ? 'Creando...' : 'Crear liga'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/ligas/
git commit -m "feat(leagues): liga list page + create liga form"
```

---

## Task 7: Liga Detail Page (Teams + Standings + Matches)

**Files:**
- Create: `src/app/(app)/ligas/[slug]/page.tsx`
- Create: `src/app/(app)/ligas/[slug]/equipos/nueva/page.tsx`

- [ ] **Step 1: Create liga detail page**

Create `src/app/(app)/ligas/[slug]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { LeagueService } from '@/modules/leagues';
import { calculateStandings } from '@/modules/leagues';
import { prisma } from '@/shared/db/client';
import { ActivateLeagueButton } from './activate-button';
import { AddMemberForm } from './add-member-form';
import type { MatchStatus } from '@prisma/client';

const STATUS_LABEL: Record<MatchStatus, string> = {
  SCHEDULED: 'Pendiente',
  DATE_PROPOSED: 'Fecha propuesta',
  DATE_CONFIRMED: 'Fecha confirmada',
  PENDING_VALIDATION: 'Resultado enviado',
  CONFIRMED: 'Confirmado',
  ADMIN_RESOLVED: 'Resuelto admin',
  DISPUTED: 'En disputa',
  EXPIRED_UNPLAYED: 'No jugado',
  CANCELLED: 'Cancelado',
};

const STATUS_CLASS: Record<MatchStatus, string> = {
  SCHEDULED: 'bg-gray-100 text-gray-600',
  DATE_PROPOSED: 'bg-yellow-100 text-yellow-700',
  DATE_CONFIRMED: 'bg-blue-100 text-blue-700',
  PENDING_VALIDATION: 'bg-orange-100 text-orange-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  ADMIN_RESOLVED: 'bg-purple-100 text-purple-700',
  DISPUTED: 'bg-red-100 text-red-700',
  EXPIRED_UNPLAYED: 'bg-gray-100 text-gray-400',
  CANCELLED: 'bg-gray-100 text-gray-400',
};

export default async function LigaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);

  const [currentUser, league] = await Promise.all([
    getValidatedSession(token),
    LeagueService.getBySlug(slug).catch(() => null),
  ]);
  if (!league) notFound();

  const [teams, matches] = await Promise.all([
    LeagueService.getTeams(league.id),
    LeagueService.getMatches(league.id),
  ]);

  // Standings: only from CONFIRMED matches
  const confirmedMatches = await prisma.match.findMany({
    where: { leagueId: league.id, status: 'CONFIRMED' },
    include: { confirmedResult: { include: { sets: true } } },
  });

  const teamNamesMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const standingMatches = confirmedMatches
    .filter((m) => m.confirmedResult)
    .map((m) => ({
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      winnerTeamId: m.winnerTeamId,
      sets: m.confirmedResult!.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })),
    }));

  const standings = calculateStandings(teamNamesMap, standingMatches);

  const isLeagueAdmin = await prisma.leagueMember.findFirst({
    where: { leagueId: league.id, userId: currentUser.id, role: 'LEAGUE_ADMIN' },
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{league.name}</h1>
          {league.description && <p className="text-gray-500 mt-1">{league.description}</p>}
          <p className="text-sm text-gray-400 mt-1">
            {league.startDate.toLocaleDateString('es-ES')} – {league.endDate.toLocaleDateString('es-ES')}
          </p>
        </div>
        {isLeagueAdmin && league.status === 'DRAFT' && (
          <ActivateLeagueButton leagueId={league.id} />
        )}
      </div>

      {/* Equipos */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Equipos ({teams.length})</h2>
          {isLeagueAdmin && league.status === 'DRAFT' && (
            <a
              href={`/ligas/${slug}/equipos/nueva`}
              className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Añadir equipo
            </a>
          )}
        </div>
        {teams.length === 0 ? (
          <p className="text-sm text-gray-400">No hay equipos en esta liga todavía.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <div key={team.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="font-medium text-gray-900 mb-3">{team.name}</h3>
                <ul className="space-y-1.5">
                  {team.members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium">
                        {m.user.name[0]?.toUpperCase()}
                      </span>
                      {m.user.name}
                    </li>
                  ))}
                  {team.members.length < 2 && isLeagueAdmin && league.status === 'DRAFT' && (
                    <li>
                      <AddMemberForm teamId={team.id} />
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Clasificación */}
      {standings.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Clasificación</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Equipo</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600">PJ</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600">G</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600">E</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600">P</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600">Sets</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600 font-bold">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {standings.map((entry, idx) => (
                  <tr key={entry.teamId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 font-medium">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{entry.teamName}</td>
                    <td className="px-3 py-3 text-center text-gray-600">{entry.played}</td>
                    <td className="px-3 py-3 text-center text-green-600">{entry.won}</td>
                    <td className="px-3 py-3 text-center text-gray-500">{entry.drawn}</td>
                    <td className="px-3 py-3 text-center text-red-500">{entry.lost}</td>
                    <td className="px-3 py-3 text-center text-gray-500">{entry.setsDiff > 0 ? `+${entry.setsDiff}` : entry.setsDiff}</td>
                    <td className="px-3 py-3 text-center font-bold text-gray-900">{entry.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Partidos */}
      {matches.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Partidos ({matches.length})</h2>
          <div className="space-y-2">
            {matches.map((match) => (
              <div
                key={match.id}
                className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 font-medium text-gray-900">
                  <span>{match.teamA.name}</span>
                  <span className="text-gray-400 text-xs">vs</span>
                  <span>{match.teamB.name}</span>
                </div>
                <div className="flex items-center gap-3 text-right shrink-0">
                  {match.scheduledAt && (
                    <span className="text-xs text-gray-400">
                      {match.scheduledAt.toLocaleDateString('es-ES')}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[match.status]}`}>
                    {STATUS_LABEL[match.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create ActivateLeagueButton client component**

Create `src/app/(app)/ligas/[slug]/activate-button.tsx`:
```tsx
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { activateLeagueAction } from '../actions';

export function ActivateLeagueButton({ leagueId }: { leagueId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const result = await activateLeagueAction(leagueId);
      if (result.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors whitespace-nowrap"
    >
      {isPending ? 'Activando...' : 'Activar liga'}
    </button>
  );
}
```

- [ ] **Step 3: Create AddMemberForm client component**

Create `src/app/(app)/ligas/[slug]/add-member-form.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { addTeamMemberAction } from '../actions';

const initial = { error: undefined as string | undefined };

export function AddMemberForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (prev: typeof initial, formData: FormData) => {
      const result = await addTeamMemberAction(prev, formData);
      if (!result.error) router.refresh();
      return result;
    },
    initial,
  );

  return (
    <form action={formAction} className="flex gap-1.5 mt-1">
      <input type="hidden" name="teamId" value={teamId} />
      <input
        name="userEmail"
        type="email"
        required
        placeholder="Email del jugador"
        className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="px-2 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {pending ? '...' : 'Añadir'}
      </button>
      {state.error && <p className="text-xs text-red-500 mt-1">{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Create nueva equipo page**

Create `src/app/(app)/ligas/[slug]/equipos/nueva/page.tsx`:
```tsx
'use client';

import { use, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { createTeamAction } from '../../../actions';

const initial = { error: undefined as string | undefined };

export default function NuevoEquipoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();

  const [state, formAction, pending] = useActionState(
    async (prev: typeof initial, formData: FormData) => {
      const result = await createTeamAction(prev, formData);
      if (!result.error) router.push(`/ligas/${slug}`);
      return result;
    },
    initial,
  );

  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nuevo equipo</h1>
      <form action={formAction} className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
        {/* leagueId is resolved server-side; we pass it as hidden via slug lookup in action — 
            instead, the action receives leagueId directly via a hidden field populated by the parent.
            For this page we need the leagueId, so we fetch it client-side or pass via searchParams. */}
        {/* Use a hidden field with the slug; the action will look up the league by slug */}
        <input type="hidden" name="slug" value={slug} />
        {state.error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {state.error}
          </div>
        )}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Nombre del equipo <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Ej: Los Cañones"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-60 transition-colors"
          >
            {pending ? 'Creando...' : 'Crear equipo'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

Note: The `createTeamAction` needs to accept `slug` instead of `leagueId` for this page, **or** we pass `leagueId` via a server component parent. The cleanest approach: update the nueva equipo page to be a **server component** that fetches the leagueId and passes it as a hidden field to a client form.

Replace `src/app/(app)/ligas/[slug]/equipos/nueva/page.tsx` with:
```tsx
import { notFound } from 'next/navigation';
import { LeagueService } from '@/modules/leagues';
import { NuevoEquipoForm } from './form';

export default async function NuevoEquipoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const league = await LeagueService.getBySlug(slug).catch(() => null);
  if (!league) notFound();

  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nuevo equipo</h1>
      <NuevoEquipoForm leagueId={league.id} slug={slug} />
    </div>
  );
}
```

Create `src/app/(app)/ligas/[slug]/equipos/nueva/form.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { createTeamAction } from '../../../../actions';

const initial = { error: undefined as string | undefined };

export function NuevoEquipoForm({ leagueId, slug }: { leagueId: string; slug: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (prev: typeof initial, formData: FormData) => {
      const result = await createTeamAction(prev, formData);
      if (!result.error) router.push(`/ligas/${slug}`);
      return result;
    },
    initial,
  );

  return (
    <form action={formAction} className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
      <input type="hidden" name="leagueId" value={leagueId} />
      {state.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {state.error}
        </div>
      )}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Nombre del equipo <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Ej: Los Cañones"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-60 transition-colors"
        >
          {pending ? 'Creando...' : 'Crear equipo'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 6: Build**

```bash
pnpm build
```
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(leagues): liga detail page with teams, standings table, matches list"
```

---

## Task 8: Deploy + Smoke Test

- [ ] **Step 1: Run all unit tests**

```bash
pnpm test:unit
```
Expected: all tests pass (including new fixture + standings tests).

- [ ] **Step 2: Push to GitHub (triggers Vercel auto-deploy)**

```bash
git push
```

- [ ] **Step 3: Verify deploy**

```bash
vercel logs --level error --since 10m --no-follow 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 4: Smoke test in browser**

Navigate to `https://padel-league-mu.vercel.app`:
1. Login with `falcarazlluch@gmail.com` / `Padel_league2019!`
2. Click "Ligas" in nav → should see empty ligas list
3. Click "Nueva liga" → fill form → submit → should redirect to liga detail
4. Click "Añadir equipo" → create 2 teams with 2 members each
5. Click "Activar liga" → should generate fixtures and show match list

---

## Self-Review

**Spec coverage:**
- ✅ Liga CRUD (create, list, view by slug)
- ✅ Teams creation + member management (2 members per team invariant)
- ✅ Round-robin fixture generation
- ✅ Standings algorithm with tiebreakers (points → set diff → game diff → sets won)
- ✅ Liga activation validation (≥2 teams, 2 members each)
- ✅ Tailwind CSS styling on all existing pages
- ⏳ Liga edit/archive — deferred to Plan 3
- ⏳ Match result submission — deferred to Plan 3 (Spec 3)
- ⏳ Tiebreaker config UI — deferred (advanced feature)

**Placeholder scan:** No TBDs or missing code blocks found.

**Type consistency:** `LeagueRow`, `TeamRow`, `MatchRow`, `StandingEntry` defined in Task 2 and used consistently in Tasks 5, 6, 7.
