# Spec 5: Calendario y Jornadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add round-based fixture generation, a jornadas tab in the league page, a global "Mis partidos" view with quick-action cards, and a libre date-proposal flow on the match detail page.

**Architecture:** The fixture generator is rewritten with the circle (round-robin) algorithm and a `round Int?` field is added to `Match`. A `SchedulingService` module handles propose/accept logic. The league page gets a "Partidos" tab driven by `?tab` and `?jornada` search params; a new `/partidos` route gives users a cross-league view.

**Tech Stack:** Next.js 15 App Router, Server Components, Server Actions, `useActionState`, Prisma 5, Vitest, Tailwind CSS v4

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `round Int?` to Match |
| `prisma/migrations/...` | Create | `add_match_round` migration |
| `src/modules/leagues/application/fixture-generator.ts` | Rewrite | Circle method, returns `round` |
| `src/modules/leagues/application/league-service.ts` | Modify | Connect `activateLeague` to fixtures; add `round` to `getMatches` |
| `src/modules/leagues/application/scheduling-service.ts` | Create | `proposeDate`, `acceptProposal`, `cancelProposal` |
| `src/modules/leagues/domain/types.ts` | Modify | Add `round?` to `MatchRow`; add `activeProposal` to `MatchDetailRow` |
| `src/modules/leagues/application/match-service.ts` | Modify | Include active scheduling proposal in `getMatch` |
| `src/modules/leagues/index.ts` | Modify | Export `SchedulingService` |
| `src/app/(app)/ligas/[slug]/page.tsx` | Modify | Add tabs + accept `searchParams`; delegate to `PartidosTab` |
| `src/app/(app)/ligas/[slug]/_components/partidos-tab.tsx` | Create | Jornada pills + filtered match list |
| `src/app/(app)/ligas/[slug]/_components/match-card-jornada.tsx` | Create | Color-coded match card for jornada view |
| `src/app/(app)/ligas/[slug]/partidos/[matchId]/actions.ts` | Create | `proposeDate`, `acceptProposal`, `cancelProposal` Server Actions |
| `src/app/(app)/ligas/[slug]/partidos/[matchId]/schedule-section.tsx` | Create | Client Component: date proposal form + state display |
| `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx` | Modify | Mount `ScheduleSection` above result form |
| `src/app/(app)/partidos/page.tsx` | Create | Global "Mis partidos" Server Component |
| `src/app/(app)/partidos/_components/match-card-mis-partidos.tsx` | Create | Quick-action card for global view |
| `src/app/(app)/partidos/actions.ts` | Create | `acceptProposalFromList` Server Action |
| `src/app/(app)/layout.tsx` | Modify | Add "Mis partidos" nav link |
| `tests/unit/modules/leagues/fixture-generator.test.ts` | Modify | Add round-related assertions |

---

## Task 1: Add `round` field to Match schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `round Int?` to the Match model**

Open `prisma/schema.prisma`. Find the `model Match` block. Add `round` after `isTiebreaker`:

```prisma
  isTiebreaker       Boolean      @default(false) @map("is_tiebreaker")
  round              Int?

  createdAt          DateTime     @default(now()) @map("created_at")
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_match_round
```

Expected output: `The following migration(s) have been applied: .../add_match_round/migration.sql`

- [ ] **Step 3: Verify generated SQL**

The migration file (under `prisma/migrations/`) should contain:

```sql
ALTER TABLE "matches" ADD COLUMN "round" INTEGER;
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add round field to matches"
```

---

## Task 2: Rewrite fixture generator (circle method)

**Files:**
- Modify: `src/modules/leagues/application/fixture-generator.ts`
- Modify: `tests/unit/modules/leagues/fixture-generator.test.ts`

- [ ] **Step 1: Write updated failing tests**

Replace the contents of `tests/unit/modules/leagues/fixture-generator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateFixtures } from '@/modules/leagues/application/fixture-generator';

describe('generateFixtures', () => {
  it('generates N-1 rounds for even N teams', () => {
    const teams = ['t1', 't2', 't3', 't4']; // 4 teams → 3 rounds
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(3);
  });

  it('generates N rounds for odd N teams (bye)', () => {
    const teams = ['t1', 't2', 't3']; // 3 teams → 3 rounds
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(3);
  });

  it('generates correct total match count for 4 teams', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    // 4 teams → 6 matches total (C(4,2))
    expect(matches).toHaveLength(6);
  });

  it('generates correct total match count for 3 teams', () => {
    const teams = ['t1', 't2', 't3'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    // 3 teams → 3 matches (bye matches skipped)
    expect(matches).toHaveLength(3);
  });

  it('generates correct total match count for 5 teams', () => {
    const teams = ['t1', 't2', 't3', 't4', 't5'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    // 5 teams → 10 matches (C(5,2))
    expect(matches).toHaveLength(10);
  });

  it('each pair plays exactly once', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    const pairs = matches.map((m) => [m.teamAId, m.teamBId].sort().join('-'));
    expect(new Set(pairs).size).toBe(6);
  });

  it('no team plays twice in the same round', () => {
    const teams = ['t1', 't2', 't3', 't4', 't5', 't6'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    const byRound = new Map<number, string[]>();
    for (const m of matches) {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round)!.push(m.teamAId, m.teamBId);
    }
    for (const [, teamList] of byRound) {
      expect(new Set(teamList).size).toBe(teamList.length);
    }
  });

  it('each match has deadlineAt = startDate + deadlineDays', () => {
    const startDate = new Date('2025-01-01');
    const matches = generateFixtures(['t1', 't2'], startDate, 21);
    const expected = new Date('2025-01-22'); // Jan 1 + 21 days
    expect(matches[0]!.deadlineAt.getTime()).toBe(expected.getTime());
  });

  it('no team plays itself', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    matches.forEach((m) => expect(m.teamAId).not.toBe(m.teamBId));
  });

  it('round values start at 1', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    const minRound = Math.min(...matches.map((m) => m.round));
    expect(minRound).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run --config vitest.config.ts tests/unit/modules/leagues/fixture-generator.test.ts
```

