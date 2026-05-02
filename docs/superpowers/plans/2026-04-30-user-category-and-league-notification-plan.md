# User category + league registration-open notification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-30-user-category-and-league-notification-design.md`

**Goal:** Ship `User.category` (padel level), sync it from team category-change proposals, and push an in-app notification to every level-matching user when a league enters its registration period.

**Architecture:** Two schema migrations (one regular DDL, one isolated `ADD VALUE` for the enum), one new service (`LeagueNotificationService`), a one-line extension of the daily cron (`/api/cron/heartbeat`), a sync hook inside the existing `CategoryProposalService._resolve`, and a `<select>` in `/perfil`. Idempotency rests on `League.registrationOpenNotifiedAt`. Existing already-open leagues are marked notified during the migration to suppress retroactive spam.

**Tech Stack:** Next.js 15 App Router, React 18, Prisma 5, Postgres, pg-boss (already in use for the cron), Vitest (unit + integration with testcontainers), Tailwind. Reuses the existing `TeamCategory` enum for users.

---

## File Structure

**Created:**

- `prisma/migrations/<ts>_add_user_category_and_league_notified_at/migration.sql`
- `prisma/migrations/<ts>_add_league_registration_open_notification_type/migration.sql`
- `src/modules/leagues/application/league-notification-service.ts`
- `tests/unit/modules/leagues/league-notification-service.test.ts`
- `tests/integration/league-registration-open-notification.test.ts`

**Modified:**

- `prisma/schema.prisma` — three additions (column on User, column on League, enum value on NotificationType).
- `src/modules/leagues/application/category-proposal-service.ts` — propagate accepted proposal to team members' `User.category`.
- `src/modules/leagues/index.ts` — re-export `LeagueNotificationService`.
- `src/app/(app)/perfil/page.tsx` — render the level select; load `category` from the user record.
- `src/app/(app)/perfil/actions.ts` — `updateProfileAction` accepts `category`.
- `src/app/api/cron/heartbeat/route.ts` — append the notification trigger loop.

**Not changed:**

- `vercel.json` — does not exist; the heartbeat cron is configured via the Vercel dashboard. The new logic piggybacks on the existing schedule.

---

## Task 1 — Migration: `User.category` + `League.registrationOpenNotifiedAt`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_add_user_category_and_league_notified_at/migration.sql`

- [ ] **Step 1: Update `prisma/schema.prisma`**

In `model User`, add (place near other simple scalar columns, e.g. after `role`):

```prisma
  category TeamCategory @default(INTERMEDIATE) @map("category")
```

The `TeamCategory` enum (`BEGINNER | INTERMEDIATE | ADVANCED`) already exists; reusing it for users.

In `model League`, add:

```prisma
  registrationOpenNotifiedAt DateTime? @map("registration_open_notified_at")
```

- [ ] **Step 2: Generate the migration**

Try Prisma first; if docker is unavailable, fall back to manual file (see existing pattern in earlier migrations like `20260430105614_enable_unaccent`).

```bash
pnpm prisma migrate dev --name add_user_category_and_league_notified_at --create-only
```

If docker is unavailable, manually create `prisma/migrations/20260430213000_add_user_category_and_league_notified_at/migration.sql`:

```sql
-- AlterTable: add User.category with default INTERMEDIATE
ALTER TABLE "users" ADD COLUMN "category" "TeamCategory" NOT NULL DEFAULT 'INTERMEDIATE';

-- AlterTable: add League.registrationOpenNotifiedAt (nullable)
ALTER TABLE "leagues" ADD COLUMN "registration_open_notified_at" TIMESTAMP(3);

-- Backfill: existing leagues whose registration is already open get marked
-- as notified, so the upcoming cron does NOT send retroactive notifications.
UPDATE "leagues"
   SET "registration_open_notified_at" = NOW()
 WHERE "registration_start" <= NOW();
```

- [ ] **Step 3: Regenerate Prisma client**

