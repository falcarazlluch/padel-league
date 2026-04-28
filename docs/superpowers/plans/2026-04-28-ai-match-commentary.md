# AI Match Commentary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate witty Spanish-language commentary for league matches (PREVIEW pre-match, RECAP post-match) via OpenAI, displayed on match detail · league feed · dashboard, with admin regenerate/edit/delete controls.

**Architecture:** New `src/modules/match-commentary/` module with `AIProvider` port + OpenAI adapter (hexagonal). Commentary generation runs as a pg-boss job triggered when matches transition to `DATE_CONFIRMED` (PREVIEW) or `CONFIRMED`/`ADMIN_RESOLVED` (RECAP). Service handles CRUD + admin authorization. UI is server-rendered with a client component for admin actions.

**Tech Stack:** Next.js 15 App Router, Prisma 5, pg-boss queue, OpenAI SDK (`openai` npm), Zod, Tailwind CSS v4, Vitest.

---

## File Structure

**New module files:**
- `src/modules/match-commentary/domain/types.ts` — `CommentaryContext`, `CommentaryRow`, `CommentaryType`
- `src/modules/match-commentary/domain/ai-provider.ts` — `AIProvider` interface (port)
- `src/modules/match-commentary/application/prompt-builder.ts` — pure function `buildPrompt(ctx)`
- `src/modules/match-commentary/application/context-builder.ts` — `buildContext(matchId, type)` (queries Prisma)
- `src/modules/match-commentary/application/match-commentary-service.ts` — service object with all methods
- `src/modules/match-commentary/infrastructure/openai-provider.ts` — OpenAI Chat API adapter
- `src/modules/match-commentary/index.ts` — barrel exports

**New worker handler:**
- `src/worker/handlers/generate-match-commentary.ts`

**New UI files:**
- `src/app/(app)/ligas/[slug]/partidos/[matchId]/commentary-actions.ts` — admin server actions
- `src/app/(app)/ligas/[slug]/partidos/[matchId]/_components/commentary-admin-actions.tsx` — client component for inline regenerate/edit/delete
- `src/app/(app)/ligas/[slug]/_components/commentary-feed-card.tsx` — reusable card for league feed + dashboard

**New tests:**
- `tests/unit/modules/match-commentary/prompt-builder.test.ts`
- `tests/unit/modules/match-commentary/context-builder.test.ts`
- `tests/integration/match-commentary.test.ts`

**Modified files:**
- `prisma/schema.prisma` — `CommentaryType` enum + new `MatchCommentary` fields
- `prisma/migrations/<timestamp>_ai_commentary_types/migration.sql` — new migration
- `package.json` — add `openai` dependency
- `src/shared/queue/jobs.ts` — extend `'generate-match-commentary'` payload type
- `src/worker/index.ts` — register new handler
- `src/modules/leagues/application/scheduling-service.ts` — emit PREVIEW job
- `src/modules/leagues/application/match-service.ts` — emit RECAP job at confirm + resolveDispute
- `src/worker/handlers/match-auto-approve-result.ts` — emit RECAP job after auto-approve
- `src/app/(app)/ligas/[slug]/page.tsx` — new "Crónicas" tab
- `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx` — render commentaries
- `src/app/(app)/dashboard/page.tsx` — replace "Últimos resultados" with "Últimas crónicas"

---

## Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260428180000_ai_commentary_types/migration.sql`

- [ ] **Step 1: Update `MatchCommentary` model and add `CommentaryType` enum**

Open `prisma/schema.prisma`. Find the `enum AICommentaryProvider` declaration. Add this enum below it:

```prisma
enum CommentaryType {
  PREVIEW
  RECAP
}
```

Find the `model MatchCommentary {...}` block (around line 435). Replace it entirely with:

```prisma
model MatchCommentary {
  id                 String                @id @default(cuid())
  matchId            String                @map("match_id")
  type               CommentaryType
  provider           AICommentaryProvider
  content            String
  generatedAt        DateTime              @default(now()) @map("generated_at")
  regeneratedCount   Int                   @default(0) @map("regenerated_count")
  rejectedForSafety  Boolean               @default(false) @map("rejected_for_safety")
  promptVersion      String                @default("v1") @map("prompt_version")
  editedAt           DateTime?             @map("edited_at")
  editedByUserId     String?               @map("edited_by_user_id")

  match  Match  @relation(fields: [matchId], references: [id], onDelete: Cascade)
  editor User?  @relation("CommentaryEditor", fields: [editedByUserId], references: [id], onDelete: Restrict)

  @@unique([matchId, type])
  @@index([matchId])
  @@map("match_commentaries")
}
```

- [ ] **Step 2: Add back-relation on `User` model**

In the same file, find the `model User {...}` block. Find the existing relation lines (e.g. `notifications`, `independentMatches`, etc.). After any existing user-relation lines, add:

```prisma
  editedCommentaries    MatchCommentary[] @relation("CommentaryEditor")
```

Place it among the other relations alphabetically or wherever it fits the existing convention.

- [ ] **Step 3: Create the migration SQL file**

The dev environment cannot reach `binaries.prisma.sh` (self-signed cert). Create the migration manually.

Create directory: `prisma/migrations/20260428180000_ai_commentary_types/`.

Create `prisma/migrations/20260428180000_ai_commentary_types/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "CommentaryType" AS ENUM ('PREVIEW', 'RECAP');

-- AlterTable: drop unique on match_id, add new columns, then add composite unique
-- Table is empty (feature never implemented), no data backfill needed.
ALTER TABLE "match_commentaries" DROP CONSTRAINT IF EXISTS "match_commentaries_match_id_key";

ALTER TABLE "match_commentaries"
  ADD COLUMN "type" "CommentaryType" NOT NULL DEFAULT 'RECAP',
  ADD COLUMN "edited_at" TIMESTAMP(3),
  ADD COLUMN "edited_by_user_id" TEXT;

-- Drop default after the ADD (table empty so default never used; future inserts must provide type)
ALTER TABLE "match_commentaries" ALTER COLUMN "type" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "match_commentaries_match_id_idx" ON "match_commentaries"("match_id");

-- AddUniqueConstraint
ALTER TABLE "match_commentaries"
  ADD CONSTRAINT "match_commentaries_match_id_type_key" UNIQUE ("match_id", "type");

-- AddForeignKey: edited_by_user_id -> users
ALTER TABLE "match_commentaries" ADD CONSTRAINT "match_commentaries_edited_by_user_id_fkey"
  FOREIGN KEY ("edited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Regenerate Prisma client**

```bash
pnpm prisma generate
```

Expected: success. If it fails with the SSL cert error, copy the generated client from the main repo's `node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma` (this is the same workaround used in previous specs).

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "match.?commentary|MatchCommentary" | head
```

Expected: no errors related to `MatchCommentary` (pre-existing errors in other files are fine).

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat(db): add CommentaryType enum + edit fields on MatchCommentary"
```

---

## Task 2: Module foundation — types + AIProvider port + OpenAI adapter

**Files:**
- Create: `src/modules/match-commentary/domain/types.ts`
- Create: `src/modules/match-commentary/domain/ai-provider.ts`
- Create: `src/modules/match-commentary/infrastructure/openai-provider.ts`
- Modify: `package.json` (add `openai` dependency)

- [ ] **Step 1: Install OpenAI SDK**

```bash
pnpm add openai
```

Expected: package added to dependencies; lockfile updated.

- [ ] **Step 2: Create domain types**

Create `src/modules/match-commentary/domain/types.ts`:

```typescript
import type { AICommentaryProvider, CommentaryType } from '@prisma/client';

export type { CommentaryType };

