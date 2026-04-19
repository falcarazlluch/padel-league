# Match Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow league players to submit match results (set scores), have the opposing team confirm or dispute them, and have standings update automatically upon confirmation.

**Architecture:** Pure business logic extracted into `match-result-logic.ts` (unit-testable, no DB), a `MatchService` that orchestrates DB operations, server actions wiring the HTTP layer, and a match detail page at `/ligas/[slug]/partidos/[matchId]` with client components for interactive flows. No schema migrations needed — `MatchResult`, `Set`, and `Dispute` models already exist.

**Tech Stack:** Next.js 15 App Router, Server Components, Server Actions, `useActionState` (React 19), `useTransition`, Prisma 5, Zod v4, Tailwind CSS v4, Vitest.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/modules/leagues/application/match-result-logic.ts` | Create | Pure functions: `determineWinner`, `getSubmitterSide` |
| `src/modules/leagues/domain/types.ts` | Modify | Add `SubmitResultInput`, `MatchDetailRow` |
| `src/modules/leagues/application/match-service.ts` | Create | `getMatch`, `submitResult`, `confirmResult`, `disputeResult` |
| `src/modules/leagues/index.ts` | Modify | Export `MatchService` |
| `src/app/(app)/ligas/[slug]/partidos/actions.ts` | Create | Server actions: submit/confirm/dispute |
| `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx` | Create | Match detail server component |
| `src/app/(app)/ligas/[slug]/partidos/[matchId]/submit-result-form.tsx` | Create | Client: dynamic set-score form |
| `src/app/(app)/ligas/[slug]/partidos/[matchId]/confirm-reject-panel.tsx` | Create | Client: confirm / dispute buttons |
| `src/app/(app)/ligas/[slug]/page.tsx` | Modify | Make match rows clickable links |
| `tests/unit/modules/leagues/match-result-logic.test.ts` | Create | Unit tests for pure logic |

---

## Task 1: Pure logic functions + new types

**Files:**
- Create: `src/modules/leagues/application/match-result-logic.ts`
- Modify: `src/modules/leagues/domain/types.ts`
- Create: `tests/unit/modules/leagues/match-result-logic.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/modules/leagues/match-result-logic.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { determineWinner, getSubmitterSide } from '@/modules/leagues/application/match-result-logic';

describe('determineWinner', () => {
  it('returns teamAId when A wins more sets', () => {
    const result = determineWinner('tA', 'tB', [
      { gamesA: 6, gamesB: 3 },
      { gamesA: 6, gamesB: 2 },
    ]);
    expect(result).toBe('tA');
  });

  it('returns teamBId when B wins more sets', () => {
    const result = determineWinner('tA', 'tB', [
      { gamesA: 3, gamesB: 6 },
      { gamesA: 2, gamesB: 6 },
    ]);
    expect(result).toBe('tB');
  });

  it('returns null when sets are tied', () => {
    const result = determineWinner('tA', 'tB', [
      { gamesA: 6, gamesB: 3 },
      { gamesA: 3, gamesB: 6 },
    ]);
    expect(result).toBeNull();
  });

  it('handles best-of-3 with 2-1 result for A', () => {
    const result = determineWinner('tA', 'tB', [
      { gamesA: 6, gamesB: 3 },
      { gamesA: 3, gamesB: 6 },
      { gamesA: 6, gamesB: 4 },
    ]);
    expect(result).toBe('tA');
  });
});