```bash
pnpm prisma generate
```

- [ ] **Step 4: Apply locally if docker is available**

```bash
pnpm prisma migrate dev
```
If docker is unavailable, skip — the migration runs on Vercel deploy.

- [ ] **Step 5: Verify typecheck stays green**

```bash
pnpm typecheck
```
Expected: GREEN. New columns are optional or have defaults so no consumer is forced to change yet.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): add User.category and League.registrationOpenNotifiedAt"
```

---

## Task 2 — Migration: `LEAGUE_REGISTRATION_OPEN` enum value

Postgres restriction: `ALTER TYPE … ADD VALUE` cannot run inside a transaction in some Postgres versions. Keep it in its own migration so the runner does not bundle it with DDL that would force a transaction.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_add_league_registration_open_notification_type/migration.sql`

- [ ] **Step 1: Update `prisma/schema.prisma`**

In `enum NotificationType`, add the value:

```prisma
enum NotificationType {
  // … existing values
  LEAGUE_REGISTRATION_OPEN
}
```

(Place it next to the league-related types if a group exists; otherwise at the end.)

- [ ] **Step 2: Create the migration manually**

`prisma/migrations/20260430213100_add_league_registration_open_notification_type/migration.sql`:

```sql
ALTER TYPE "NotificationType" ADD VALUE 'LEAGUE_REGISTRATION_OPEN';
```

- [ ] **Step 3: Regenerate Prisma client**

```bash
pnpm prisma generate
pnpm typecheck
```
Expected: GREEN.

- [ ] **Step 4: Apply locally if docker is available**