Expected: several tests FAIL because `round` doesn't exist on fixture matches yet.

- [ ] **Step 3: Rewrite the fixture generator**

Replace the entire contents of `src/modules/leagues/application/fixture-generator.ts`:

```typescript
export type FixtureMatch = {
  teamAId: string;
  teamBId: string;
  deadlineAt: Date;
  round: number;
};

function shuffle(arr: string[]): string[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function generateFixtures(
  teamIds: string[],
  leagueStartDate: Date,
  defaultDeadlineDays: number,
): FixtureMatch[] {
  if (teamIds.length < 2) return [];

  const shuffled = shuffle(teamIds);
  // Pad to even count; null represents a bye
  const teams: (string | null)[] =
    shuffled.length % 2 === 0 ? [...shuffled] : [...shuffled, null];
  const n = teams.length;
  const totalRounds = n - 1;

  const deadline = new Date(leagueStartDate);
  deadline.setDate(deadline.getDate() + defaultDeadlineDays);

  const matches: FixtureMatch[] = [];
  // Circle method: teams[0] is fixed; rotate teams[1..n-1]
  const fixed = teams[0]!; // always a real team (null appended at end for odd N)
  const rotating = teams.slice(1); // length = n-1

  for (let round = 1; round <= totalRounds; round++) {
    const circle = [fixed, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = circle[i];
      const b = circle[n - 1 - i];
      // Skip bye slots
      if (a !== null && b !== null) {
        matches.push({ teamAId: a, teamBId: b, deadlineAt: new Date(deadline), round });
      }
    }
    // Rotate: move last element of rotating to front
    rotating.unshift(rotating.pop()!);
  }

  return matches;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --config vitest.config.ts tests/unit/modules/leagues/fixture-generator.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/leagues/application/fixture-generator.ts tests/unit/modules/leagues/fixture-generator.test.ts
git commit -m "feat(fixtures): rewrite generator with circle method + round assignment"
```

---

## Task 3: Connect `activateLeague` to fixture generator

**Files:**
- Modify: `src/modules/leagues/application/league-service.ts`
- Modify: `src/modules/leagues/domain/types.ts`

- [ ] **Step 1: Add `round` to `MatchRow` type**

Open `src/modules/leagues/domain/types.ts`. Find `MatchRow`. Add `round`:

```typescript
export type MatchRow = {
  id: string;
  leagueId: string;
  teamAId: string;
  teamBId: string;
  status: MatchStatus;
  scheduledAt: Date | null;
  deadlineAt: Date;
  round: number | null;
  teamA: { id: string; name: string };
  teamB: { id: string; name: string };
};
```

- [ ] **Step 2: Update `getMatches` to include `round` in ordering**

In `src/modules/leagues/application/league-service.ts`, find `getMatches`:

```typescript
async getMatches(leagueId: string): Promise<MatchRow[]> {
  return prisma.match.findMany({
    where: { leagueId },
    include: {
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
    },
    orderBy: [{ round: 'asc' }, { deadlineAt: 'asc' }],
  });
},
```

The `round` field is automatically included by Prisma since it's in the model — no need to add it to `select`. Only `orderBy` needs to change.

- [ ] **Step 3: Rewrite `activateLeague` to generate fixtures in a transaction**

In `src/modules/leagues/application/league-service.ts`, find the import line at the top. Add the fixture generator import:

```typescript
import { generateFixtures } from './fixture-generator';
```

Then replace the `activateLeague` method body. The full replacement for lines 104–128:

```typescript
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

  await prisma.$transaction(async (tx) => {
    // Guard: skip fixture generation if matches already exist (idempotency)
    const existingCount = await tx.match.count({ where: { leagueId } });
    if (existingCount === 0) {
      const teamIds = league.teams.map((t) => t.id);
      const fixtures = generateFixtures(teamIds, league.startDate, league.defaultDeadlineDays);
      if (fixtures.length > 0) {
        await tx.match.createMany({
          data: fixtures.map((f) => ({
            leagueId,
            teamAId: f.teamAId,
            teamBId: f.teamBId,
            deadlineAt: f.deadlineAt,
            round: f.round,
          })),
        });
      }
    }
    await tx.league.update({ where: { id: leagueId }, data: { status: 'ACTIVE' } });
  });
},
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If you see "Property 'round' does not exist", run `npx prisma generate` first to regenerate the Prisma client.

- [ ] **Step 5: Run unit tests**

```bash
npx vitest run --config vitest.config.ts
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/leagues/application/league-service.ts src/modules/leagues/domain/types.ts
git commit -m "feat(leagues): generate round-robin fixtures on league activation"
```

---

## Task 4: `SchedulingService` — propose and accept dates

**Files:**
- Create: `src/modules/leagues/application/scheduling-service.ts`
- Modify: `src/modules/leagues/domain/types.ts`
- Modify: `src/modules/leagues/application/match-service.ts`
- Modify: `src/modules/leagues/index.ts`

- [ ] **Step 1: Add `activeProposal` to `MatchDetailRow` type**

In `src/modules/leagues/domain/types.ts`, update `MatchDetailRow` to add `activeProposal`:

```typescript
export type MatchDetailRow = {
  id: string;
  leagueId: string;
  leagueSlug: string;
  teamAId: string;
  teamBId: string;
  teamA: { id: string; name: string; members: { userId: string; user: { name: string } }[] };
  teamB: { id: string; name: string; members: { userId: string; user: { name: string } }[] };
  status: MatchStatus;
  scheduledAt: Date | null;
  deadlineAt: Date;
  round: number | null;
  activeProposal: {
    id: string;
    proposedByUserId: string;
    proposedDate: Date;
  } | null;
  pendingResult: {
    id: string;
    submittedByUserId: string;
    submitterSide: 'A' | 'B' | null;
    sets: { setNumber: number; gamesA: number; gamesB: number }[];
    winnerTeamId: string | null;
  } | null;
  confirmedResult: {
    sets: { setNumber: number; gamesA: number; gamesB: number }[];
    winnerTeamId: string | null;
  } | null;
};
```

- [ ] **Step 2: Update `getMatch` to include the active scheduling proposal**

In `src/modules/leagues/application/match-service.ts`, find the `prisma.match.findUnique` call inside `getMatch`. Add `schedulingProposals` to the include:

```typescript
const match = await prisma.match.findUnique({
  where: { id: matchId },
  include: {
    league: { select: { id: true, slug: true } },
    teamA: { include: { members: { include: { user: { select: { name: true } } } } } },
    teamB: { include: { members: { include: { user: { select: { name: true } } } } } },
    results: {
      where: { status: 'PENDING' },
      include: { sets: { orderBy: { setNumber: 'asc' } } },
      take: 1,
    },
    confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
    schedulingProposals: {
      where: { status: 'PROPOSED' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    },
  },
});
```

Then in the `return` block of `getMatch`, add `round` and `activeProposal` after `deadlineAt`:

```typescript
return {
  id: match.id,
  leagueId: match.leagueId,
  leagueSlug: match.league.slug,
  teamAId: match.teamAId,
  teamBId: match.teamBId,
  teamA: { ... }, // unchanged
  teamB: { ... }, // unchanged
  status: match.status,
  scheduledAt: match.scheduledAt,
  deadlineAt: match.deadlineAt,
  round: match.round,
  activeProposal: match.schedulingProposals[0]
    ? {
        id: match.schedulingProposals[0].id,
        proposedByUserId: match.schedulingProposals[0].proposedByUserId,
        proposedDate: match.schedulingProposals[0].proposedDate,
      }
    : null,
  pendingResult: ..., // unchanged
  confirmedResult: ..., // unchanged
};
```

- [ ] **Step 3: Create `SchedulingService`**

Create `src/modules/leagues/application/scheduling-service.ts`:

```typescript
import { prisma } from '@/shared/db/client';
import { NotFoundError, AuthorizationError, DomainError } from '@/shared/errors';
import { NotificationService } from '@/modules/notifications/application/notification-service';

export const SchedulingService = {
  async proposeDate(matchId: string, proposingUserId: string, proposedAt: Date): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: { select: { userId: true } } } },
        teamB: { include: { members: { select: { userId: true } } } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');

    const teamAIds = match.teamA.members.map((m) => m.userId);
    const teamBIds = match.teamB.members.map((m) => m.userId);
    const isTeamMember = teamAIds.includes(proposingUserId) || teamBIds.includes(proposingUserId);
    if (!isTeamMember) throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro de este partido.');

    const proposableStatuses = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'];
    if (!proposableStatuses.includes(match.status))
      throw new DomainError('MATCH_NOT_SCHEDULABLE', 'Este partido no admite propuestas de fecha.');

    if (proposedAt <= new Date())
      throw new DomainError('DATE_IN_PAST', 'La fecha propuesta debe ser futura.');

    await prisma.$transaction(async (tx) => {
      // Supersede any existing active proposal
      await tx.matchSchedulingProposal.updateMany({
        where: { matchId, status: 'PROPOSED' },
        data: { status: 'SUPERSEDED' },
      });
      await tx.matchSchedulingProposal.create({
        data: { matchId, proposedByUserId: proposingUserId, proposedDate: proposedAt },
      });
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'DATE_PROPOSED', scheduledAt: proposedAt },
      });
    });

    // Notify rival team members (fire-and-forget)
    const isProposerTeamA = teamAIds.includes(proposingUserId);
    const rivalIds = isProposerTeamA ? teamBIds : teamAIds;
    const rivalTeamName = isProposerTeamA ? match.teamB.name : match.teamA.name;
    const proposerTeamName = isProposerTeamA ? match.teamA.name : match.teamB.name;
    const dateStr = proposedAt.toLocaleDateString('es-ES', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

    NotificationService.createMany(
      rivalIds.map((userId) => ({
        userId,
        type: 'DATE_PROPOSED' as const,
        title: 'Nueva propuesta de fecha',
        body: `${proposerTeamName} propone jugar el ${dateStr}`,
        metadata: { matchId, rivalTeam: rivalTeamName },
      })),
    ).catch(() => {/* notification failure is non-fatal */});
  },

  async acceptProposal(matchId: string, acceptingUserId: string): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: { select: { userId: true } } } },
        teamB: { include: { members: { select: { userId: true } } } },
        schedulingProposals: {
          where: { status: 'PROPOSED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.status !== 'DATE_PROPOSED')
      throw new DomainError('NO_ACTIVE_PROPOSAL', 'No hay propuesta activa para este partido.');

    const teamAIds = match.teamA.members.map((m) => m.userId);
    const teamBIds = match.teamB.members.map((m) => m.userId);
    const isTeamMember = teamAIds.includes(acceptingUserId) || teamBIds.includes(acceptingUserId);
    if (!isTeamMember) throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro de este partido.');

    const proposal = match.schedulingProposals[0];
    if (!proposal) throw new DomainError('NO_ACTIVE_PROPOSAL', 'No hay propuesta activa.');

    // The acceptor must be from the rival team (not the proposer's team)
    const proposerOnTeamA = teamAIds.includes(proposal.proposedByUserId);
    const acceptorOnTeamA = teamAIds.includes(acceptingUserId);
    if (proposerOnTeamA === acceptorOnTeamA)
      throw new DomainError('CANNOT_ACCEPT_OWN_PROPOSAL', 'No puedes aceptar tu propia propuesta.');

    await prisma.$transaction(async (tx) => {
      await tx.matchSchedulingProposal.update({
        where: { id: proposal.id },
        data: { status: 'ACCEPTED', respondedByUserId: acceptingUserId, respondedAt: new Date() },
      });
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'DATE_CONFIRMED', scheduledAt: proposal.proposedDate },
      });
    });

    // Notify the proposing team
    const proposerIds = proposerOnTeamA ? teamAIds : teamBIds;
    const acceptorTeamName = acceptorOnTeamA ? match.teamA.name : match.teamB.name;
    const dateStr = proposal.proposedDate.toLocaleDateString('es-ES', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

    NotificationService.createMany(
      proposerIds.map((userId) => ({
        userId,
        type: 'DATE_ACCEPTED' as const,
        title: 'Fecha confirmada',
        body: `${acceptorTeamName} ha aceptado jugar el ${dateStr}`,
        metadata: { matchId },
      })),
    ).catch(() => {/* non-fatal */});
  },

  async cancelProposal(matchId: string, cancelingUserId: string): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: { select: { userId: true } } } },
        teamB: { include: { members: { select: { userId: true } } } },
        schedulingProposals: {
          where: { status: 'PROPOSED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');

    const teamAIds = match.teamA.members.map((m) => m.userId);
    const teamBIds = match.teamB.members.map((m) => m.userId);
    const isTeamMember = teamAIds.includes(cancelingUserId) || teamBIds.includes(cancelingUserId);
    if (!isTeamMember) throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro de este partido.');

    await prisma.$transaction(async (tx) => {
      await tx.matchSchedulingProposal.updateMany({
        where: { matchId, status: 'PROPOSED' },
        data: { status: 'SUPERSEDED' },
      });
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'SCHEDULED', scheduledAt: null },
      });
    });
  },
} as const;
```

- [ ] **Step 4: Export `SchedulingService` from the barrel**

In `src/modules/leagues/index.ts`, add:

```typescript
export { SchedulingService } from './application/scheduling-service';
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/leagues/application/scheduling-service.ts src/modules/leagues/application/match-service.ts src/modules/leagues/domain/types.ts src/modules/leagues/index.ts
git commit -m "feat(scheduling): SchedulingService with proposeDate/acceptProposal + MatchDetailRow update"
```

---

## Task 5: Jornadas tab in league page

**Files:**
- Create: `src/app/(app)/ligas/[slug]/_components/match-card-jornada.tsx`
- Create: `src/app/(app)/ligas/[slug]/_components/partidos-tab.tsx`
- Modify: `src/app/(app)/ligas/[slug]/page.tsx`

- [ ] **Step 1: Create `match-card-jornada.tsx`**

Create `src/app/(app)/ligas/[slug]/_components/match-card-jornada.tsx`:

```typescript
import type { Route } from 'next';
import Link from 'next/link';
import type { MatchStatus } from '@prisma/client';