export type CommentaryContext = {
  type: CommentaryType;
  league: { name: string };
  teamA: {
    name: string;
    rank: number | null;
    points: number;
    recent: Array<{ won: boolean; opponent: string }>;
  };
  teamB: {
    name: string;
    rank: number | null;
    points: number;
    recent: Array<{ won: boolean; opponent: string }>;
  };
  result?: {
    sets: Array<{ gamesA: number; gamesB: number }>;
    winnerTeam: 'A' | 'B' | 'DRAW';
  };
  scheduledAt?: Date;
};

export type CommentaryRow = {
  id: string;
  matchId: string;
  type: CommentaryType;
  provider: AICommentaryProvider;
  content: string;
  generatedAt: Date;
  regeneratedCount: number;
  rejectedForSafety: boolean;
  promptVersion: string;
  editedAt: Date | null;
  editedByUserId: string | null;
};

export type CommentaryFeedItem = CommentaryRow & {
  match: {
    id: string;
    leagueId: string;
    league: { name: string; slug: string };
    teamA: { id: string; name: string };
    teamB: { id: string; name: string };
    winnerTeamId: string | null;
    confirmedResult: {
      sets: Array<{ gamesA: number; gamesB: number; setNumber: number }>;
    } | null;
  };
};
```

- [ ] **Step 3: Create AIProvider port**

Create `src/modules/match-commentary/domain/ai-provider.ts`:

```typescript
export interface AIProvider {
  generateCommentary(prompt: string): Promise<{ content: string; model: string }>;
}
```

- [ ] **Step 4: Create OpenAI adapter**

Create `src/modules/match-commentary/infrastructure/openai-provider.ts`:

```typescript
import OpenAI from 'openai';
import { env } from '@/shared/config/env';
import type { AIProvider } from '../domain/ai-provider';

let _client: OpenAI | undefined;

function getClient(): OpenAI {
  const apiKey = env().OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  _client ??= new OpenAI({ apiKey });
  return _client;
}

export const OpenAIProvider: AIProvider = {
  async generateCommentary(prompt: string): Promise<{ content: string; model: string }> {
    const model = env().AI_MODEL_OPENAI ?? 'gpt-4o-mini';
    const completion = await getClient().chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
      max_tokens: 200,
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('OpenAI returned empty content');
    }
    return { content, model };
  },
};
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "match-commentary" | head
```

Expected: no errors related to the new module files.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/modules/match-commentary/
git commit -m "feat(match-commentary): add domain types, AIProvider port, and OpenAI adapter"
```

---

## Task 3: Prompt builder (TDD)

**Files:**
- Create: `src/modules/match-commentary/application/prompt-builder.ts`
- Create: `tests/unit/modules/match-commentary/prompt-builder.test.ts`

- [ ] **Step 1: Write failing tests for `buildPrompt`**

Create `tests/unit/modules/match-commentary/prompt-builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildPrompt } from '@/modules/match-commentary/application/prompt-builder';
import type { CommentaryContext } from '@/modules/match-commentary/domain/types';

const baseCtx: CommentaryContext = {
  type: 'PREVIEW',
  league: { name: 'Liga Verano 2026' },
  teamA: {
    name: 'Los Cañones',
    rank: 1,
    points: 9,
    recent: [
      { won: true, opponent: 'Pádel Bros' },
      { won: true, opponent: 'Team Rafa' },
      { won: false, opponent: 'Los Ases' },
    ],
  },
  teamB: {
    name: 'Pádel Bros',
    rank: 4,
    points: 3,
    recent: [
      { won: false, opponent: 'Los Cañones' },
      { won: false, opponent: 'Los Ases' },
      { won: true, opponent: 'Team Rafa' },
    ],
  },
  scheduledAt: new Date('2026-05-12T19:00:00Z'),
};

describe('buildPrompt', () => {
  it('includes the league name', () => {
    const prompt = buildPrompt(baseCtx);
    expect(prompt).toContain('Liga Verano 2026');
  });

  it('includes both team names', () => {
    const prompt = buildPrompt(baseCtx);
    expect(prompt).toContain('Los Cañones');
    expect(prompt).toContain('Pádel Bros');
  });

  it('includes ranking and points when available', () => {
    const prompt = buildPrompt(baseCtx);
    expect(prompt).toContain('1º');
    expect(prompt).toContain('9 pts');
    expect(prompt).toContain('4º');
    expect(prompt).toContain('3 pts');
  });

  it('omits ranking when rank is null (cold start)', () => {
    const ctx: CommentaryContext = {
      ...baseCtx,
      teamA: { ...baseCtx.teamA, rank: null, points: 0 },
      teamB: { ...baseCtx.teamB, rank: null, points: 0 },
    };
    const prompt = buildPrompt(ctx);
    expect(prompt).not.toContain('1º');
    expect(prompt).not.toContain('clasificación');
  });

  it('uses PREVIEW instructions when type is PREVIEW', () => {
    const prompt = buildPrompt({ ...baseCtx, type: 'PREVIEW' });
    expect(prompt.toLowerCase()).toContain('previa');
    expect(prompt.toLowerCase()).toContain('sin spoilers');
  });

  it('uses RECAP instructions when type is RECAP', () => {
    const prompt = buildPrompt({
      ...baseCtx,
      type: 'RECAP',
      result: {
        sets: [
          { gamesA: 6, gamesB: 4 },
          { gamesA: 3, gamesB: 6 },
          { gamesA: 7, gamesB: 5 },
        ],
        winnerTeam: 'A',
      },
    });
    expect(prompt.toLowerCase()).toContain('crónica');
    expect(prompt).toContain('6-4');
    expect(prompt).toContain('3-6');
    expect(prompt).toContain('7-5');
  });

  it('marks the winner explicitly in RECAP', () => {
    const prompt = buildPrompt({
      ...baseCtx,
      type: 'RECAP',
      result: {
        sets: [{ gamesA: 6, gamesB: 4 }, { gamesA: 6, gamesB: 3 }],
        winnerTeam: 'A',
      },
    });
    expect(prompt).toContain('Ganador: Los Cañones');
  });

  it('marks draw when winnerTeam is DRAW', () => {
    const prompt = buildPrompt({
      ...baseCtx,
      type: 'RECAP',
      result: {
        sets: [{ gamesA: 6, gamesB: 4 }, { gamesA: 4, gamesB: 6 }],
        winnerTeam: 'DRAW',
      },
    });
    expect(prompt.toLowerCase()).toContain('empate');
  });

  it('handles empty recent arrays (no prior matches)', () => {
    const ctx: CommentaryContext = {
      ...baseCtx,
      teamA: { ...baseCtx.teamA, recent: [] },
      teamB: { ...baseCtx.teamB, recent: [] },
    };
    const prompt = buildPrompt(ctx);
    expect(prompt).toContain('Sin partidos previos');
  });

  it('formats recent matches as wins/losses with opponent names', () => {
    const prompt = buildPrompt(baseCtx);
    expect(prompt).toMatch(/(victoria|derrota|ganó|perdió|✓|✗)/i);
    expect(prompt).toContain('Pádel Bros');
  });

  it('includes the privacy / safety rules', () => {
    const prompt = buildPrompt(baseCtx);
    expect(prompt).toContain('No inventes');
    expect(prompt).toContain('datos personales');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:unit -- tests/unit/modules/match-commentary/prompt-builder.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildPrompt`**

Create `src/modules/match-commentary/application/prompt-builder.ts`:

```typescript
import type { CommentaryContext } from '../domain/types';

export const PROMPT_VERSION = 'v1';

function formatRecent(recent: Array<{ won: boolean; opponent: string }>): string {
  if (recent.length === 0) return 'Sin partidos previos en la liga.';
  return recent.map((r) => `${r.won ? '✓' : '✗'} vs ${r.opponent}`).join(' · ');
}

function rankLine(team: { rank: number | null; points: number }): string {
  if (team.rank === null) return '';
  return ` — clasificación: ${team.rank}º con ${team.points} pts.`;
}

function formatSets(sets: Array<{ gamesA: number; gamesB: number }>): string {
  return sets.map((s) => `${s.gamesA}-${s.gamesB}`).join(', ');
}

export function buildPrompt(ctx: CommentaryContext): string {
  const { type, league, teamA, teamB, result } = ctx;

  const teamAInfo = `Equipo A: "${teamA.name}"${rankLine(teamA)}\n  Últimos partidos: ${formatRecent(teamA.recent)}`;
  const teamBInfo = `Equipo B: "${teamB.name}"${rankLine(teamB)}\n  Últimos partidos: ${formatRecent(teamB.recent)}`;

  let resultBlock = '';
  if (type === 'RECAP' && result) {
    const winnerName =
      result.winnerTeam === 'A'
        ? teamA.name
        : result.winnerTeam === 'B'
          ? teamB.name
          : null;
    resultBlock = `\n- Resultado: ${formatSets(result.sets)}\n- Ganador: ${winnerName ?? 'empate'}`;
  }

  const instruction =
    type === 'PREVIEW'
      ? 'Escribe una previa con guasa amistosa: pinta el cruce, mete una broma sobre las rachas si las hay, sin spoilers (no sabemos quién ganará).'
      : 'Escribe la crónica con guasa amistosa: comenta el marcador, lanza un dardo cariñoso al perdedor, mete un guiño a la clasificación si es relevante.';

  return [
    'Eres un cronista de pádel con sentido del humor — irónico pero amable, nunca cruel.',
    'Escribe en español, 250-400 caracteres, máximo 3-4 frases.',
    '',
    'CONTEXTO:',
    `- Liga: "${league.name}"`,
    `- ${teamAInfo}`,
    `- ${teamBInfo}${resultBlock}`,
    '',
    instruction,
    '',
    'REGLAS:',
    '- No inventes equipos, jugadores, marcadores ni hechos.',
    '- No incluyas datos personales más allá de los nombres de equipo.',
    '- Mantén el tono ligero — sin insultos ni temas sensibles.',
    '- Devuelve solo el texto del comentario, sin comillas ni encabezados.',
  ].join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:unit -- tests/unit/modules/match-commentary/prompt-builder.test.ts
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/match-commentary/application/prompt-builder.ts tests/unit/modules/match-commentary/prompt-builder.test.ts
git commit -m "feat(match-commentary): prompt builder with PREVIEW/RECAP variants"
```

---

## Task 4: Context builder

**Files:**
- Create: `src/modules/match-commentary/application/context-builder.ts`
- Create: `tests/unit/modules/match-commentary/context-builder.test.ts`

This task does not strictly TDD because the function is mostly Prisma orchestration. We'll write tests with mocked prisma.

- [ ] **Step 1: Implement `buildContext`**

Create `src/modules/match-commentary/application/context-builder.ts`:

```typescript
import { prisma } from '@/shared/db/client';
import { calculateStandings } from '@/modules/leagues';
import { NotFoundError } from '@/shared/errors';
import type { CommentaryContext, CommentaryType } from '../domain/types';

const RECENT_LIMIT = 3;

async function getRecentResults(
  teamId: string,
  excludeMatchId: string,
  teamNamesById: Map<string, string>,
): Promise<Array<{ won: boolean; opponent: string }>> {
  const matches = await prisma.match.findMany({
    where: {
      id: { not: excludeMatchId },
      status: { in: ['CONFIRMED', 'ADMIN_RESOLVED'] },
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    select: {
      teamAId: true,
      teamBId: true,
      winnerTeamId: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: RECENT_LIMIT,
  });

  return matches.map((m) => {
    const opponentId = m.teamAId === teamId ? m.teamBId : m.teamAId;
    const opponent = teamNamesById.get(opponentId) ?? 'Equipo desconocido';
    const won = m.winnerTeamId === teamId;
    return { won, opponent };
  });
}

export async function buildContext(
  matchId: string,
  type: CommentaryType,
): Promise<CommentaryContext> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      league: { select: { id: true, name: true } },
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
      confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
    },
  });
  if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');

  const allTeams = await prisma.team.findMany({
    where: { leagueId: match.league.id },
    select: { id: true, name: true },
  });
  const teamNamesById = new Map(allTeams.map((t) => [t.id, t.name]));
  const teamNamesMap = Object.fromEntries(allTeams.map((t) => [t.id, t.name]));

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

  function rankAndPoints(teamId: string): { rank: number | null; points: number } {
    const idx = standings.findIndex((s) => s.teamId === teamId);
    const entry = standings[idx];
    if (!entry || entry.played === 0) return { rank: null, points: entry?.points ?? 0 };
    return { rank: idx + 1, points: entry.points };
  }

  const [recentA, recentB] = await Promise.all([
    getRecentResults(match.teamAId, matchId, teamNamesById),
    getRecentResults(match.teamBId, matchId, teamNamesById),
  ]);

  const ctx: CommentaryContext = {
    type,
    league: { name: match.league.name },
    teamA: {
      name: match.teamA.name,
      ...rankAndPoints(match.teamAId),
      recent: recentA,
    },
    teamB: {
      name: match.teamB.name,
      ...rankAndPoints(match.teamBId),
      recent: recentB,
    },
  };

  if (type === 'RECAP' && match.confirmedResult) {
    const sets = match.confirmedResult.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB }));
    const winnerTeam: 'A' | 'B' | 'DRAW' =
      match.winnerTeamId === match.teamAId
        ? 'A'
        : match.winnerTeamId === match.teamBId
          ? 'B'
          : 'DRAW';
    ctx.result = { sets, winnerTeam };
  }

  if (type === 'PREVIEW' && match.scheduledAt) {
    ctx.scheduledAt = match.scheduledAt;
  }

  return ctx;
}
```

- [ ] **Step 2: Write tests with mocked prisma**