describe('getSubmitterSide', () => {
  it('returns A when userId is in teamA members', () => {
    expect(getSubmitterSide('u1', ['u1', 'u2'], ['u3', 'u4'])).toBe('A');
  });

  it('returns B when userId is in teamB members', () => {
    expect(getSubmitterSide('u3', ['u1', 'u2'], ['u3', 'u4'])).toBe('B');
  });

  it('returns null when userId is in neither team', () => {
    expect(getSubmitterSide('u99', ['u1', 'u2'], ['u3', 'u4'])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test:unit -- --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '@/modules/leagues/application/match-result-logic'`

- [ ] **Step 3: Create the pure logic file**

Create `src/modules/leagues/application/match-result-logic.ts`:

```typescript
export function determineWinner(
  teamAId: string,
  teamBId: string,
  sets: { gamesA: number; gamesB: number }[],
): string | null {
  const setsWonA = sets.filter((s) => s.gamesA > s.gamesB).length;
  const setsWonB = sets.filter((s) => s.gamesB > s.gamesA).length;
  if (setsWonA > setsWonB) return teamAId;
  if (setsWonB > setsWonA) return teamBId;
  return null;
}

export function getSubmitterSide(
  userId: string,
  teamAMemberIds: string[],
  teamBMemberIds: string[],
): 'A' | 'B' | null {
  if (teamAMemberIds.includes(userId)) return 'A';
  if (teamBMemberIds.includes(userId)) return 'B';
  return null;
}
```

- [ ] **Step 4: Add types to `src/modules/leagues/domain/types.ts`**

Append to the end of the file (after the existing `CreateTeamInput` type):

```typescript
export type SubmitResultInput = {
  sets: { gamesA: number; gamesB: number }[];
};

export type MatchDetailRow = {
  id: string;
  leagueId: string;
  leagueSlug: string;
  teamAId: string;
  teamBId: string;
  teamA: { id: string; name: string; members: { userId: string; user: { name: string } }[] };
  teamB: { id: string; name: string; members: { userId: string; user: { name: string } }[] };
  status: import('@prisma/client').MatchStatus;
  scheduledAt: Date | null;
  deadlineAt: Date;
  pendingResult: {
    id: string;
    submittedByUserId: string;
    submitterSide: 'A' | 'B';
    sets: { setNumber: number; gamesA: number; gamesB: number }[];
    winnerTeamId: string | null;
  } | null;
  confirmedResult: {
    sets: { setNumber: number; gamesA: number; gamesB: number }[];
    winnerTeamId: string | null;
  } | null;
};
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm test:unit -- --reporter=verbose 2>&1 | tail -20
```

Expected: PASS — all 7 tests in `match-result-logic.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/modules/leagues/application/match-result-logic.ts src/modules/leagues/domain/types.ts tests/unit/modules/leagues/match-result-logic.test.ts
git commit -m "feat(matches): pure match-result logic + SubmitResultInput / MatchDetailRow types"
```

---

## Task 2: MatchService

**Files:**
- Create: `src/modules/leagues/application/match-service.ts`
- Modify: `src/modules/leagues/index.ts`

- [ ] **Step 1: Create `src/modules/leagues/application/match-service.ts`**

```typescript
import { prisma } from '@/shared/db/client';
import { NotFoundError, AuthorizationError, DomainError } from '@/shared/errors';
import { determineWinner, getSubmitterSide } from './match-result-logic';
import type { SubmitResultInput, MatchDetailRow } from '../domain/types';

const SUBMITTABLE_STATUSES = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'] as const;
type SubmittableStatus = (typeof SUBMITTABLE_STATUSES)[number];

export const MatchService = {
  async getMatch(matchId: string): Promise<MatchDetailRow> {
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
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');

    const pendingResult = match.results[0] ?? null;
    const submitterSide = pendingResult
      ? (getSubmitterSide(
          pendingResult.submittedByUserId,
          match.teamA.members.map((m) => m.userId),
          match.teamB.members.map((m) => m.userId),
        ) ?? 'A')
      : 'A';

    return {
      id: match.id,
      leagueId: match.leagueId,
      leagueSlug: match.league.slug,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      teamA: {
        id: match.teamA.id,
        name: match.teamA.name,
        members: match.teamA.members.map((m) => ({
          userId: m.userId,
          user: { name: m.user.name },
        })),
      },
      teamB: {
        id: match.teamB.id,
        name: match.teamB.name,
        members: match.teamB.members.map((m) => ({
          userId: m.userId,
          user: { name: m.user.name },
        })),
      },
      status: match.status,
      scheduledAt: match.scheduledAt,
      deadlineAt: match.deadlineAt,
      pendingResult: pendingResult
        ? {
            id: pendingResult.id,
            submittedByUserId: pendingResult.submittedByUserId,
            submitterSide,
            sets: pendingResult.sets,
            winnerTeamId: pendingResult.winnerTeamId,
          }
        : null,
      confirmedResult: match.confirmedResult
        ? {
            sets: match.confirmedResult.sets,
            winnerTeamId: match.confirmedResult.winnerTeamId,
          }
        : null,
    };
  },

  async submitResult(
    matchId: string,
    submittingUserId: string,
    input: SubmitResultInput,
  ): Promise<void> {
    if (input.sets.length < 2)
      throw new DomainError('INVALID_SETS', 'Debe registrar al menos 2 sets.');
    if (input.sets.length > 5)
      throw new DomainError('INVALID_SETS', 'No puede registrar más de 5 sets.');

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: true } },
        teamB: { include: { members: true } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (!SUBMITTABLE_STATUSES.includes(match.status as SubmittableStatus)) {
      throw new DomainError(
        'MATCH_NOT_SUBMITTABLE',
        'Este partido no admite resultados en su estado actual.',
      );
    }

    const side = getSubmitterSide(
      submittingUserId,
      match.teamA.members.map((m) => m.userId),
      match.teamB.members.map((m) => m.userId),
    );
    if (!side)
      throw new AuthorizationError(
        'NOT_TEAM_MEMBER',
        'Solo los jugadores de este partido pueden enviar resultados.',
      );

    const winnerTeamId = determineWinner(match.teamAId, match.teamBId, input.sets);

    await prisma.$transaction(async (tx) => {
      await tx.matchResult.updateMany({
        where: { matchId, status: 'PENDING' },
        data: { status: 'SUPERSEDED' },
      });

      await tx.matchResult.create({
        data: {
          matchId,
          submittedByUserId: submittingUserId,
          winnerTeamId,
          sets: {
            create: input.sets.map((s, i) => ({
              setNumber: i + 1,
              gamesA: s.gamesA,
              gamesB: s.gamesB,
            })),
          },
        },
      });

      await tx.match.update({
        where: { id: matchId },
        data: { status: 'PENDING_VALIDATION' },
      });
    });
  },

  async confirmResult(matchId: string, confirmingUserId: string): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: true } },
        teamB: { include: { members: true } },
        results: { where: { status: 'PENDING' }, take: 1 },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.status !== 'PENDING_VALIDATION')
      throw new DomainError(
        'MATCH_NOT_PENDING',
        'Este partido no tiene un resultado pendiente de validación.',
      );

    const pendingResult = match.results[0];
    if (!pendingResult)
      throw new DomainError('NO_PENDING_RESULT', 'No hay resultado pendiente.');

    const teamAIds = match.teamA.members.map((m) => m.userId);
    const teamBIds = match.teamB.members.map((m) => m.userId);
    const submitterSide = getSubmitterSide(pendingResult.submittedByUserId, teamAIds, teamBIds);
    const confirmerSide = getSubmitterSide(confirmingUserId, teamAIds, teamBIds);

    if (!confirmerSide)
      throw new AuthorizationError(
        'NOT_TEAM_MEMBER',
        'Solo los jugadores de este partido pueden confirmar resultados.',
      );
    if (confirmerSide === submitterSide)
      throw new DomainError(
        'SAME_TEAM_CONFIRM',
        'No puedes confirmar el resultado enviado por tu propio equipo.',
      );

    await prisma.$transaction(async (tx) => {
      await tx.matchResult.update({
        where: { id: pendingResult.id },
        data: {
          status: 'CONFIRMED',
          validatedByUserId: confirmingUserId,
          validatedAt: new Date(),
        },
      });

      await tx.match.update({
        where: { id: matchId },
        data: {
          status: 'CONFIRMED',
          confirmedResultId: pendingResult.id,
          winnerTeamId: pendingResult.winnerTeamId,
        },
      });
    });
  },

  async disputeResult(
    matchId: string,
    disputingUserId: string,
    reason: string,
  ): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: true } },
        teamB: { include: { members: true } },
        results: {
          where: { status: 'PENDING' },
          include: { sets: true },
          take: 1,
        },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.status !== 'PENDING_VALIDATION')
      throw new DomainError(
        'MATCH_NOT_PENDING',
        'Este partido no tiene un resultado pendiente de validación.',
      );

    const pendingResult = match.results[0];
    if (!pendingResult)
      throw new DomainError('NO_PENDING_RESULT', 'No hay resultado pendiente.');

    const teamAIds = match.teamA.members.map((m) => m.userId);
    const teamBIds = match.teamB.members.map((m) => m.userId);
    const submitterSide = getSubmitterSide(pendingResult.submittedByUserId, teamAIds, teamBIds);
    const disputerSide = getSubmitterSide(disputingUserId, teamAIds, teamBIds);

    if (!disputerSide)
      throw new AuthorizationError(
        'NOT_TEAM_MEMBER',
        'Solo los jugadores de este partido pueden disputar resultados.',
      );
    if (disputerSide === submitterSide)
      throw new DomainError(
        'SAME_TEAM_DISPUTE',
        'No puedes disputar el resultado enviado por tu propio equipo.',
      );

    await prisma.$transaction(async (tx) => {
      await tx.matchResult.update({
        where: { id: pendingResult.id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          rejectedAt: new Date(),
        },
      });

      await tx.match.update({
        where: { id: matchId },
        data: { status: 'DISPUTED' },
      });

      await tx.dispute.create({
        data: {
          matchId,
          openedByUserId: disputingUserId,
          reason,
          evidenceSnapshot: {
            submittedByUserId: pendingResult.submittedByUserId,
            winnerTeamId: pendingResult.winnerTeamId,
            sets: pendingResult.sets.map((s) => ({
              setNumber: s.setNumber,
              gamesA: s.gamesA,
              gamesB: s.gamesB,
            })),
          },
        },
      });
    });
  },
} as const;
```

- [ ] **Step 2: Export MatchService from `src/modules/leagues/index.ts`**

Replace the entire file with:

```typescript
export { LeagueService } from './application/league-service';
export { MatchService } from './application/match-service';
export { generateFixtures } from './application/fixture-generator';
export { calculateStandings } from './application/standings-calculator';
export type {
  LeagueRow,
  TeamRow,
  MatchRow,
  MatchDetailRow,
  StandingEntry,
  CreateLeagueInput,
  CreateTeamInput,
  SubmitResultInput,
} from './domain/types';
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/leagues/application/match-service.ts src/modules/leagues/index.ts
git commit -m "feat(matches): MatchService — getMatch, submitResult, confirmResult, disputeResult"
```

---

## Task 3: Server actions

**Files:**
- Create: `src/app/(app)/ligas/[slug]/partidos/actions.ts`

- [ ] **Step 1: Create `src/app/(app)/ligas/[slug]/partidos/actions.ts`**

```typescript
'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchService } from '@/modules/leagues';
import { isUserFacingError } from '@/shared/errors';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