```bash
pnpm prisma migrate dev
```
Skip if docker is unavailable.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): add LEAGUE_REGISTRATION_OPEN to NotificationType enum"
```

---

## Task 3 — Sync `User.category` when a team's category proposal is accepted

**Files:**
- Modify: `src/modules/leagues/application/category-proposal-service.ts`
- Modify or create: `tests/unit/modules/leagues/category-proposal-service.test.ts`

- [ ] **Step 1: Add the user-sync inside `_resolve`'s ACCEPTED branch**

Open `src/modules/leagues/application/category-proposal-service.ts`. Locate the `_resolve` method (near the bottom of the file). Inside the `await prisma.$transaction(async (tx) => { … })`, the existing code looks like:

```ts
await tx.teamCategoryChangeProposal.update({
  where: { id: proposalId },
  data: { status: decision, resolvedByUserId: userId, resolvedAt: new Date() },
});
if (decision === 'ACCEPTED') {
  await tx.team.update({
    where: { id: proposal.teamId },
    data: { category: proposal.toCategory },
  });
}
```

Replace the `if (decision === 'ACCEPTED') { … }` block with:

```ts
if (decision === 'ACCEPTED') {
  await tx.team.update({
    where: { id: proposal.teamId },
    data: { category: proposal.toCategory },
  });
  // Push the new level to every member of the team. Last write wins for users
  // belonging to multiple teams of different levels — accepted in spec Q1.
  const memberIds = proposal.team.members.map((m) => m.userId);
  if (memberIds.length > 0) {
    await tx.user.updateMany({
      where: { id: { in: memberIds } },
      data: { category: proposal.toCategory },
    });
  }
}
```

- [ ] **Step 2: Write a unit test for the sync**

Create or extend `tests/unit/modules/leagues/category-proposal-service.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoryProposalService } from '@/modules/leagues/application/category-proposal-service';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    teamCategoryChangeProposal: { findUnique: vi.fn(), update: vi.fn() },
    team: { update: vi.fn() },
    user: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    teamCategoryChangeProposal: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    team: { update: ReturnType<typeof vi.fn> };
    user: { updateMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

describe('CategoryProposalService — accept syncs members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the team and pushes the new category to every member when accepted', async () => {
    const prisma = await getPrisma();
    prisma.teamCategoryChangeProposal.findUnique.mockResolvedValue({
      id: 'p1',
      teamId: 't1',
      status: 'PROPOSED',
      toCategory: 'ADVANCED',
      team: { id: 't1', members: [{ userId: 'u1' }, { userId: 'u2' }] },
    });
    // $transaction passes a tx object that exposes the same prisma surface used inside.
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        teamCategoryChangeProposal: { update: prisma.teamCategoryChangeProposal.update },
        team: { update: prisma.team.update },
        user: { updateMany: prisma.user.updateMany },
      }),
    );

    await CategoryProposalService.accept('p1', 'u1');

    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { category: 'ADVANCED' },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1', 'u2'] } },
      data: { category: 'ADVANCED' },
    });
  });

  it('does NOT touch team or users when the proposal is rejected', async () => {
    const prisma = await getPrisma();
    prisma.teamCategoryChangeProposal.findUnique.mockResolvedValue({
      id: 'p1',
      teamId: 't1',
      status: 'PROPOSED',
      toCategory: 'ADVANCED',
      team: { id: 't1', members: [{ userId: 'u1' }] },
    });
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        teamCategoryChangeProposal: { update: prisma.teamCategoryChangeProposal.update },
        team: { update: prisma.team.update },
        user: { updateMany: prisma.user.updateMany },
      }),
    );

    await CategoryProposalService.reject('p1', 'u1');

    expect(prisma.team.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the unit tests**

```bash
pnpm test:unit -- tests/unit/modules/leagues/category-proposal-service.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/modules/leagues/application/category-proposal-service.ts \
        tests/unit/modules/leagues/category-proposal-service.test.ts
git commit -m "feat(leagues): sync User.category to team members when proposal accepted"
```

---

## Task 4 — Profile editor: `<select>` for level + extend action

**Files:**
- Modify: `src/app/(app)/perfil/actions.ts`
- Modify: `src/app/(app)/perfil/page.tsx`

- [ ] **Step 1: Extend `updateProfileAction`**

Open `src/app/(app)/perfil/actions.ts`. Replace `updateProfileAction` with:

```ts
import { CATEGORY_VALUES } from '@/modules/leagues/presentation/category';

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'El nombre no puede estar vacío.').max(100),
  category: z.enum(CATEGORY_VALUES),
});

export async function updateProfileAction(
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const parsed = updateProfileSchema.safeParse({
    name: typeof formData.get('name') === 'string' ? formData.get('name') : '',
    category: formData.get('category'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { error: 'No autenticado.' };

  try {
    const user = await getValidatedSession(token);
    await prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name, category: parsed.data.category },
    });
    revalidatePath('/perfil');
    return { success: 'Perfil actualizado.' };
  } catch (err) {
    logger().error({ err }, 'update-profile.unexpected');
    return { error: 'Error inesperado.' };
  }
}
```

(Existing imports `cookies`, `SESSION_COOKIE`, `getValidatedSession`, `prisma`, `logger`, `z` already present. Add `CATEGORY_VALUES` import as shown.)

- [ ] **Step 2: Update `/perfil/page.tsx` to load and render the category**

Open `src/app/(app)/perfil/page.tsx`. The page already does:

```ts
const user = await prisma.user.findUniqueOrThrow({
  where: { id: sessionUser.id },
  select: { id: true, name: true, email: true, avatarUrl: true },
});
```

Change the select to include `category`:

```ts
select: { id: true, name: true, email: true, avatarUrl: true, category: true },
```

Add the imports near the top:

```tsx
import { CATEGORY_VALUES, CATEGORY_LABEL } from '@/modules/leagues/presentation/category';
```

Inside the "Datos personales" form, immediately AFTER the `Nombre y apellido` `<div>` and BEFORE the `Email` `<div>`, insert:

```tsx
<div>
  <label className="block text-sm font-medium text-slate-700 mb-1">Nivel</label>
  <select
    name="category"
    defaultValue={user.category}
    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
  >
    {CATEGORY_VALUES.map((c) => (
      <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
    ))}
  </select>
  <p className="text-[11px] text-slate-400 mt-1">Recibirás notificaciones de ligas de tu nivel.</p>
</div>
```

- [ ] **Step 3: Run typecheck and unit tests**

```bash
pnpm typecheck
pnpm test:unit
```
Expected: GREEN.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/perfil/page.tsx" "src/app/(app)/perfil/actions.ts"
git commit -m "feat(perfil): allow user to set their padel level"
```

---

## Task 5 — `LeagueNotificationService.notifyRegistrationOpen` + unit test

**Files:**
- Create: `src/modules/leagues/application/league-notification-service.ts`
- Modify: `src/modules/leagues/index.ts`
- Create: `tests/unit/modules/leagues/league-notification-service.test.ts`

- [ ] **Step 1: Create the service file**

`src/modules/leagues/application/league-notification-service.ts`:

```ts
import { prisma } from '@/shared/db/client';
import { CATEGORY_LABEL } from '../domain/category';

export const LeagueNotificationService = {
  /**
   * Idempotent. Notifies every alive user whose `User.category` matches the
   * league's category and marks the league as notified. Safe to call multiple
   * times — only the first call (when `registrationOpenNotifiedAt` is null)
   * actually creates notifications.
   */
  async notifyRegistrationOpen(leagueId: string): Promise<{ recipients: number }> {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        registrationOpenNotifiedAt: true,
      },
    });
    if (!league || league.registrationOpenNotifiedAt !== null) {
      return { recipients: 0 };
    }

    const recipients = await prisma.user.findMany({
      where: { category: league.category, deletedAt: null },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      if (recipients.length > 0) {
        await tx.notification.createMany({
          data: recipients.map((r) => ({
            userId: r.id,
            type: 'LEAGUE_REGISTRATION_OPEN' as const,
            title: 'Nueva liga abierta',
            body: `Se ha abierto la inscripción de "${league.name}" (${CATEGORY_LABEL[league.category]}).`,
            metadata: { leagueId: league.id, leagueSlug: league.slug },
          })),
        });
      }
      await tx.league.update({
        where: { id: leagueId },
        data: { registrationOpenNotifiedAt: new Date() },
      });
    });

    return { recipients: recipients.length };
  },
} as const;
```

- [ ] **Step 2: Re-export from `src/modules/leagues/index.ts`**

Add at the end of the file:

```ts
export { LeagueNotificationService } from './application/league-notification-service';
```

- [ ] **Step 3: Write the unit test**

`tests/unit/modules/leagues/league-notification-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeagueNotificationService } from '@/modules/leagues';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    league: { findUnique: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    league: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    user: { findMany: ReturnType<typeof vi.fn> };
    notification: { createMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

function passThroughTx(prisma: Awaited<ReturnType<typeof getPrisma>>) {
  prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      league: { update: prisma.league.update },
      notification: { createMany: prisma.notification.createMany },
    }),
  );
}