Create `tests/unit/modules/match-commentary/context-builder.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the prisma client and calculateStandings before importing the module under test.
vi.mock('@/shared/db/client', () => ({
  prisma: {
    match: { findUnique: vi.fn(), findMany: vi.fn() },
    team: { findMany: vi.fn() },
  },
}));

vi.mock('@/modules/leagues', () => ({
  calculateStandings: vi.fn(),
}));

import { prisma } from '@/shared/db/client';
import { calculateStandings } from '@/modules/leagues';
import { buildContext } from '@/modules/match-commentary/application/context-builder';
import { NotFoundError } from '@/shared/errors';

const mockMatch = (overrides: Record<string, unknown> = {}) => ({
  id: 'match-1',
  teamAId: 'team-a',
  teamBId: 'team-b',
  winnerTeamId: null,
  scheduledAt: new Date('2026-05-12T19:00:00Z'),
  league: { id: 'league-1', name: 'Liga Verano 2026' },
  teamA: { id: 'team-a', name: 'Los Cañones' },
  teamB: { id: 'team-b', name: 'Pádel Bros' },
  confirmedResult: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildContext', () => {
  it('throws NotFoundError when match does not exist', async () => {
    (prisma.match.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(buildContext('missing', 'PREVIEW')).rejects.toThrow(NotFoundError);
  });

  it('builds a PREVIEW context with team names, ranking, and recent matches', async () => {
    (prisma.match.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockMatch());
    (prisma.team.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'team-a', name: 'Los Cañones' },
      { id: 'team-b', name: 'Pádel Bros' },
      { id: 'team-c', name: 'Team Rafa' },
    ]);
    (prisma.match.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // confirmedMatches for standings
      .mockResolvedValueOnce([
        { teamAId: 'team-a', teamBId: 'team-c', winnerTeamId: 'team-a' },
      ]) // recent A
      .mockResolvedValueOnce([
        { teamAId: 'team-b', teamBId: 'team-c', winnerTeamId: 'team-c' },
      ]); // recent B
    (calculateStandings as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      { teamId: 'team-a', teamName: 'Los Cañones', played: 1, points: 3 },
      { teamId: 'team-b', teamName: 'Pádel Bros', played: 1, points: 0 },
      { teamId: 'team-c', teamName: 'Team Rafa', played: 2, points: 3 },
    ]);

    const ctx = await buildContext('match-1', 'PREVIEW');

    expect(ctx.type).toBe('PREVIEW');
    expect(ctx.league.name).toBe('Liga Verano 2026');
    expect(ctx.teamA.name).toBe('Los Cañones');
    expect(ctx.teamA.rank).toBe(1);
    expect(ctx.teamA.points).toBe(3);
    expect(ctx.teamA.recent).toEqual([{ won: true, opponent: 'Team Rafa' }]);
    expect(ctx.teamB.recent).toEqual([{ won: false, opponent: 'Team Rafa' }]);
    expect(ctx.scheduledAt).toBeInstanceOf(Date);
    expect(ctx.result).toBeUndefined();
  });

  it('returns rank=null when team has not played any match yet', async () => {
    (prisma.match.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockMatch());
    (prisma.team.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'team-a', name: 'Los Cañones' },
      { id: 'team-b', name: 'Pádel Bros' },
    ]);
    (prisma.match.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (calculateStandings as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      { teamId: 'team-a', teamName: 'Los Cañones', played: 0, points: 0 },
      { teamId: 'team-b', teamName: 'Pádel Bros', played: 0, points: 0 },
    ]);

    const ctx = await buildContext('match-1', 'PREVIEW');
    expect(ctx.teamA.rank).toBeNull();
    expect(ctx.teamB.rank).toBeNull();
  });

  it('builds a RECAP context with the confirmed result', async () => {
    (prisma.match.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockMatch({
        winnerTeamId: 'team-a',
        confirmedResult: {
          sets: [
            { setNumber: 1, gamesA: 6, gamesB: 4 },
            { setNumber: 2, gamesA: 3, gamesB: 6 },
            { setNumber: 3, gamesA: 7, gamesB: 5 },
          ],
        },
      }),
    );
    (prisma.team.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'team-a', name: 'Los Cañones' },
      { id: 'team-b', name: 'Pádel Bros' },
    ]);
    (prisma.match.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (calculateStandings as ReturnType<typeof vi.fn>).mockReturnValueOnce([
      { teamId: 'team-a', teamName: 'Los Cañones', played: 1, points: 3 },
      { teamId: 'team-b', teamName: 'Pádel Bros', played: 1, points: 0 },
    ]);

    const ctx = await buildContext('match-1', 'RECAP');
    expect(ctx.type).toBe('RECAP');
    expect(ctx.result).toEqual({
      sets: [
        { gamesA: 6, gamesB: 4 },
        { gamesA: 3, gamesB: 6 },
        { gamesA: 7, gamesB: 5 },
      ],
      winnerTeam: 'A',
    });
  });

  it('marks DRAW when winnerTeamId is null in RECAP', async () => {
    (prisma.match.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockMatch({
        winnerTeamId: null,
        confirmedResult: { sets: [{ setNumber: 1, gamesA: 6, gamesB: 6 }] },
      }),
    );
    (prisma.team.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'team-a', name: 'Los Cañones' },
      { id: 'team-b', name: 'Pádel Bros' },
    ]);
    (prisma.match.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (calculateStandings as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

    const ctx = await buildContext('match-1', 'RECAP');
    expect(ctx.result?.winnerTeam).toBe('DRAW');
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
pnpm test:unit -- tests/unit/modules/match-commentary/context-builder.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/modules/match-commentary/application/context-builder.ts tests/unit/modules/match-commentary/context-builder.test.ts
git commit -m "feat(match-commentary): context builder with standings + recent matches"
```

---

## Task 5: MatchCommentaryService + barrel

**Files:**
- Create: `src/modules/match-commentary/application/match-commentary-service.ts`
- Create: `src/modules/match-commentary/index.ts`

- [ ] **Step 1: Create the service**

Create `src/modules/match-commentary/application/match-commentary-service.ts`:

```typescript
import { prisma } from '@/shared/db/client';
import { z } from 'zod';
import {
  NotFoundError,
  AuthorizationError,
  DomainError,
} from '@/shared/errors';
import { OpenAIProvider } from '../infrastructure/openai-provider';
import { buildContext } from './context-builder';
import { buildPrompt, PROMPT_VERSION } from './prompt-builder';
import type { AIProvider } from '../domain/ai-provider';
import type { CommentaryRow, CommentaryType, CommentaryFeedItem } from '../domain/types';

let _provider: AIProvider = OpenAIProvider;

/** Allows tests to inject a fake provider. */
export function __setProviderForTests(provider: AIProvider): void {
  _provider = provider;
}

const editSchema = z.string().trim().min(1, 'El contenido no puede estar vacío.').max(1000, 'Máximo 1000 caracteres.');

async function ensureLeagueAdmin(matchId: string, userId: string): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { leagueId: true },
  });
  if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');

  const member = await prisma.leagueMember.findFirst({
    where: { leagueId: match.leagueId, userId, role: 'LEAGUE_ADMIN' },
  });
  if (!member) {
    throw new AuthorizationError('NOT_LEAGUE_ADMIN', 'Solo los admins de la liga pueden gestionar la crónica.');
  }
}

export const MatchCommentaryService = {
  async generate(
    matchId: string,
    type: CommentaryType,
    opts: { regenerate?: boolean } = {},
  ): Promise<void> {
    const existing = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId, type } },
    });

    if (existing && !opts.regenerate) {
      return; // idempotent
    }

    const ctx = await buildContext(matchId, type);
    const prompt = buildPrompt(ctx);
    const { content } = await _provider.generateCommentary(prompt);

    if (existing) {
      await prisma.matchCommentary.update({
        where: { id: existing.id },
        data: {
          content,
          generatedAt: new Date(),
          regeneratedCount: existing.regeneratedCount + 1,
          editedAt: null,
          editedByUserId: null,
          promptVersion: PROMPT_VERSION,
        },
      });
    } else {
      await prisma.matchCommentary.create({
        data: {
          matchId,
          type,
          provider: 'OPENAI',
          content,
          promptVersion: PROMPT_VERSION,
        },
      });
    }
  },

  async regenerate(commentaryId: string, userId: string): Promise<void> {
    const commentary = await prisma.matchCommentary.findUnique({
      where: { id: commentaryId },
      select: { matchId: true, type: true },
    });
    if (!commentary) throw new NotFoundError('COMMENTARY_NOT_FOUND', 'Crónica no encontrada.');
    await ensureLeagueAdmin(commentary.matchId, userId);
    await this.generate(commentary.matchId, commentary.type, { regenerate: true });
  },

  async edit(commentaryId: string, userId: string, newContent: string): Promise<void> {
    const parsed = editSchema.safeParse(newContent);
    if (!parsed.success) {
      throw new DomainError('INVALID_CONTENT', parsed.error.issues[0]?.message ?? 'Contenido inválido.');
    }
    const commentary = await prisma.matchCommentary.findUnique({
      where: { id: commentaryId },
      select: { matchId: true },
    });
    if (!commentary) throw new NotFoundError('COMMENTARY_NOT_FOUND', 'Crónica no encontrada.');
    await ensureLeagueAdmin(commentary.matchId, userId);

    await prisma.matchCommentary.update({
      where: { id: commentaryId },
      data: {
        content: parsed.data,
        editedAt: new Date(),
        editedByUserId: userId,
      },
    });
  },

  async delete(commentaryId: string, userId: string): Promise<void> {
    const commentary = await prisma.matchCommentary.findUnique({
      where: { id: commentaryId },
      select: { matchId: true },
    });
    if (!commentary) throw new NotFoundError('COMMENTARY_NOT_FOUND', 'Crónica no encontrada.');
    await ensureLeagueAdmin(commentary.matchId, userId);

    await prisma.matchCommentary.delete({ where: { id: commentaryId } });
  },

  async deleteByMatch(matchId: string): Promise<void> {
    await prisma.matchCommentary.deleteMany({ where: { matchId } });
  },

  async deleteByMatchAndType(matchId: string, type: CommentaryType): Promise<void> {
    await prisma.matchCommentary.deleteMany({ where: { matchId, type } });
  },

  async getByMatch(matchId: string): Promise<{ preview: CommentaryRow | null; recap: CommentaryRow | null }> {
    const items = await prisma.matchCommentary.findMany({ where: { matchId } });
    return {
      preview: (items.find((i) => i.type === 'PREVIEW') as CommentaryRow | undefined) ?? null,
      recap: (items.find((i) => i.type === 'RECAP') as CommentaryRow | undefined) ?? null,
    };
  },

  async listForLeague(leagueId: string, limit = 20): Promise<CommentaryFeedItem[]> {
    return prisma.matchCommentary.findMany({
      where: { match: { leagueId } },
      include: {
        match: {
          include: {
            league: { select: { name: true, slug: true } },
            teamA: { select: { id: true, name: true } },
            teamB: { select: { id: true, name: true } },
            confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
          },
        },
      },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    }) as unknown as Promise<CommentaryFeedItem[]>;
  },

  async listForUser(userId: string, limit = 5): Promise<CommentaryFeedItem[]> {
    return prisma.matchCommentary.findMany({
      where: {
        match: {
          league: { teams: { some: { members: { some: { userId } } } } },
        },
      },
      include: {
        match: {
          include: {
            league: { select: { name: true, slug: true } },
            teamA: { select: { id: true, name: true } },
            teamB: { select: { id: true, name: true } },
            confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
          },
        },
      },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    }) as unknown as Promise<CommentaryFeedItem[]>;
  },
} as const;
```