const submitResultSchema = z.object({
  matchId: z.string().cuid(),
  setsCount: z.coerce.number().int().min(2).max(5),
});

export async function submitResultAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();

  const base = submitResultSchema.safeParse(Object.fromEntries(formData));
  if (!base.success) return { error: base.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { matchId, setsCount } = base.data;
  const sets = Array.from({ length: setsCount }, (_, i) => ({
    gamesA: Number(formData.get(`gamesA_${i}`) ?? ''),
    gamesB: Number(formData.get(`gamesB_${i}`) ?? ''),
  }));

  const setsValid = sets.every(
    (s) => Number.isInteger(s.gamesA) && Number.isInteger(s.gamesB) && s.gamesA >= 0 && s.gamesB >= 0,
  );
  if (!setsValid) return { error: 'Los marcadores de los sets son inválidos.' };

  try {
    await MatchService.submitResult(matchId, user.id, { sets });
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function confirmResultAction(matchId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await MatchService.confirmResult(matchId, user.id);
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const disputeSchema = z.object({
  matchId: z.string().cuid(),
  reason: z.string().min(10, 'El motivo debe tener al menos 10 caracteres.').max(1000),
});

export async function disputeResultAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();
  const parsed = disputeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await MatchService.disputeResult(parsed.data.matchId, user.id, parsed.data.reason);
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/ligas/\[slug\]/partidos/actions.ts
git commit -m "feat(matches): server actions — submitResult, confirmResult, disputeResult"
```

---

## Task 4: SubmitResultForm client component

**Files:**
- Create: `src/app/(app)/ligas/[slug]/partidos/[matchId]/submit-result-form.tsx`

- [ ] **Step 1: Create `src/app/(app)/ligas/[slug]/partidos/[matchId]/submit-result-form.tsx`**

```tsx
'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitResultAction } from '../../actions';

type SetRow = { gamesA: string; gamesB: string };
type State = { error?: string };

export function SubmitResultForm({
  matchId,
  teamAName,
  teamBName,
}: {
  matchId: string;
  teamAName: string;
  teamBName: string;
}) {
  const router = useRouter();
  const [sets, setSets] = useState<SetRow[]>([
    { gamesA: '', gamesB: '' },
    { gamesA: '', gamesB: '' },
  ]);

  const [state, formAction, pending] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const result = await submitResultAction(_prev, formData);
      if (!result.error) router.refresh();
      return result;
    },
    {},
  );

  function addSet() {
    if (sets.length < 5) setSets((prev) => [...prev, { gamesA: '', gamesB: '' }]);
  }

  function removeSet() {
    if (sets.length > 2) setSets((prev) => prev.slice(0, -1));
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 mb-4">Registrar resultado</h3>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="setsCount" value={sets.length} />

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-xs font-medium text-gray-500 text-center">
            <span>{teamAName}</span>
            <span />
            <span>{teamBName}</span>
          </div>
          {sets.map((set, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <input
                name={`gamesA_${i}`}
                type="number"
                min={0}
                max={9}
                required
                value={set.gamesA}
                onChange={(e) =>
                  setSets((prev) => prev.map((s, j) => (j === i ? { ...s, gamesA: e.target.value } : s)))
                }
                className="w-full text-center px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400 font-medium">Set {i + 1}</span>
              <input
                name={`gamesB_${i}`}
                type="number"
                min={0}
                max={9}
                required
                value={set.gamesB}
                onChange={(e) =>
                  setSets((prev) => prev.map((s, j) => (j === i ? { ...s, gamesB: e.target.value } : s)))
                }
                className="w-full text-center px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          {sets.length < 5 && (
            <button
              type="button"
              onClick={addSet}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              + Set
            </button>
          )}
          {sets.length > 2 && (
            <button
              type="button"
              onClick={removeSet}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              − Quitar set
            </button>
          )}
        </div>

        {state.error && (
          <p className="text-sm text-red-500">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {pending ? 'Enviando...' : 'Enviar resultado'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/ligas/\[slug\]/partidos/\[matchId\]/submit-result-form.tsx
git commit -m "feat(matches): SubmitResultForm client component with dynamic set rows"
```

---

## Task 5: ConfirmRejectPanel client component

**Files:**
- Create: `src/app/(app)/ligas/[slug]/partidos/[matchId]/confirm-reject-panel.tsx`

- [ ] **Step 1: Create `src/app/(app)/ligas/[slug]/partidos/[matchId]/confirm-reject-panel.tsx`**

```tsx
'use client';

import { useActionState, useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmResultAction, disputeResultAction } from '../../actions';

type State = { error?: string };

export function ConfirmRejectPanel({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isPendingConfirm, startConfirmTransition] = useTransition();

  const [disputeState, disputeAction, disputePending] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const result = await disputeResultAction(_prev, formData);
      if (!result.error) router.refresh();
      return result;
    },
    {},
  );

  function handleConfirm() {
    startConfirmTransition(async () => {
      const result = await confirmResultAction(matchId);
      if (result.error) {
        setConfirmError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {confirmError && <p className="text-sm text-red-500">{confirmError}</p>}

      {!showDisputeForm && (
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={isPendingConfirm}
            className="flex-1 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            {isPendingConfirm ? 'Confirmando...' : 'Confirmar resultado'}
          </button>
          <button
            onClick={() => setShowDisputeForm(true)}
            className="flex-1 py-2.5 bg-red-50 text-red-700 border border-red-200 text-sm font-semibold rounded-lg hover:bg-red-100 transition-colors"
          >
            Disputar
          </button>
        </div>
      )}

      {showDisputeForm && (
        <form action={disputeAction} className="space-y-3">
          <input type="hidden" name="matchId" value={matchId} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo de la disputa
            </label>
            <textarea
              name="reason"
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              placeholder="Describe el problema con el resultado enviado..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
          </div>
          {disputeState.error && (
            <p className="text-sm text-red-500">{disputeState.error}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowDisputeForm(false)}
              className="flex-1 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={disputePending}
              className="flex-1 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {disputePending ? 'Enviando...' : 'Enviar disputa'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/ligas/\[slug\]/partidos/\[matchId\]/confirm-reject-panel.tsx
git commit -m "feat(matches): ConfirmRejectPanel client component with dispute form"
```

---

## Task 6: Match detail page

**Files:**
- Create: `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx`

- [ ] **Step 1: Create `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchService } from '@/modules/leagues';
import { getSubmitterSide } from '@/modules/leagues/application/match-result-logic';
import { SubmitResultForm } from './submit-result-form';
import { ConfirmRejectPanel } from './confirm-reject-panel';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Pendiente',
  DATE_PROPOSED: 'Fecha propuesta',
  DATE_CONFIRMED: 'Fecha confirmada',
  PENDING_VALIDATION: 'Resultado enviado',
  CONFIRMED: 'Confirmado',
  ADMIN_RESOLVED: 'Resuelto por admin',
  DISPUTED: 'En disputa',
  EXPIRED_UNPLAYED: 'No jugado',
  CANCELLED: 'Cancelado',
};

const STATUS_CLASS: Record<string, string> = {
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

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ slug: string; matchId: string }>;
}) {
  const { slug, matchId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);

  const currentUser = await getValidatedSession(token);
  const match = await MatchService.getMatch(matchId).catch(() => null);
  if (!match || match.leagueSlug !== slug) notFound();

  const teamAIds = match.teamA.members.map((m) => m.userId);
  const teamBIds = match.teamB.members.map((m) => m.userId);
  const currentUserSide = getSubmitterSide(currentUser.id, teamAIds, teamBIds);
  const isTeamMember = currentUserSide !== null;

  const SUBMITTABLE = ['SCHEDULED', 'DATE_PROPOSED', 'DATE_CONFIRMED'];
  const canSubmit = isTeamMember && SUBMITTABLE.includes(match.status);

  const canValidate =
    match.status === 'PENDING_VALIDATION' &&
    match.pendingResult !== null &&
    currentUserSide !== null &&
    currentUserSide !== match.pendingResult.submitterSide;

  const isAwaitingOwnConfirmation =
    match.status === 'PENDING_VALIDATION' &&
    match.pendingResult !== null &&
    currentUserSide === match.pendingResult.submitterSide;

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {/* Back link */}
      <Link
        href={`/ligas/${slug}` as Route}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        ← Volver a la liga
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 font-semibold text-gray-900 text-lg">
            <span>{match.teamA.name}</span>
            <span className="text-gray-400 font-normal text-sm">vs</span>
            <span>{match.teamB.name}</span>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_CLASS[match.status] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {STATUS_LABEL[match.status] ?? match.status}
          </span>
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Límite: {match.deadlineAt.toLocaleDateString('es-ES')}
          {match.scheduledAt && (
            <> · Jugado: {match.scheduledAt.toLocaleDateString('es-ES')}</>
          )}
        </p>
      </div>

      {/* Confirmed result */}
      {match.confirmedResult && (
        <div className="bg-white rounded-xl border border-green-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Resultado final</h3>
          <div className="space-y-2">
            {match.confirmedResult.sets.map((s) => (
              <div key={s.setNumber} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-center">
                <span
                  className={`text-lg font-bold ${s.gamesA > s.gamesB ? 'text-green-600' : 'text-gray-400'}`}
                >
                  {s.gamesA}
                </span>
                <span className="text-xs text-gray-400">Set {s.setNumber}</span>
                <span
                  className={`text-lg font-bold ${s.gamesB > s.gamesA ? 'text-green-600' : 'text-gray-400'}`}
                >
                  {s.gamesB}
                </span>
              </div>
            ))}
          </div>
          {match.confirmedResult.winnerTeamId ? (
            <p className="text-sm text-green-700 font-medium mt-3 text-center">
              Ganador:{' '}
              {match.confirmedResult.winnerTeamId === match.teamAId
                ? match.teamA.name
                : match.teamB.name}
            </p>
          ) : (
            <p className="text-sm text-gray-500 font-medium mt-3 text-center">Empate</p>
          )}
        </div>
      )}

      {/* Pending result awaiting validation */}
      {match.pendingResult && match.status === 'PENDING_VALIDATION' && (
        <div className="bg-white rounded-xl border border-orange-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Resultado enviado — pendiente de validación</h3>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-xs font-medium text-gray-500 text-center">
              <span>{match.teamA.name}</span>
              <span />
              <span>{match.teamB.name}</span>
            </div>
            {match.pendingResult.sets.map((s) => (
              <div key={s.setNumber} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-center">
                <span className="text-lg font-bold text-gray-900">{s.gamesA}</span>
                <span className="text-xs text-gray-400">Set {s.setNumber}</span>
                <span className="text-lg font-bold text-gray-900">{s.gamesB}</span>
              </div>
            ))}
          </div>

          {canValidate && <ConfirmRejectPanel matchId={match.id} />}

          {isAwaitingOwnConfirmation && (
            <p className="text-sm text-orange-700 bg-orange-50 rounded-lg px-3 py-2">
              Resultado enviado. Esperando confirmación del equipo rival.
            </p>
          )}
        </div>
      )}

      {/* Submit result form */}
      {canSubmit && (
        <SubmitResultForm
          matchId={match.id}
          teamAName={match.teamA.name}
          teamBName={match.teamB.name}
        />
      )}

      {/* Disputed state */}
      {match.status === 'DISPUTED' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-semibold text-red-800 mb-1">Partido en disputa</h3>
          <p className="text-sm text-red-600">
            El resultado ha sido disputado. Un administrador resolverá la disputa.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/ligas/\[slug\]/partidos/\[matchId\]/page.tsx
git commit -m "feat(matches): match detail page with result submission, confirmation and dispute flows"
```

---

## Task 7: Make match rows clickable + ESLint allowlist

**Files:**
- Modify: `src/app/(app)/ligas/[slug]/page.tsx`
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Wrap match rows in Link in `src/app/(app)/ligas/[slug]/page.tsx`**

In the `{/* Partidos */}` section, find the `<div key={match.id} className="bg-white rounded-lg border...">` and replace it with a `<Link>`. Replace this block (lines 181–205):

```tsx
{matches.map((match) => (
  <div
    key={match.id}
    className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-4"
  >
    <div className="flex items-center gap-3 font-medium text-gray-900 min-w-0">
      <span className="truncate">{match.teamA.name}</span>
      <span className="text-gray-400 text-xs shrink-0">vs</span>
      <span className="truncate">{match.teamB.name}</span>
    </div>
    <div className="flex items-center gap-3 shrink-0">
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
```

With:

```tsx
{matches.map((match) => (
  <Link
    key={match.id}
    href={`/ligas/${slug}/partidos/${match.id}` as Route}
    className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
  >
    <div className="flex items-center gap-3 font-medium text-gray-900 min-w-0">
      <span className="truncate">{match.teamA.name}</span>
      <span className="text-gray-400 text-xs shrink-0">vs</span>
      <span className="truncate">{match.teamB.name}</span>
    </div>
    <div className="flex items-center gap-3 shrink-0">
      {match.scheduledAt && (
        <span className="text-xs text-gray-400">
          {match.scheduledAt.toLocaleDateString('es-ES')}
        </span>
      )}
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[match.status]}`}>
        {STATUS_LABEL[match.status]}
      </span>
    </div>
  </Link>
))}
```

- [ ] **Step 2: Add new test file pattern to `eslint.config.mjs` allowlist**

The test file `tests/unit/modules/leagues/match-result-logic.test.ts` is already covered by the existing `'tests/unit/modules/leagues/*.ts'` pattern — no change needed. Verify by running lint:

```bash
pnpm lint 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Run all unit tests**

```bash
pnpm test:unit 2>&1 | tail -20
```

Expected: all tests pass (fixture-generator, standings-calculator, match-result-logic).

- [ ] **Step 4: Run full typecheck**

```bash
pnpm typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/ligas/\[slug\]/page.tsx
git commit -m "feat(matches): make match rows clickable links to match detail page"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Submit result (set scores) — Task 3+4
- ✅ Confirm result by opposing team → standings auto-update via existing `calculateStandings` (reads CONFIRMED matches) — Task 5
- ✅ Dispute result → DISPUTED status + Dispute record — Task 5
- ✅ Guard: only team members can submit/confirm/dispute — MatchService
- ✅ Guard: cannot confirm/dispute your own result — MatchService
- ✅ Guard: match must be in correct status — MatchService
- ✅ Unit tests for pure logic — Task 1
- ✅ Match detail page accessible from liga detail — Task 7

**Out of scope for this plan (Plan 4+):**
- Admin dispute resolution
- Deadline enforcement / expired matches
- Email notifications on result submission/confirmation