describe('LeagueNotificationService.notifyRegistrationOpen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifies every matching user and marks the league as notified', async () => {
    const prisma = await getPrisma();
    prisma.league.findUnique.mockResolvedValue({
      id: 'l1',
      name: 'Liga Otoño',
      slug: 'liga-otono',
      category: 'INTERMEDIATE',
      registrationOpenNotifiedAt: null,
    });
    prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
    passThroughTx(prisma);

    const result = await LeagueNotificationService.notifyRegistrationOpen('l1');

    expect(result).toEqual({ recipients: 2 });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { category: 'INTERMEDIATE', deletedAt: null },
      select: { id: true },
    });
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany.mock.calls[0]![0].data).toHaveLength(2);
    expect(prisma.league.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { registrationOpenNotifiedAt: expect.any(Date) },
    });
  });

  it('is a no-op when the league already has registrationOpenNotifiedAt set', async () => {
    const prisma = await getPrisma();
    prisma.league.findUnique.mockResolvedValue({
      id: 'l1',
      name: 'Liga Otoño',
      slug: 'liga-otono',
      category: 'INTERMEDIATE',
      registrationOpenNotifiedAt: new Date('2026-04-01'),
    });

    const result = await LeagueNotificationService.notifyRegistrationOpen('l1');

    expect(result).toEqual({ recipients: 0 });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.league.update).not.toHaveBeenCalled();
  });

  it('marks the league notified even when no users match', async () => {
    const prisma = await getPrisma();
    prisma.league.findUnique.mockResolvedValue({
      id: 'l1',
      name: 'Liga Otoño',
      slug: 'liga-otono',
      category: 'ADVANCED',
      registrationOpenNotifiedAt: null,
    });
    prisma.user.findMany.mockResolvedValue([]);
    passThroughTx(prisma);

    const result = await LeagueNotificationService.notifyRegistrationOpen('l1');

    expect(result).toEqual({ recipients: 0 });
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.league.update).toHaveBeenCalledTimes(1);
  });

  it('returns 0 recipients when the league does not exist', async () => {
    const prisma = await getPrisma();
    prisma.league.findUnique.mockResolvedValue(null);

    const result = await LeagueNotificationService.notifyRegistrationOpen('missing');

    expect(result).toEqual({ recipients: 0 });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.league.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run unit tests**

```bash
pnpm test:unit -- tests/unit/modules/leagues/league-notification-service.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/leagues/application/league-notification-service.ts \
        src/modules/leagues/index.ts \
        tests/unit/modules/leagues/league-notification-service.test.ts
git commit -m "feat(leagues): LeagueNotificationService.notifyRegistrationOpen"
```

---

## Task 6 — Cron extension: trigger the notification

**Files:**
- Modify: `src/app/api/cron/heartbeat/route.ts`

- [ ] **Step 1: Extend the heartbeat route**

Open `src/app/api/cron/heartbeat/route.ts`. Add the import at the top with the other module imports:

```ts
import { LeagueNotificationService } from '@/modules/leagues';
```

Add this block AFTER the league-finalize block (around line 52, just before the `return NextResponse.json(...)`):

```ts
// Notify level-matching users when a league enters its registration window.
// Idempotent: LeagueNotificationService gates on registrationOpenNotifiedAt.
const notifiedLeagueIds: string[] = [];
try {
  const dueLeagues = await prisma.league.findMany({
    where: {
      registrationStart: { lte: new Date() },
      registrationOpenNotifiedAt: null,
    },
    select: { id: true },
  });
  for (const l of dueLeagues) {
    const { recipients } = await LeagueNotificationService.notifyRegistrationOpen(l.id);
    notifiedLeagueIds.push(l.id);
    log.info({ leagueId: l.id, recipients }, 'cron.league-registration-open.notified');
  }
} catch (err) {
  log.warn({ err }, 'cron.league-registration-open.error');
}
```

Update the final `return` to include the count:

```ts
return NextResponse.json({
  ok: true,
  jobId: noopId,
  leaguesToFinalize: finalizeIds.length,
  registrationOpenNotified: notifiedLeagueIds.length,
});
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: GREEN.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/heartbeat/route.ts
git commit -m "feat(cron): notify users when a league registration period opens"
```

---

## Task 7 — Integration test (real DB through testcontainers)

**Files:**
- Create: `tests/integration/league-registration-open-notification.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { LeagueNotificationService } from '@/modules/leagues';

const prisma = testPrisma();

async function user(name: string, suffix: string, category: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED', deleted = false) {
  return prisma.user.create({
    data: {
      name,
      email: `${suffix}@t.com`,
      passwordHash: 'h',
      emailVerifiedAt: new Date(),
      category,
      deletedAt: deleted ? new Date() : null,
    },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('LeagueNotificationService.notifyRegistrationOpen — integration', () => {
  it('only notifies alive users with matching category and is idempotent', async () => {
    const admin = await user('Admin', `adm-${Date.now()}`, 'INTERMEDIATE');
    const matchA = await user('Match A', `ma-${Date.now()}`, 'INTERMEDIATE');
    const matchB = await user('Match B', `mb-${Date.now()}`, 'INTERMEDIATE');
    const wrongLevel = await user('Avanzado', `av-${Date.now()}`, 'ADVANCED');
    const deleted = await user('Deleted', `del-${Date.now()}`, 'INTERMEDIATE', true);

    const league = await prisma.league.create({
      data: {
        name: 'Liga Otoño',
        slug: `liga-otono-${Date.now()}`,
        category: 'INTERMEDIATE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000 * 30),
        registrationStart: new Date(),
        registrationEnd: new Date(Date.now() + 86400000 * 7),
        status: 'DRAFT',
        createdByUserId: admin.id,
      },
    });

    const first = await LeagueNotificationService.notifyRegistrationOpen(league.id);
    expect(first.recipients).toBe(3); // admin + matchA + matchB; wrongLevel excluded by category, deleted excluded by deletedAt

    const notifs = await prisma.notification.findMany({
      where: { type: 'LEAGUE_REGISTRATION_OPEN' },
      select: { userId: true },
    });
    const ids = notifs.map((n) => n.userId).sort();
    expect(ids).toEqual([admin.id, matchA.id, matchB.id].sort());
    expect(ids).not.toContain(wrongLevel.id);
    expect(ids).not.toContain(deleted.id);

    const reloaded = await prisma.league.findUniqueOrThrow({ where: { id: league.id } });
    expect(reloaded.registrationOpenNotifiedAt).not.toBeNull();

    const second = await LeagueNotificationService.notifyRegistrationOpen(league.id);
    expect(second.recipients).toBe(0);

    const notifsAfter = await prisma.notification.count({
      where: { type: 'LEAGUE_REGISTRATION_OPEN' },
    });
    expect(notifsAfter).toBe(3);
  });
});
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: GREEN. Tests do not run locally without docker — they execute in CI / on Vercel preview.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/league-registration-open-notification.test.ts
git commit -m "test(leagues): integration test for registration-open notification"
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

Vercel runs `prisma migrate deploy`, applying the two new migrations:
- The User.category column gets default INTERMEDIATE (backfilled by Postgres).
- The League column gets created and the in-migration UPDATE marks already-open leagues as notified.
- The enum value is added to NotificationType.

- [ ] **Step 3: Manual smoke after deploy**

1. Open `/perfil`. Confirm the new "Nivel" select is rendered with the user's current category. Change it, save, reload — value persists.
2. As super-admin, accept a pending team category-change proposal (if there is one in production). Confirm the team's members now have the new `User.category` (check via `/admin/usuarios/<id>`).
3. Create a new league with `registrationStart = today` and verify, on the next cron tick (or trigger heartbeat manually), that level-matching users receive a `LEAGUE_REGISTRATION_OPEN` notification (visible in the bell at the top right).
4. Trigger the cron a second time; no new notifications appear (idempotent gate works).

---

## Risks and follow-ups

- **`ADD VALUE` not transactional**: Postgres ≥ 12 supports `ALTER TYPE … ADD VALUE` outside a transaction. Prisma's migration runner usually wraps each migration in a transaction, but for `ADD VALUE` it omits the wrapping when it detects the statement. If Vercel's Postgres rejects it, the workaround is to add `-- prisma+suppressforeign:` or split into a script — handle if it occurs.
- **Notification table growth**: a popular league of INTERMEDIATE players could create hundreds of notifications. The bell endpoint already paginates; no special action.
- **Already-open leagues backfill**: only marks leagues with `registration_start <= now()` as notified. Leagues whose registration starts in the future stay null and will be picked up by the cron at the right time.
- **Multi-team users**: `User.category` is overwritten by the most recent accepted proposal — documented in spec Q1.
- **No reverse sync**: a user editing their own level in `/perfil` does not affect the team's category. By design.