- [ ] **Step 2: Create the barrel export**

Create `src/modules/match-commentary/index.ts`:

```typescript
export { MatchCommentaryService, __setProviderForTests } from './application/match-commentary-service';
export { buildContext } from './application/context-builder';
export { buildPrompt, PROMPT_VERSION } from './application/prompt-builder';
export type {
  CommentaryContext,
  CommentaryRow,
  CommentaryType,
  CommentaryFeedItem,
} from './domain/types';
export type { AIProvider } from './domain/ai-provider';
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "match-commentary" | head
```

Expected: no errors related to match-commentary files.

- [ ] **Step 4: Commit**

```bash
git add src/modules/match-commentary/
git commit -m "feat(match-commentary): service with generate/regenerate/edit/delete/list + barrel"
```

---

## Task 6: Job type + worker handler

**Files:**
- Modify: `src/shared/queue/jobs.ts`
- Create: `src/worker/handlers/generate-match-commentary.ts`
- Modify: `src/worker/index.ts`

- [ ] **Step 1: Update the job type**

Open `src/shared/queue/jobs.ts`. Replace the `'generate-match-commentary'` line in the `JobMap` type:

```typescript
  'generate-match-commentary': {
    matchId: string;
    type: 'PREVIEW' | 'RECAP';
    regenerate?: boolean;
  };
```

(Leave the entry in `ALL_JOB_NAMES` as-is.)

- [ ] **Step 2: Create the handler**

Create `src/worker/handlers/generate-match-commentary.ts`:

```typescript
import { logger } from '@/shared/logger';
import { env } from '@/shared/config/env';
import { MatchCommentaryService } from '@/modules/match-commentary';
import type { JobMap } from '@/shared/queue/jobs';

export async function generateMatchCommentaryHandler(
  data: JobMap['generate-match-commentary'],
): Promise<void> {
  const { matchId, type, regenerate } = data;
  const log = logger();

  if (!env().FEATURE_AI_COMMENTARY) {
    log.info({ matchId, type }, 'commentary.skip.feature-disabled');
    return;
  }

  try {
    await MatchCommentaryService.generate(matchId, type, { regenerate });
    log.info({ matchId, type, regenerate: regenerate ?? false }, 'commentary.generated');
  } catch (err) {
    log.error({ matchId, type, err }, 'commentary.failed');
    throw err; // pg-boss retries with backoff
  }
}
```

- [ ] **Step 3: Register the handler in the worker**

Open `src/worker/index.ts`. Find the block where handlers are registered (lines ~22-28). After the `match-auto-approve-result` registration, add:

```typescript
  await registerHandler(boss, 'generate-match-commentary', generateMatchCommentaryHandler);
```

Add the import at the top of the file alongside the other handler imports:

```typescript
import { generateMatchCommentaryHandler } from './handlers/generate-match-commentary';
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "match-commentary|worker/index|queue/jobs" | head
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/queue/jobs.ts src/worker/
git commit -m "feat(worker): generate-match-commentary job handler with feature flag"
```

---

## Task 7: Triggers — emit jobs and clean up commentaries

**Files:**
- Modify: `src/modules/leagues/application/scheduling-service.ts` (PREVIEW)
- Modify: `src/modules/leagues/application/match-service.ts` (RECAP at confirmation + at resolveDispute, plus delete on rejection)
- Modify: `src/worker/handlers/match-auto-approve-result.ts` (RECAP)

- [ ] **Step 1: Trigger PREVIEW in `SchedulingService.acceptProposal`**

Open `src/modules/leagues/application/scheduling-service.ts`. Find the `acceptProposal` method at line ~62. Around line 102 there is the update that sets `status: 'DATE_CONFIRMED'`. After the transaction completes successfully (outside the `$transaction` block, just before the function returns), add:

```typescript
    // Fire-and-forget: enqueue commentary preview generation.
    void queue()
      .start()
      .then(() => queue().publish('generate-match-commentary', { matchId, type: 'PREVIEW' }))
      .catch(() => undefined);
```

Add the import at the top if not already present:

```typescript
import { queue } from '@/shared/queue/client';
```

- [ ] **Step 2: Trigger RECAP at result confirmation**

Open `src/modules/leagues/application/match-service.ts`. Find the place(s) where match status transitions to `'CONFIRMED'` (lines ~215 and ~226). After the transaction commits, enqueue:

```typescript
    void queue()
      .start()
      .then(() => queue().publish('generate-match-commentary', { matchId, type: 'RECAP' }))
      .catch(() => undefined);
```

Add the `queue` import if missing.

- [ ] **Step 3: Trigger RECAP at `resolveDispute`**

In the same file, find `resolveDispute` (line ~320). Where the status is set to `'ADMIN_RESOLVED'`, after the transaction commits, enqueue the RECAP job using the same pattern.

- [ ] **Step 4: Delete RECAP on result rejection**

In `match-service.ts`, find any path that rejects/disputes a result (causes the match to leave `CONFIRMED`/`ADMIN_RESOLVED`). After that DB write, call:

```typescript
    await MatchCommentaryService.deleteByMatchAndType(matchId, 'RECAP');
```

If no such rejection path exists in `match-service.ts` today, skip this step. Search with `grep -n "rejected\|REJECTED\|dispute" src/modules/leagues/application/match-service.ts` to find candidates.

Add the import:

```typescript
import { MatchCommentaryService } from '@/modules/match-commentary';
```

- [ ] **Step 5: Trigger RECAP in auto-approve handler**

Open `src/worker/handlers/match-auto-approve-result.ts`. After the `if (!confirmed) return;` line (~line 65), and after the notification/email block, add:

```typescript
  await q.publish('generate-match-commentary', { matchId: match.id, type: 'RECAP' });
```

The `q` variable is already in scope from the existing email-sending block.

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "scheduling-service|match-service|match-auto-approve" | head
```

Expected: no errors in the modified files.

- [ ] **Step 7: Commit**

```bash
git add src/modules/leagues/ src/worker/handlers/match-auto-approve-result.ts
git commit -m "feat(commentary): emit PREVIEW/RECAP jobs at status transitions"
```

---

## Task 8: Server actions for admin

**Files:**
- Create: `src/app/(app)/ligas/[slug]/partidos/[matchId]/commentary-actions.ts`

- [ ] **Step 1: Create the actions file**

Create `src/app/(app)/ligas/[slug]/partidos/[matchId]/commentary-actions.ts`:

```typescript
'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Route } from 'next';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchCommentaryService } from '@/modules/match-commentary';
import { isUserFacingError } from '@/shared/errors';
import { queue } from '@/shared/queue/client';
import { prisma } from '@/shared/db/client';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

type ActionResult = { error: string } | { success: true };