type SetRow = { setNumber: number; gamesA: number; gamesB: number };

type MatchCardProps = {
  matchId: string;
  slug: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  status: MatchStatus;
  scheduledAt: Date | null;
  winnerTeamId: string | null;
  sets: SetRow[];
};

function resultColor(teamId: string, winnerTeamId: string | null, isDraw: boolean) {
  if (isDraw) return 'text-orange-600 font-bold';
  if (winnerTeamId === teamId) return 'text-green-700 font-bold';
  return 'text-red-600';
}

function cardBg(status: MatchStatus, isDraw: boolean, winnerTeamId: string | null): string {
  if (status === 'CONFIRMED' || status === 'ADMIN_RESOLVED') {
    if (isDraw) return 'bg-orange-50 border-orange-200';
    return 'bg-green-50 border-green-200';
  }
  if (status === 'SCHEDULED') return 'bg-yellow-50 border-yellow-200';
  if (status === 'DATE_PROPOSED' || status === 'DATE_CONFIRMED') return 'bg-blue-50 border-blue-200';
  return 'bg-gray-50 border-gray-200';
}

export function MatchCardJornada({
  matchId, slug, teamAId, teamBId, teamAName, teamBName,
  status, scheduledAt, winnerTeamId, sets,
}: MatchCardProps) {
  const isFinished = status === 'CONFIRMED' || status === 'ADMIN_RESOLVED';
  const setsWonA = isFinished ? sets.filter((s) => s.gamesA > s.gamesB).length : 0;
  const setsWonB = isFinished ? sets.filter((s) => s.gamesB > s.gamesA).length : 0;
  const isDraw = isFinished && setsWonA === setsWonB;

  const setsDisplay = sets.map((s) => `${s.gamesA}-${s.gamesB}`).join(' / ');

  return (
    <Link
      href={`/ligas/${slug}/partidos/${matchId}` as Route}
      className={`block rounded-lg border px-4 py-3 hover:opacity-90 transition-opacity ${cardBg(status, isDraw, winnerTeamId)}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`truncate text-sm ${isFinished ? resultColor(teamAId, winnerTeamId, isDraw) : 'text-gray-900 font-medium'}`}>
            {teamAName}
          </span>
          <span className="text-gray-400 text-xs shrink-0">vs</span>
          <span className={`truncate text-sm ${isFinished ? resultColor(teamBId, winnerTeamId, isDraw) : 'text-gray-900 font-medium'}`}>
            {teamBName}
          </span>
        </div>
        <div className="shrink-0 text-right">
          {isFinished && (
            <span className="text-xs font-medium text-gray-700">{setsDisplay}</span>
          )}
          {status === 'SCHEDULED' && (
            <span className="text-xs text-yellow-700">Sin fecha</span>
          )}
          {(status === 'DATE_PROPOSED' || status === 'DATE_CONFIRMED') && scheduledAt && (
            <span className="text-xs text-blue-700">
              {scheduledAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {status === 'EXPIRED_UNPLAYED' && (
            <span className="text-xs text-gray-400">No jugado</span>
          )}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create `partidos-tab.tsx`**

Create `src/app/(app)/ligas/[slug]/_components/partidos-tab.tsx`:

```typescript
import type { Route } from 'next';
import Link from 'next/link';
import type { MatchStatus } from '@prisma/client';
import { MatchCardJornada } from './match-card-jornada';

type MatchRow = {
  id: string;
  teamAId: string;
  teamBId: string;
  teamA: { id: string; name: string };
  teamB: { id: string; name: string };
  status: MatchStatus;
  scheduledAt: Date | null;
  deadlineAt: Date;
  round: number | null;
  winnerTeamId: string | null;
  confirmedSets: { setNumber: number; gamesA: number; gamesB: number }[];
};

const ACTIVE_STATUSES: MatchStatus[] = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'];

function defaultJornada(matches: MatchRow[], rounds: number[]): number {
  const activeRound = rounds.find((r) =>
    matches.some((m) => m.round === r && ACTIVE_STATUSES.includes(m.status)),
  );
  return activeRound ?? rounds[rounds.length - 1] ?? 1;
}

export function PartidosTab({
  slug,
  matches,
  activeJornada,
}: {
  slug: string;
  matches: MatchRow[];
  activeJornada: number | null;
}) {
  const rounds = [...new Set(matches.map((m) => m.round).filter((r): r is number => r !== null))].sort(
    (a, b) => a - b,
  );

  if (rounds.length === 0) {
    return <p className="text-sm text-gray-500">No hay partidos generados para esta liga.</p>;
  }

  const currentRound = activeJornada ?? defaultJornada(matches, rounds);
  const roundMatches = matches.filter((m) => m.round === currentRound);

  return (
    <div className="space-y-4">
      {/* Jornada pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {rounds.map((r) => (
          <Link
            key={r}
            href={`/ligas/${slug}?tab=partidos&jornada=${r}` as Route}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              r === currentRound
                ? 'bg-brand-navy text-white'
                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            J{r}
          </Link>
        ))}
      </div>

      {/* Match cards */}
      <div className="space-y-2">
        {roundMatches.length === 0 ? (
          <p className="text-sm text-gray-500">No hay partidos en esta jornada.</p>
        ) : (
          roundMatches.map((m) => (
            <MatchCardJornada
              key={m.id}
              matchId={m.id}
              slug={slug}
              teamAId={m.teamAId}
              teamBId={m.teamBId}
              teamAName={m.teamA.name}
              teamBName={m.teamB.name}
              status={m.status}
              scheduledAt={m.scheduledAt}
              winnerTeamId={m.winnerTeamId}
              sets={m.confirmedSets}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update the league page to add tab support**

In `src/app/(app)/ligas/[slug]/page.tsx`, update the function signature to accept `searchParams`:

```typescript
export default async function LigaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; jornada?: string }>;
}) {
  const { slug } = await params;
  const { tab, jornada } = await searchParams;
```

Then add these imports at the top of the file:

```typescript
import { PartidosTab } from './_components/partidos-tab';
```

At the bottom of the data-fetching section (after `const isLeagueAdmin = ...`), add:

```typescript
// Fetch confirmed sets for jornada color coding
const matchesWithSets = await prisma.match.findMany({
  where: { leagueId: league.id },
  include: {
    teamA: { select: { id: true, name: true } },
    teamB: { select: { id: true, name: true } },
    confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
  },
  orderBy: [{ round: 'asc' }, { deadlineAt: 'asc' }],
});

const matchesForJornada = matchesWithSets.map((m) => ({
  id: m.id,
  teamAId: m.teamAId,
  teamBId: m.teamBId,
  teamA: m.teamA,
  teamB: m.teamB,
  status: m.status,
  scheduledAt: m.scheduledAt,
  deadlineAt: m.deadlineAt,
  round: m.round,
  winnerTeamId: m.winnerTeamId,
  confirmedSets: m.confirmedResult?.sets ?? [],
}));
```

Replace the existing "Clasificación" + "Partidos" sections in the JSX with a tabbed layout:

```tsx
{/* Tabs: Clasificación / Partidos */}
{teams.length > 0 && (
  <section>
    <div className="flex border-b border-gray-200 mb-4">
      <Link
        href={`/ligas/${slug}?tab=clasificacion` as Route}
        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
          tab !== 'partidos'
            ? 'border-brand-navy text-brand-navy'
            : 'border-transparent text-gray-500 hover:text-gray-700'
        }`}
      >
        Clasificación
      </Link>
      <Link
        href={`/ligas/${slug}?tab=partidos` as Route}
        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
          tab === 'partidos'
            ? 'border-brand-navy text-brand-navy'
            : 'border-transparent text-gray-500 hover:text-gray-700'
        }`}
      >
        Partidos
      </Link>
    </div>

    {tab === 'partidos' ? (
      <PartidosTab
        slug={slug}
        matches={matchesForJornada}
        activeJornada={jornada ? parseInt(jornada, 10) : null}
      />
    ) : (
      /* --- existing standings table JSX here, unchanged --- */
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          {/* ... standings table, copy from existing code ... */}
        </table>
      </div>
    )}
  </section>
)}
```

> **Note:** Do NOT delete the existing standings table JSX — move it inside the `tab !== 'partidos'` branch. The old flat `{/* Partidos */}` section at the bottom can be removed since the new tab replaces it.

- [ ] **Step 4: Verify the page compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/ligas/\[slug\]/_components/ src/app/\(app\)/ligas/\[slug\]/page.tsx
git commit -m "feat(ligas): add Partidos tab with jornada pills and color-coded match cards"
```

---

## Task 6: Schedule section on match detail page

**Files:**
- Create: `src/app/(app)/ligas/[slug]/partidos/[matchId]/actions.ts`
- Create: `src/app/(app)/ligas/[slug]/partidos/[matchId]/schedule-section.tsx`
- Modify: `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx`

- [ ] **Step 1: Create Server Actions for scheduling**

Create `src/app/(app)/ligas/[slug]/partidos/[matchId]/actions.ts`:

```typescript
'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { SchedulingService } from '@/modules/leagues';

const proposeDateSchema = z.object({
  matchId: z.string().cuid(),
  slug: z.string().min(1),
  proposedAt: z
    .string()
    .min(1, 'Selecciona una fecha y hora.')
    .transform((v) => new Date(v)),
});

type ActionResult = { error: string } | { success: true };

export async function proposeDate(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };
  const user = await getValidatedSession(token).catch(() => null);
  if (!user) return { error: 'No autenticado.' };

  const parsed = proposeDateSchema.safeParse({
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
    proposedAt: formData.get('proposedAt'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await SchedulingService.proposeDate(parsed.data.matchId, user.id, parsed.data.proposedAt);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    revalidatePath('/partidos');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno.';
    return { error: message };
  }
}

const acceptSchema = z.object({
  matchId: z.string().cuid(),
  slug: z.string().min(1),
});

export async function acceptProposal(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };
  const user = await getValidatedSession(token).catch(() => null);
  if (!user) return { error: 'No autenticado.' };

  const parsed = acceptSchema.safeParse({
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
  });
  if (!parsed.success) return { error: 'Datos inválidos.' };

  try {
    await SchedulingService.acceptProposal(parsed.data.matchId, user.id);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    revalidatePath('/partidos');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno.';
    return { error: message };
  }
}

export async function cancelProposal(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };
  const user = await getValidatedSession(token).catch(() => null);
  if (!user) return { error: 'No autenticado.' };

  const parsed = acceptSchema.safeParse({
    matchId: formData.get('matchId'),
    slug: formData.get('slug'),
  });
  if (!parsed.success) return { error: 'Datos inválidos.' };

  try {
    await SchedulingService.cancelProposal(parsed.data.matchId, user.id);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    revalidatePath('/partidos');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno.';
    return { error: message };
  }
}
```

- [ ] **Step 2: Create `ScheduleSection` client component**

Create `src/app/(app)/ligas/[slug]/partidos/[matchId]/schedule-section.tsx`:

```typescript
'use client';

import { useActionState, useState } from 'react';
import { proposeDate, acceptProposal, cancelProposal } from './actions';

type Props = {
  matchId: string;
  slug: string;
  // 'none' = no proposal, 'mine' = I proposed, 'rival' = rival proposed
  proposalState: 'none' | 'mine' | 'rival';
  proposedDate: Date | null;
  isTeamMember: boolean;
};

const SCHEDULABLE = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'];

export function ScheduleSection({ matchId, slug, proposalState, proposedDate, isTeamMember }: Props) {
  const [showForm, setShowForm] = useState(proposalState === 'none');
  const [proposeState, proposeAction, proposePending] = useActionState(proposeDate, null);
  const [acceptState, acceptAction, acceptPending] = useActionState(acceptProposal, null);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelProposal, null);

  if (!isTeamMember) return null;

  const dateStr = proposedDate
    ? proposedDate.toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      })
    : null;

  // Success: collapse form
  if (proposeState && 'success' in proposeState) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <p className="text-sm text-blue-700 font-medium">✅ Propuesta enviada. Esperando respuesta del rival.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="font-semibold text-gray-900">📅 Programar partido</h3>

      {/* Rival proposed — show accept / counter */}
      {proposalState === 'rival' && !showForm && (
        <div className="space-y-3">
          <p className="text-sm text-blue-700">
            📬 El rival propone: <strong>{dateStr}</strong>
          </p>
          {acceptState && 'error' in acceptState && (
            <p className="text-sm text-red-600">{acceptState.error}</p>
          )}
          <div className="flex gap-3">
            <form action={acceptAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="slug" value={slug} />
              <button
                type="submit"
                disabled={acceptPending}
                className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {acceptPending ? 'Confirmando...' : '✓ Confirmar fecha'}
              </button>
            </form>
            <button
              onClick={() => setShowForm(true)}
              className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
            >
              Proponer otra fecha
            </button>
          </div>
        </div>
      )}

      {/* I proposed — waiting */}
      {proposalState === 'mine' && !showForm && (
        <div className="space-y-3">
          <p className="text-sm text-orange-700">
            ⏳ Propuesta enviada: <strong>{dateStr}</strong> — esperando al rival.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
            >
              Cambiar propuesta
            </button>
            <form action={cancelAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="slug" value={slug} />
              <button
                type="submit"
                disabled={cancelPending}
                className="text-red-600 text-sm hover:underline"
              >
                {cancelPending ? 'Retirando...' : 'Retirar propuesta'}
              </button>
            </form>
          </div>
          {cancelState && 'error' in cancelState && (
            <p className="text-sm text-red-600">{cancelState.error}</p>
          )}
        </div>
      )}

      {/* Propose date form */}
      {showForm && (
        <form action={proposeAction} className="space-y-3">
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="slug" value={slug} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha y hora propuesta
            </label>
            <input
              type="datetime-local"
              name="proposedAt"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          {proposeState && 'error' in proposeState && (
            <p className="text-sm text-red-600">{proposeState.error}</p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={proposePending}
              className="bg-brand-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand-navy-light disabled:opacity-50"
            >
              {proposePending ? 'Enviando...' : 'Proponer fecha'}
            </button>
            {proposalState !== 'none' && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mount `ScheduleSection` in the match detail page**

In `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx`, add the import at the top:

```typescript
import { ScheduleSection } from './schedule-section';
```

After computing `isTeamMember` and `canSubmit`, add:

```typescript
const SCHEDULABLE_STATUSES = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'];
const isSchedulable = SCHEDULABLE_STATUSES.includes(match.status);

let proposalState: 'none' | 'mine' | 'rival' = 'none';
if (match.activeProposal) {
  const proposerOnTeamA = match.teamA.members.some(
    (m) => m.userId === match.activeProposal!.proposedByUserId,
  );
  const currentUserOnTeamA = currentUserSide === 'A';
  proposalState = proposerOnTeamA === currentUserOnTeamA ? 'mine' : 'rival';
}
```

Then in the JSX, before the `{canSubmit && <SubmitResultForm ...>}` block, add:

```tsx
{/* Scheduling section — shown for all schedulable statuses when user is a team member */}
{isSchedulable && (
  <ScheduleSection
    matchId={match.id}
    slug={slug}
    proposalState={proposalState}
    proposedDate={match.activeProposal?.proposedDate ?? null}
    isTeamMember={isTeamMember}
  />
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/ligas/\[slug\]/partidos/\[matchId\]/
git commit -m "feat(match): scheduling section with propose/accept/cancel date flow"
```

---

## Task 7: Global "Mis partidos" page

**Files:**
- Create: `src/app/(app)/partidos/page.tsx`
- Create: `src/app/(app)/partidos/_components/match-card-mis-partidos.tsx`
- Create: `src/app/(app)/partidos/actions.ts`

- [ ] **Step 1: Create inline accept action**

Create `src/app/(app)/partidos/actions.ts`:

```typescript
'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { SchedulingService } from '@/modules/leagues';

const acceptSchema = z.object({
  matchId: z.string().cuid(),
});

type ActionResult = { error: string } | { success: true };

export async function acceptProposalFromList(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };
  const user = await getValidatedSession(token).catch(() => null);
  if (!user) return { error: 'No autenticado.' };

  const parsed = acceptSchema.safeParse({ matchId: formData.get('matchId') });
  if (!parsed.success) return { error: 'Datos inválidos.' };

  try {
    await SchedulingService.acceptProposal(parsed.data.matchId, user.id);
    revalidatePath('/partidos');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno.';
    return { error: message };
  }
}
```

- [ ] **Step 2: Create quick-action match card**

Create `src/app/(app)/partidos/_components/match-card-mis-partidos.tsx`:

```typescript
'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useActionState } from 'react';
import type { MatchStatus } from '@prisma/client';
import { acceptProposalFromList } from '../actions';

type Props = {
  matchId: string;
  leagueSlug: string;
  leagueName: string;
  teamAName: string;
  teamBName: string;
  status: MatchStatus;
  scheduledAt: Date | null;
  deadlineAt: Date;
  proposalState: 'none' | 'mine' | 'rival';
  proposedDate: Date | null;
  winnerTeamId: string | null;
  teamAId: string;
  teamBId: string;
  currentUserTeamId: string;
};

function cardStyle(status: MatchStatus, proposalState: 'none' | 'mine' | 'rival'): string {
  if (status === 'CONFIRMED' || status === 'ADMIN_RESOLVED')
    return 'bg-green-50 border-green-200';
  if (status === 'DATE_PROPOSED' || status === 'DATE_CONFIRMED')
    return proposalState === 'rival' ? 'bg-blue-50 border-blue-300' : 'bg-blue-50 border-blue-200';
  if (status === 'SCHEDULED') return 'bg-yellow-50 border-yellow-200';
  return 'bg-gray-50 border-gray-200';
}

export function MatchCardMisPartidos({
  matchId, leagueSlug, leagueName, teamAName, teamBName,
  status, scheduledAt, deadlineAt, proposalState, proposedDate,
  winnerTeamId, teamAId, teamBId, currentUserTeamId,
}: Props) {
  const [acceptResult, acceptAction, acceptPending] = useActionState(acceptProposalFromList, null);

  const isFinished = status === 'CONFIRMED' || status === 'ADMIN_RESOLVED';
  const matchHref = `/ligas/${leagueSlug}/partidos/${matchId}` as Route;

  const dateStr = proposedDate
    ? proposedDate.toLocaleDateString('es-ES', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : scheduledAt
    ? scheduledAt.toLocaleDateString('es-ES', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : null;

  const daysToDeadline = Math.ceil((deadlineAt.getTime() - Date.now()) / 86_400_000);

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${cardStyle(status, proposalState)}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <Link href={matchHref} className="font-medium text-gray-900 text-sm hover:underline">
          {teamAName} <span className="text-gray-400 font-normal">vs</span> {teamBName}
        </Link>
        <span className="text-xs text-gray-400 shrink-0">{leagueName}</span>
      </div>

      {/* Status line */}
      {status === 'SCHEDULED' && (
        <p className="text-xs text-yellow-700">
          ⚠️ Sin fecha · vence en {daysToDeadline} día{daysToDeadline !== 1 ? 's' : ''}
        </p>
      )}
      {status === 'DATE_PROPOSED' && proposalState === 'rival' && (
        <p className="text-xs text-blue-700">📬 Rival propone: {dateStr}</p>
      )}
      {status === 'DATE_PROPOSED' && proposalState === 'mine' && (
        <p className="text-xs text-orange-700">⏳ Tu propuesta: {dateStr} — esperando al rival</p>
      )}
      {status === 'DATE_CONFIRMED' && (
        <p className="text-xs text-blue-700">✅ Programado: {dateStr}</p>
      )}
      {isFinished && (
        <p className="text-xs text-green-700 font-medium">
          {winnerTeamId
            ? `Ganador: ${winnerTeamId === teamAId ? teamAName : teamBName}`
            : 'Empate'}
        </p>
      )}

      {/* Actions */}
      {status === 'SCHEDULED' && (
        <Link
          href={matchHref}
          className="inline-block bg-brand-yellow text-brand-navy text-xs font-bold rounded px-3 py-1 hover:opacity-90"
        >
          + Proponer fecha
        </Link>
      )}

      {status === 'DATE_PROPOSED' && proposalState === 'rival' && (
        <div className="flex gap-2 items-center">
          <form action={acceptAction}>
            <input type="hidden" name="matchId" value={matchId} />
            <button
              type="submit"
              disabled={acceptPending}
              className="bg-green-600 text-white text-xs font-bold rounded px-3 py-1 hover:bg-green-700 disabled:opacity-50"
            >
              {acceptPending ? '...' : '✓ Aceptar'}
            </button>
          </form>
          <Link
            href={matchHref}
            className="border border-gray-300 text-gray-600 text-xs rounded px-3 py-1 hover:bg-white"
          >
            Otra fecha
          </Link>
          {acceptResult && 'error' in acceptResult && (
            <span className="text-xs text-red-600">{acceptResult.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the "Mis partidos" page**

Create `src/app/(app)/partidos/page.tsx`:

```typescript
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { MatchCardMisPartidos } from './_components/match-card-mis-partidos';

export const metadata = { title: 'Mis partidos — Padel League' };

export default async function MisPartidosPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token).catch(() => redirect('/login' as Route));

  const matches = await prisma.match.findMany({
    where: {
      status: { notIn: ['CANCELLED'] },
      OR: [
        { teamA: { members: { some: { userId: user.id } } } },
        { teamB: { members: { some: { userId: user.id } } } },
      ],
    },
    include: {
      league: { select: { id: true, name: true, slug: true } },
      teamA: { include: { members: { select: { userId: true } } } },
      teamB: { include: { members: { select: { userId: true } } } },
      confirmedResult: true,
      schedulingProposals: {
        where: { status: 'PROPOSED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { deadlineAt: 'asc' },
  });

  // Separate active from finished
  const FINISHED = ['CONFIRMED', 'ADMIN_RESOLVED', 'EXPIRED_UNPLAYED'];
  const activeMatches = matches.filter((m) => !FINISHED.includes(m.status));
  const finishedMatches = matches.filter((m) => FINISHED.includes(m.status));

  function buildCardProps(m: (typeof matches)[number]) {
    const teamAIds = m.teamA.members.map((tm) => tm.userId);
    const teamBIds = m.teamB.members.map((tm) => tm.userId);
    const currentUserTeamId = teamAIds.includes(user.id) ? m.teamAId : m.teamBId;

    let proposalState: 'none' | 'mine' | 'rival' = 'none';
    let proposedDate: Date | null = null;
    const proposal = m.schedulingProposals[0];
    if (proposal) {
      proposedDate = proposal.proposedDate;
      const proposerOnTeamA = teamAIds.includes(proposal.proposedByUserId);
      const userOnTeamA = teamAIds.includes(user.id);
      proposalState = proposerOnTeamA === userOnTeamA ? 'mine' : 'rival';
    }

    return {
      matchId: m.id,
      leagueSlug: m.league.slug,
      leagueName: m.league.name,
      teamAName: m.teamA.name,
      teamBName: m.teamB.name,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      status: m.status,
      scheduledAt: m.scheduledAt,
      deadlineAt: m.deadlineAt,
      proposalState,
      proposedDate,
      winnerTeamId: m.winnerTeamId,
      currentUserTeamId,
    };
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mis partidos</h1>

      {matches.length === 0 && (
        <p className="text-gray-500 text-sm">No tienes partidos asignados todavía.</p>
      )}

      {activeMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Pendientes</h2>
          {activeMatches.map((m) => (
            <MatchCardMisPartidos key={m.id} {...buildCardProps(m)} />
          ))}
        </section>
      )}

      {finishedMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Jugados</h2>
          {finishedMatches.map((m) => (
            <MatchCardMisPartidos key={m.id} {...buildCardProps(m)} />
          ))}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/partidos/
git commit -m "feat(partidos): global Mis partidos view with quick-action cards"
```

---

## Task 8: Add "Mis partidos" nav link

**Files:**
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Add nav link**

In `src/app/(app)/layout.tsx`, find the navigation links section (the `<nav>` or links list). Add "Mis partidos" between "Dashboard" and "Ligas" (or wherever the other nav links are):

```tsx
<Link
  href="/partidos"
  className="text-white/80 hover:text-white text-sm font-medium transition-colors"
>
  Mis partidos
</Link>
```

- [ ] **Step 2: Verify TypeScript compiles and run full test suite**

```bash
npx tsc --noEmit && npx vitest run --config vitest.config.ts
```

Expected: no errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/layout.tsx
git commit -m "feat(nav): add Mis partidos link to main navigation"
```

---

## Self-Check Before Marking Done

After all tasks are complete, run:

```bash
npx tsc --noEmit
npx vitest run --config vitest.config.ts
npx next build
```

All three must succeed without errors before this plan is considered complete.