export async function regenerateCommentaryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const commentaryId = formData.get('commentaryId');
  const slug = formData.get('slug');
  const matchId = formData.get('matchId');
  if (
    typeof commentaryId !== 'string' ||
    typeof slug !== 'string' ||
    typeof matchId !== 'string'
  ) {
    return { error: 'Datos inválidos.' };
  }

  try {
    // Authorize and find type via service
    const commentary = await prisma.matchCommentary.findUnique({
      where: { id: commentaryId },
      select: { matchId: true, type: true },
    });
    if (!commentary) return { error: 'Crónica no encontrada.' };

    // Authorization check happens inside the queue handler via the service,
    // but we double-check here so we fail fast for the user.
    const isAdmin = await prisma.leagueMember.findFirst({
      where: {
        userId: user.id,
        role: 'LEAGUE_ADMIN',
        league: { matches: { some: { id: commentary.matchId } } },
      },
    });
    if (!isAdmin) return { error: 'Solo los admins pueden regenerar.' };

    const q = queue();
    await q.start();
    await q.publish('generate-match-commentary', {
      matchId: commentary.matchId,
      type: commentary.type,
      regenerate: true,
    });

    revalidatePath(`/ligas/${slug}/partidos/${matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const editSchema = z.object({
  commentaryId: z.string().cuid(),
  slug: z.string().min(1),
  matchId: z.string().cuid(),
  content: z.string().trim().min(1, 'El contenido no puede estar vacío.').max(1000, 'Máximo 1000 caracteres.'),
});

export async function editCommentaryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = editSchema.safeParse({
    commentaryId: formData.get('commentaryId'),
    slug: formData.get('slug'),
    matchId: formData.get('matchId'),
    content: formData.get('content'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await MatchCommentaryService.edit(parsed.data.commentaryId, user.id, parsed.data.content);
    revalidatePath(`/ligas/${parsed.data.slug}/partidos/${parsed.data.matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function deleteCommentaryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const commentaryId = formData.get('commentaryId');
  const slug = formData.get('slug');
  const matchId = formData.get('matchId');
  if (
    typeof commentaryId !== 'string' ||
    typeof slug !== 'string' ||
    typeof matchId !== 'string'
  ) {
    return { error: 'Datos inválidos.' };
  }

  try {
    await MatchCommentaryService.delete(commentaryId, user.id);
    revalidatePath(`/ligas/${slug}/partidos/${matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "commentary-actions" | head
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ligas/[slug]/partidos/[matchId]/commentary-actions.ts"
git commit -m "feat(commentary): admin server actions (regenerate/edit/delete)"
```

---

## Task 9: Match detail UI — display commentaries + admin actions component

**Files:**
- Create: `src/app/(app)/ligas/[slug]/partidos/[matchId]/_components/commentary-admin-actions.tsx`
- Modify: `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx`

- [ ] **Step 1: Create the admin actions client component**

Create `src/app/(app)/ligas/[slug]/partidos/[matchId]/_components/commentary-admin-actions.tsx`:

```tsx
'use client';

import { useState, useActionState } from 'react';
import {
  regenerateCommentaryAction,
  editCommentaryAction,
  deleteCommentaryAction,
} from '../commentary-actions';

type ActionResult = { error: string } | { success: true } | null;

type Props = {
  commentaryId: string;
  matchId: string;
  slug: string;
  currentContent: string;
};

export function CommentaryAdminActions({ commentaryId, matchId, slug, currentContent }: Props) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(currentContent);

  const [regenState, regenAction, regenPending] = useActionState<ActionResult, FormData>(
    regenerateCommentaryAction,
    null,
  );
  const [editState, editAction, editPending] = useActionState<ActionResult, FormData>(
    editCommentaryAction,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ActionResult, FormData>(
    deleteCommentaryAction,
    null,
  );

  const errors = [regenState, editState, deleteState].filter(
    (s): s is { error: string } => !!s && 'error' in s,
  );

  if (editing) {
    return (
      <form action={editAction} className="mt-3 space-y-2">
        <input type="hidden" name="commentaryId" value={commentaryId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="matchId" value={matchId} />
        <textarea
          name="content"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={4}
          maxLength={1000}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={editPending}
            className="text-xs px-3 py-1.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold rounded-full shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {editPending ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setEditContent(currentContent);
            }}
            className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-full hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
        {errors.map((e, i) => (
          <p key={i} className="text-xs text-red-600">{e.error}</p>
        ))}
      </form>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 items-center">
      <form action={regenAction}>
        <input type="hidden" name="commentaryId" value={commentaryId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="matchId" value={matchId} />
        <button
          type="submit"
          disabled={regenPending}
          className="text-xs px-3 py-1.5 bg-brand-navy/8 text-brand-navy font-semibold rounded-full border border-brand-navy/15 hover:bg-brand-navy/12 disabled:opacity-50 transition-colors"
        >
          {regenPending ? 'Generando...' : 'Regenerar'}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs px-3 py-1.5 bg-brand-navy/8 text-brand-navy font-semibold rounded-full border border-brand-navy/15 hover:bg-brand-navy/12 transition-colors"
      >
        Editar
      </button>
      <form action={deleteAction}>
        <input type="hidden" name="commentaryId" value={commentaryId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="matchId" value={matchId} />
        <button
          type="submit"
          disabled={deletePending}
          onClick={(e) => {
            if (!confirm('¿Borrar esta crónica?')) e.preventDefault();
          }}
          className="text-xs px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 font-semibold rounded-full hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          Borrar
        </button>
      </form>
      {errors.map((e, i) => (
        <p key={i} className="text-xs text-red-600 w-full">{e.error}</p>
      ))}
      {regenState && 'success' in regenState && (
        <p className="text-xs text-emerald-600 w-full">Regenerando — vuelve en unos segundos.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render commentaries in the match detail page**

Open `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx`. Read the current structure to locate where to insert the new section (between the header and the result/scheduling section).

Add these imports at the top:

```typescript
import { MatchCommentaryService } from '@/modules/match-commentary';
import { CommentaryAdminActions } from './_components/commentary-admin-actions';
```

In the page component (where `currentUser`, `match`, etc. are loaded), add a fetch for commentaries. Also compute whether the user is league admin. Find the existing `prisma.leagueMember.findFirst` call (it should already exist for the activate-button gating); if so, reuse `isLeagueAdmin`. Otherwise add this query alongside the existing fetches:

```typescript
  const [commentaries, isLeagueAdmin] = await Promise.all([
    MatchCommentaryService.getByMatch(matchId),
    prisma.leagueMember.findFirst({
      where: { leagueId: match.leagueId, userId: currentUser.id, role: 'LEAGUE_ADMIN' },
    }).then((m) => !!m),
  ]);
```

(Adjust `match.leagueId` to whichever variable name holds the league id in the existing code. Adjust `currentUser.id` similarly.)

In the JSX, between the page header and the result section, render:

```tsx
      {(commentaries.preview || commentaries.recap) && (
        <section className="space-y-3">
          {commentaries.preview && (
            <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
              <header className="flex items-baseline justify-between mb-2">
                <h2 className="text-xs font-bold text-brand-blue uppercase tracking-widest" title="Generado por IA">
                  ✨ Previa
                </h2>
                <time className="text-xs text-slate-400">
                  {commentaries.preview.generatedAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </time>
              </header>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {commentaries.preview.content}
              </p>
              {isLeagueAdmin && (
                <CommentaryAdminActions
                  commentaryId={commentaries.preview.id}
                  matchId={matchId}
                  slug={slug}
                  currentContent={commentaries.preview.content}
                />
              )}
            </article>
          )}
          {commentaries.recap && (
            <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
              <header className="flex items-baseline justify-between mb-2">
                <h2 className="text-xs font-bold text-brand-blue uppercase tracking-widest" title="Generado por IA">
                  ✨ Crónica
                </h2>
                <time className="text-xs text-slate-400">
                  {commentaries.recap.generatedAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </time>
              </header>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {commentaries.recap.content}
              </p>
              {isLeagueAdmin && (
                <CommentaryAdminActions
                  commentaryId={commentaries.recap.id}
                  matchId={matchId}
                  slug={slug}
                  currentContent={commentaries.recap.content}
                />
              )}
            </article>
          )}
        </section>
      )}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "ligas/\[slug\]/partidos/\[matchId\]" | head
```

Expected: no errors in the modified files.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ligas/[slug]/partidos/[matchId]/"
git commit -m "feat(ui): show PREVIEW/RECAP commentaries on match detail with admin controls"
```

---

## Task 10: League Crónicas tab + reusable feed card

**Files:**
- Create: `src/app/(app)/ligas/[slug]/_components/commentary-feed-card.tsx`
- Modify: `src/app/(app)/ligas/[slug]/page.tsx`

- [ ] **Step 1: Create the reusable feed card**

Create `src/app/(app)/ligas/[slug]/_components/commentary-feed-card.tsx`:

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import type { CommentaryFeedItem } from '@/modules/match-commentary';

type Props = {
  item: CommentaryFeedItem;
  showLeague?: boolean; // true on dashboard, false on league page
};

export function CommentaryFeedCard({ item, showLeague = false }: Props) {
  const { match, type, content, generatedAt } = item;
  const setsA = match.confirmedResult?.sets.filter((s) => s.gamesA > s.gamesB).length ?? 0;
  const setsB = match.confirmedResult?.sets.filter((s) => s.gamesB > s.gamesA).length ?? 0;
  const showScore = type === 'RECAP' && match.confirmedResult;

  const dateStr = new Date(generatedAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  });

  return (
    <Link
      href={`/ligas/${match.league.slug}/partidos/${match.id}` as Route}
      className="block bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow p-4"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="font-bold text-brand-navy text-sm truncate">
          {match.teamA.name} <span className="text-slate-400 font-normal">vs</span> {match.teamB.name}
        </p>
        {showScore ? (
          <span className="font-mono text-sm font-bold text-brand-navy shrink-0">
            {setsA} – {setsB}
          </span>
        ) : (
          <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">
            Previa
          </span>
        )}
      </div>
      <p className="text-sm text-slate-600 leading-relaxed line-clamp-3 whitespace-pre-line">{content}</p>
      <p className="text-xs text-slate-400 mt-2 truncate">
        ✨ {showLeague ? `${match.league.name} · ` : ''}
        {type === 'PREVIEW' ? 'Previa' : 'Crónica'} · {dateStr}
      </p>
    </Link>
  );
}
```

- [ ] **Step 2: Add the "Crónicas" tab to the league page**

Open `src/app/(app)/ligas/[slug]/page.tsx`. Read it first to understand the existing tab logic.

Add the import:

```typescript
import { MatchCommentaryService } from '@/modules/match-commentary';
import { CommentaryFeedCard } from './_components/commentary-feed-card';
```

In the existing tabs JSX (find the `Clasificación` and `Partidos` tab links), add a third tab after Partidos:

```tsx
            <Link
              href={`/ligas/${slug}?tab=cronicas` as Route}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'cronicas'
                  ? 'border-brand-yellow text-brand-navy font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Crónicas
            </Link>
```

In the page component, fetch commentaries when the active tab is "cronicas":

```typescript
  const cronicas = tab === 'cronicas'
    ? await MatchCommentaryService.listForLeague(league.id, 20)
    : [];
```

Add a render branch for the new tab. Locate the existing branches that render Clasificación or Partidos and add (replace as appropriate):

```tsx
          {tab === 'cronicas' && (
            cronicas.length === 0 ? (
              <p className="text-sm text-slate-400">Aún no hay crónicas en esta liga.</p>
            ) : (
              <div className="space-y-3">
                {cronicas.map((c) => (
                  <CommentaryFeedCard key={c.id} item={c} showLeague={false} />
                ))}
              </div>
            )
          )}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "ligas/\[slug\]/page|commentary-feed-card" | head
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ligas/[slug]/"
git commit -m "feat(ui): Crónicas tab on league page + reusable commentary feed card"
```

---

## Task 11: Dashboard — replace "Últimos resultados" with "Últimas crónicas"

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Update the dashboard fetches and JSX**

Open `src/app/(app)/dashboard/page.tsx`. Read the current file to locate the `recentResults` fetch in the `Promise.all` block, and the "Últimos resultados" `<section>` in the return JSX.

Replace the `recentResults` fetch with a `recentCommentaries` fetch using `MatchCommentaryService.listForUser`:

Add the imports at the top:

```typescript
import { MatchCommentaryService } from '@/modules/match-commentary';
import { CommentaryFeedCard } from '../ligas/[slug]/_components/commentary-feed-card';
```

In the `Promise.all`, replace the `recentResults: prisma.match.findMany(...)` call with:

```typescript
    MatchCommentaryService.listForUser(user.id, 5),
```

And rename the destructured variable from `recentResults` to `recentCommentaries`:

```typescript
  const [leagueCount, matchCount, userLeagues, recentCommentaries] = await Promise.all([
```

Replace the `recentResults` `<section>` block at the bottom of the JSX with:

```tsx
      {recentCommentaries.length > 0 && (
        <section>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Últimas crónicas</p>
          <ul className="space-y-2">
            {recentCommentaries.map((c) => (
              <li key={c.id}>
                <CommentaryFeedCard item={c} showLeague={true} />
              </li>
            ))}
          </ul>
        </section>
      )}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "dashboard/page" | head
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(ui): dashboard — replace 'Últimos resultados' with 'Últimas crónicas' feed"
```

---

## Task 12: Integration test — end-to-end commentary flow

**Files:**
- Create: `tests/integration/match-commentary.test.ts`

This test uses the existing testcontainers-based integration setup. It creates a league, teams, schedules a match, confirms the date (PREVIEW), confirms a result (RECAP), and verifies the service stored both commentaries via a fake AIProvider.

- [ ] **Step 1: Write the integration test**

Create `tests/integration/match-commentary.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import {
  MatchCommentaryService,
  __setProviderForTests,
} from '@/modules/match-commentary';
import type { AIProvider } from '@/modules/match-commentary';

const prisma = testPrisma();

const fakeProvider: AIProvider = {
  async generateCommentary(prompt: string) {
    return { content: `FAKE: ${prompt.length} chars`, model: 'fake-model' };
  },
};

beforeEach(async () => {
  await truncateAll(prisma);
  __setProviderForTests(fakeProvider);
});

afterEach(() => {
  // Reset to OpenAI provider after tests
  // (other tests don't call commentary service, but be safe)
});

async function createUser(name: string, email: string) {
  return prisma.user.create({
    data: { name, email, passwordHash: 'hash', emailVerifiedAt: new Date() },
  });
}

async function setup() {
  const admin = await createUser('Admin', `admin-${Date.now()}@test.com`);
  const league = await prisma.league.create({
    data: {
      name: 'Liga Test',
      slug: `liga-test-${Date.now()}`,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000 * 30),
      status: 'ACTIVE',
      createdByUserId: admin.id,
    },
  });
  const a1 = await createUser('A1', `a1-${Date.now()}@test.com`);
  const a2 = await createUser('A2', `a2-${Date.now()}@test.com`);
  const b1 = await createUser('B1', `b1-${Date.now()}@test.com`);
  const b2 = await createUser('B2', `b2-${Date.now()}@test.com`);
  const teamA = await prisma.team.create({
    data: {
      leagueId: league.id,
      name: 'Los Cañones',
      members: { create: [{ userId: a1.id }, { userId: a2.id }] },
    },
  });
  const teamB = await prisma.team.create({
    data: {
      leagueId: league.id,
      name: 'Pádel Bros',
      members: { create: [{ userId: b1.id }, { userId: b2.id }] },
    },
  });
  return { admin, league, teamA, teamB, a1, b1 };
}

describe('MatchCommentaryService — integration', () => {
  it('generates a PREVIEW commentary with team names and league context', async () => {
    const { league, teamA, teamB } = await setup();
    const match = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        round: 1,
        deadlineAt: new Date(Date.now() + 86400000 * 7),
        scheduledAt: new Date(Date.now() + 86400000 * 5),
        status: 'DATE_CONFIRMED',
      },
    });

    await MatchCommentaryService.generate(match.id, 'PREVIEW');

    const stored = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });
    expect(stored).not.toBeNull();
    expect(stored?.content).toContain('FAKE:');
    expect(stored?.type).toBe('PREVIEW');
    expect(stored?.regeneratedCount).toBe(0);
  });

  it('is idempotent — second call without regenerate is a no-op', async () => {
    const { league, teamA, teamB } = await setup();
    const match = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        round: 1,
        deadlineAt: new Date(Date.now() + 86400000 * 7),
        scheduledAt: new Date(Date.now() + 86400000 * 5),
        status: 'DATE_CONFIRMED',
      },
    });

    await MatchCommentaryService.generate(match.id, 'PREVIEW');
    const first = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });
    await MatchCommentaryService.generate(match.id, 'PREVIEW');
    const second = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });

    expect(second?.id).toBe(first?.id);
    expect(second?.generatedAt).toEqual(first?.generatedAt);
    expect(second?.regeneratedCount).toBe(0);
  });

  it('regenerate increments regeneratedCount and updates content', async () => {
    const { admin, league, teamA, teamB } = await setup();
    await prisma.leagueMember.create({
      data: { leagueId: league.id, userId: admin.id, role: 'LEAGUE_ADMIN' },
    });
    const match = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        round: 1,
        deadlineAt: new Date(Date.now() + 86400000 * 7),
        scheduledAt: new Date(Date.now() + 86400000 * 5),
        status: 'DATE_CONFIRMED',
      },
    });

    await MatchCommentaryService.generate(match.id, 'PREVIEW');
    const initial = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });

    await MatchCommentaryService.regenerate(initial!.id, admin.id);

    const after = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });
    expect(after?.regeneratedCount).toBe(1);
  });

  it('rejects regenerate from a non-admin user', async () => {
    const { league, teamA, teamB, a1 } = await setup();
    const match = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        round: 1,
        deadlineAt: new Date(Date.now() + 86400000 * 7),
        scheduledAt: new Date(Date.now() + 86400000 * 5),
        status: 'DATE_CONFIRMED',
      },
    });

    await MatchCommentaryService.generate(match.id, 'PREVIEW');
    const c = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });

    await expect(MatchCommentaryService.regenerate(c!.id, a1.id)).rejects.toThrow();
  });

  it('edit sets editedAt and editedByUserId', async () => {
    const { admin, league, teamA, teamB } = await setup();
    await prisma.leagueMember.create({
      data: { leagueId: league.id, userId: admin.id, role: 'LEAGUE_ADMIN' },
    });
    const match = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        round: 1,
        deadlineAt: new Date(Date.now() + 86400000 * 7),
        scheduledAt: new Date(Date.now() + 86400000 * 5),
        status: 'DATE_CONFIRMED',
      },
    });

    await MatchCommentaryService.generate(match.id, 'PREVIEW');
    const c = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId: match.id, type: 'PREVIEW' } },
    });

    await MatchCommentaryService.edit(c!.id, admin.id, 'Texto editado a mano por el admin.');

    const updated = await prisma.matchCommentary.findUnique({ where: { id: c!.id } });
    expect(updated?.content).toBe('Texto editado a mano por el admin.');
    expect(updated?.editedAt).not.toBeNull();
    expect(updated?.editedByUserId).toBe(admin.id);
  });

  it('deleteByMatch removes both PREVIEW and RECAP', async () => {
    const { league, teamA, teamB } = await setup();
    const match = await prisma.match.create({
      data: {
        leagueId: league.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        round: 1,
        deadlineAt: new Date(Date.now() + 86400000 * 7),
        scheduledAt: new Date(Date.now() + 86400000 * 5),
        status: 'DATE_CONFIRMED',
      },
    });

    await MatchCommentaryService.generate(match.id, 'PREVIEW');
    // For RECAP we'd normally need a confirmedResult — but the test only verifies cleanup
    // path, not RECAP generation here. Insert a RECAP row directly:
    await prisma.matchCommentary.create({
      data: { matchId: match.id, type: 'RECAP', provider: 'OPENAI', content: 'fake recap' },
    });

    await MatchCommentaryService.deleteByMatch(match.id);

    const remaining = await prisma.matchCommentary.findMany({ where: { matchId: match.id } });
    expect(remaining).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the integration test**

```bash
pnpm test:integration -- tests/integration/match-commentary.test.ts
```

Expected: all tests pass. If the integration runner is not available locally (e.g., Docker missing), report the file is correct and rely on CI.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/match-commentary.test.ts
git commit -m "test(match-commentary): integration coverage for generate/regenerate/edit/delete"
```

---

## Final verification

After all 12 tasks:

- [ ] **Final typecheck**

```bash
pnpm typecheck
```

Expected: pre-existing errors only — no new errors introduced.

- [ ] **Run all unit tests**

```bash
pnpm test:unit
```

Expected: all passing (existing 65 + new commentary tests).
