# Team Invitation Typeahead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-30-team-invite-by-name-design.md`

**Goal:** Replace the "Email o nombre del jugador" free-text input on the team detail page with a name-only typeahead that searches existing users via a scoped `/api/users/search` endpoint, and remove email visibility from the team detail flow.

**Architecture:** A new `GET /api/users/search` route returns user candidates filtered server-side (excluding caller, current members, pending invitees, soft-deleted). A custom client typeahead drives a hidden `invitedUserId` field. The team service drops email/name resolution and accepts a user id directly. Email is removed from the team detail page.

**Tech Stack:** Next.js 15 App Router, React 18, Prisma 5, Postgres + `unaccent` extension, Zod, Vitest (unit + integration with testcontainers), Tailwind.

---

## File Structure

**Created:**
- `prisma/migrations/<timestamp>_enable_unaccent/migration.sql` — enables Postgres `unaccent`.
- `src/modules/users/application/user-search-service.ts` — `UserSearchService.searchCandidates({ q, teamId, callerId })` with the unaccent SQL.
- `src/app/api/users/search/route.ts` — thin `GET ?q=&teamId=` wrapper over the service (auth + team-membership + rate-limit, no business SQL).
- `src/app/(app)/equipos/[id]/_components/user-search-picker.tsx` — typeahead client component.
- `tests/unit/modules/teams/team-service.test.ts` — unit tests for `TeamService.invite` (folder doesn't exist yet).
- `tests/integration/user-search.test.ts` — integration tests for `UserSearchService.searchCandidates`.

**Modified:**
- `src/modules/users/index.ts` — re-export `UserSearchService`.
- `src/modules/teams/domain/types.ts` — `InviteInput.invitedUserIdentifier` → `invitedUserId`.
- `src/modules/teams/application/team-service.ts` — `invite()` accepts user id; remove `resolveUserByIdentifier`.
- `src/app/(app)/equipos/actions.ts` — schema validates `invitedUserId` (CUID).
- `src/app/(app)/equipos/[id]/invite-form.tsx` — replace input with `<UserSearchPicker>`.
- `src/app/(app)/equipos/[id]/page.tsx` — remove email `<span>` from members list and pending invitations list.

---

## Task 1 — Enable Postgres `unaccent` extension

**Files:**
- Create: `prisma/migrations/<timestamp>_enable_unaccent/migration.sql`

- [ ] **Step 1: Make sure local Postgres is running**

Run:
```bash
docker compose up -d
```
Expected: a healthy `postgres` container. If `docker-compose.yml` is the project root file, this brings up the dev DB.

- [ ] **Step 2: Generate the empty migration**

Run:
```bash
pnpm prisma migrate dev --name enable_unaccent --create-only
```
Expected: a new folder `prisma/migrations/<timestamp>_enable_unaccent/` with an empty `migration.sql` inside.

- [ ] **Step 3: Write the SQL**

Replace the contents of `migration.sql` with:
```sql
-- Enable the unaccent extension to allow accent-insensitive name search.
-- Idempotent: no-op if the extension is already installed.
CREATE EXTENSION IF NOT EXISTS unaccent;
```

- [ ] **Step 4: Apply the migration locally**

Run:
```bash
pnpm prisma migrate dev
```
Expected: "Database is now in sync with your Prisma schema." Prisma will run the new migration.

- [ ] **Step 5: Smoke check the function exists**

Run:
```bash
docker compose exec postgres psql -U padel -d padel_league -c "SELECT unaccent('José') AS r;"
```
Expected output:
```
   r
------
 Jose
```

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations
git commit -m "feat(db): enable unaccent extension for accent-insensitive user search"
```

---

## Task 2 — Update `InviteInput` type

**Files:**
- Modify: `src/modules/teams/domain/types.ts`

- [ ] **Step 1: Replace the `InviteInput` definition**

In `src/modules/teams/domain/types.ts`, replace:
```ts
export type InviteInput = {
  teamId: string;
  invitedByUserId: string;
  /** email or username (we resolve to userId in the service). */
  invitedUserIdentifier: string;
};
```

with:
```ts
export type InviteInput = {
  teamId: string;
  invitedByUserId: string;
  /** Resolved user id of the invitee. */
  invitedUserId: string;
};
```

- [ ] **Step 2: Run typecheck (will fail, by design)**

Run:
```bash
pnpm typecheck
```
Expected: failures inside `team-service.ts` and `equipos/actions.ts` referring to `invitedUserIdentifier`. We'll fix those in tasks 3-4.

- [ ] **Step 3: No commit yet** — leaving the typecheck red is intentional. We commit tasks 2-4 together at the end of task 4.

---

## Task 3 — Refactor `TeamService.invite` to take `invitedUserId`

**Files:**
- Modify: `src/modules/teams/application/team-service.ts`
- Create: `tests/unit/modules/teams/team-service.test.ts`

- [ ] **Step 1: Add the unit tests folder for teams**

Create the file path `tests/unit/modules/teams/team-service.test.ts`. The folder doesn't exist yet, so the file creation makes it.

- [ ] **Step 2: Write failing unit tests**

In `tests/unit/modules/teams/team-service.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamService } from '@/modules/teams';

vi.mock('@/shared/db/client', () => {
  const findUnique = vi.fn();
  const findFirst = vi.fn();
  const create = vi.fn();
  const txCreate = vi.fn();
  const txFindUnique = vi.fn();
  const transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      teamInvitation: { create: txCreate },
      user: { findUnique: txFindUnique },
      notification: { create: vi.fn() },
    }),
  );
  return {
    prisma: {
      team: { findUnique, findFirst },
      teamInvitation: { create },
      teamMember: { findFirst: vi.fn() },
      $transaction: transaction,
    },
  };
});

describe('TeamService.invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects self-invite', async () => {
    const { prisma } = await import('@/shared/db/client');
    (prisma.teamMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1' });
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      members: [{ userId: 'u1' }],
      invitations: [],
    });

    await expect(
      TeamService.invite({ teamId: 't1', invitedByUserId: 'u1', invitedUserId: 'u1' }),
    ).rejects.toThrow(/ti mismo/i);
  });

  it('rejects when invitee is already a member', async () => {
    const { prisma } = await import('@/shared/db/client');
    (prisma.teamMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1' });
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      members: [{ userId: 'u1' }, { userId: 'u2' }],
      invitations: [],
    });

    await expect(
      TeamService.invite({ teamId: 't1', invitedByUserId: 'u1', invitedUserId: 'u2' }),
    ).rejects.toThrow(/ya es miembro/i);
  });

  it('rejects when there is already a pending invitation for that user', async () => {
    const { prisma } = await import('@/shared/db/client');
    (prisma.teamMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1' });
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      members: [{ userId: 'u1' }],
      invitations: [{ invitedUserId: 'u2' }],
    });

    await expect(
      TeamService.invite({ teamId: 't1', invitedByUserId: 'u1', invitedUserId: 'u2' }),
    ).rejects.toThrow(/pendiente/i);
  });

  it('rejects when team is full', async () => {
    const { prisma } = await import('@/shared/db/client');
    (prisma.teamMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1' });
    (prisma.team.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      members: [{ userId: 'u1' }, { userId: 'u3' }],
      invitations: [],
    });

    await expect(
      TeamService.invite({ teamId: 't1', invitedByUserId: 'u1', invitedUserId: 'u2' }),
    ).rejects.toThrow(/completo/i);
  });
});
```

- [ ] **Step 3: Run the new tests — they should fail**

Run:
```bash
pnpm test:unit -- tests/unit/modules/teams/team-service.test.ts
```
Expected: tests fail because the service still expects `invitedUserIdentifier` and the new tests pass `invitedUserId`.

- [ ] **Step 4: Refactor the service**

In `src/modules/teams/application/team-service.ts`:

a) Remove the `resolveUserByIdentifier` helper (lines ~28-39):
```ts
async function resolveUserByIdentifier(identifier: string): Promise<{ id: string; name: string; email: string } | null> {
  // ... entire function
}
```
Delete it completely.

b) Replace the `invite` method body. Current code (lines ~149-207) should become:
```ts
  async invite(input: InviteInput): Promise<{ id: string }> {
    await ensureMember(input.teamId, input.invitedByUserId);

    const team = await prisma.team.findUnique({
      where: { id: input.teamId },
      include: {
        members: { select: { userId: true } },
        invitations: { where: { status: 'PENDING' }, select: { invitedUserId: true } },
      },
    });
    if (!team) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');

    if (team.members.length >= MAX_TEAM_SIZE) {
      throw new DomainError('TEAM_FULL', 'El equipo ya está completo.');
    }
    const slotsAvailable = MAX_TEAM_SIZE - team.members.length;
    if (team.invitations.length >= slotsAvailable) {
      throw new DomainError('INVITATION_LIMIT', 'Ya hay una invitación pendiente para este equipo.');
    }

    if (input.invitedUserId === input.invitedByUserId) {
      throw new DomainError('CANNOT_INVITE_SELF', 'No puedes invitarte a ti mismo.');
    }

    const invitee = await prisma.user.findUnique({
      where: { id: input.invitedUserId },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!invitee || invitee.deletedAt !== null) {
      throw new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado.');
    }

    if (team.members.some((m) => m.userId === invitee.id)) {
      throw new ConflictError('ALREADY_MEMBER', 'Ese usuario ya es miembro del equipo.');
    }
    if (team.invitations.some((i) => i.invitedUserId === invitee.id)) {
      throw new ConflictError('INVITATION_EXISTS', 'Ya hay una invitación pendiente para ese usuario.');
    }

    const invitation = await prisma.$transaction(async (tx) => {
      const inv = await tx.teamInvitation.create({
        data: {
          teamId: input.teamId,
          invitedUserId: invitee.id,
          invitedByUserId: input.invitedByUserId,
        },
      });
      const inviter = await tx.user.findUnique({
        where: { id: input.invitedByUserId },
        select: { name: true },
      });
      await tx.notification.create({
        data: {
          userId: invitee.id,
          type: 'TEAM_INVITATION',
          title: 'Invitación a un equipo',
          body: `${inviter?.name ?? 'Alguien'} te ha invitado a unirte al equipo "${team.name}".`,
          metadata: { invitationId: inv.id, teamId: team.id },
        },
      });
      return inv;
    });
    return { id: invitation.id };
  },
```

- [ ] **Step 5: Run unit tests — should pass now**

Run:
```bash
pnpm test:unit -- tests/unit/modules/teams/team-service.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 6: No commit yet** — `actions.ts` is still broken. Continue to task 4.

---

## Task 4 — Update `inviteToTeamAction` to require `invitedUserId`

**Files:**
- Modify: `src/app/(app)/equipos/actions.ts`

- [ ] **Step 1: Update the schema and the action body**

In `src/app/(app)/equipos/actions.ts`, replace:
```ts
const inviteSchema = z.object({
  teamId: z.string().cuid(),
  invitedUserIdentifier: z.string().min(1, 'Email o nombre obligatorio').max(255),
});

export async function inviteToTeamAction(
  _prev: { error?: string; success?: true } | null,
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const user = await getSession();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await TeamService.invite({
      teamId: parsed.data.teamId,
      invitedByUserId: user.id,
      invitedUserIdentifier: parsed.data.invitedUserIdentifier,
    });
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  revalidatePath(`/equipos/${parsed.data.teamId}`);
  return { success: true };
}
```

with:
```ts
const inviteSchema = z.object({
  teamId: z.string().cuid(),
  invitedUserId: z.string().cuid('Selecciona un jugador del listado.'),
});

export async function inviteToTeamAction(
  _prev: { error?: string; success?: true } | null,
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const user = await getSession();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await TeamService.invite({
      teamId: parsed.data.teamId,
      invitedByUserId: user.id,
      invitedUserId: parsed.data.invitedUserId,
    });
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  revalidatePath(`/equipos/${parsed.data.teamId}`);
  return { success: true };
}
```

- [ ] **Step 2: Run typecheck — should pass**

Run:
```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 3: Run all unit tests**

Run:
```bash
pnpm test:unit
```
Expected: all tests pass (including the new 4 in `team-service.test.ts`).

- [ ] **Step 4: Commit tasks 2-4 together**

```bash
git add src/modules/teams/domain/types.ts \
        src/modules/teams/application/team-service.ts \
        src/app/\(app\)/equipos/actions.ts \
        tests/unit/modules/teams/team-service.test.ts
git commit -m "refactor(teams): invite by user id; drop email/name resolver"
```

---

## Task 5 — Add `UserSearchService` with integration tests

The route layer pulls auth from cookies, so testing it directly is fragile (existing integration tests don't call routes). Instead, we put the SQL in a service that takes a `callerId` parameter, integration-test that against the test DB, and let the route be a thin wrapper.

**Files:**
- Create: `src/modules/users/application/user-search-service.ts`
- Modify: `src/modules/users/index.ts`
- Create: `tests/integration/user-search.test.ts`

- [ ] **Step 1: Write failing integration tests**

Create `tests/integration/user-search.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { UserSearchService } from '@/modules/users';

const prisma = testPrisma();

async function createUser(name: string, suffix: string) {
  return prisma.user.create({
    data: { name, email: `${suffix}@t.com`, passwordHash: 'hash', emailVerifiedAt: new Date() },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('UserSearchService.searchCandidates', () => {
  it('excludes self, current members and pending invitees', async () => {
    const owner = await createUser('Owner', `own-${Date.now()}`);
    const member = await createUser('Other Member', `mem-${Date.now()}`);
    const pending = await createUser('Juan Pendiente', `pen-${Date.now()}`);
    const candidate = await createUser('Juan Candidato', `cand-${Date.now()}`);
    const noise = await createUser('Pedro', `pedro-${Date.now()}`);

    const team = await prisma.team.create({
      data: {
        name: 'T1',
        category: 'INTERMEDIATE',
        createdByUserId: owner.id,
        members: { create: [{ userId: owner.id }, { userId: member.id }] },
      },
    });
    await prisma.teamInvitation.create({
      data: {
        teamId: team.id,
        invitedUserId: pending.id,
        invitedByUserId: owner.id,
        status: 'PENDING',
      },
    });

    const rows = await UserSearchService.searchCandidates({
      q: 'jua',
      teamId: team.id,
      callerId: owner.id,
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(candidate.id);
    expect(ids).not.toContain(owner.id);
    expect(ids).not.toContain(member.id);
    expect(ids).not.toContain(pending.id);
    expect(ids).not.toContain(noise.id);
  });

  it('matches accent- and case-insensitively', async () => {
    const owner = await createUser('Owner', `own-${Date.now()}`);
    const cand = await createUser('José Marín', `jose-${Date.now()}`);
    const team = await prisma.team.create({
      data: {
        name: 'T2',
        category: 'INTERMEDIATE',
        createdByUserId: owner.id,
        members: { create: { userId: owner.id } },
      },
    });

    const rows = await UserSearchService.searchCandidates({
      q: 'jose',
      teamId: team.id,
      callerId: owner.id,
    });
    expect(rows.map((r) => r.id)).toContain(cand.id);
  });

  it('caps at 10 results', async () => {
    const owner = await createUser('Owner', `own-${Date.now()}`);
    for (let i = 0; i < 15; i++) await createUser(`Test User ${i}`, `t${i}-${Date.now()}`);
    const team = await prisma.team.create({
      data: {
        name: 'T3',
        category: 'INTERMEDIATE',
        createdByUserId: owner.id,
        members: { create: { userId: owner.id } },
      },
    });

    const rows = await UserSearchService.searchCandidates({
      q: 'test',
      teamId: team.id,
      callerId: owner.id,
    });
    expect(rows).toHaveLength(10);
  });

  it('returns only id, name, avatarUrl', async () => {
    const owner = await createUser('Owner', `own-${Date.now()}`);
    await createUser('Juana', `juana-${Date.now()}`);
    const team = await prisma.team.create({
      data: {
        name: 'T4',
        category: 'INTERMEDIATE',
        createdByUserId: owner.id,
        members: { create: { userId: owner.id } },
      },
    });

    const rows = await UserSearchService.searchCandidates({
      q: 'juan',
      teamId: team.id,
      callerId: owner.id,
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['avatarUrl', 'id', 'name']);
    }
  });

  it('excludes soft-deleted users', async () => {
    const owner = await createUser('Owner', `own-${Date.now()}`);
    const deleted = await createUser('Juan Borrado', `del-${Date.now()}`);
    await prisma.user.update({
      where: { id: deleted.id },
      data: { deletedAt: new Date() },
    });
    const team = await prisma.team.create({
      data: {
        name: 'T5',
        category: 'INTERMEDIATE',
        createdByUserId: owner.id,
        members: { create: { userId: owner.id } },
      },
    });

    const rows = await UserSearchService.searchCandidates({
      q: 'jua',
      teamId: team.id,
      callerId: owner.id,
    });
    expect(rows.map((r) => r.id)).not.toContain(deleted.id);
  });
});
```

- [ ] **Step 2: Run tests — should fail (service doesn't exist)**

Run:
```bash
pnpm test:integration -- tests/integration/user-search.test.ts
```
Expected: import error.

- [ ] **Step 3: Implement the service**

Create `src/modules/users/application/user-search-service.ts`:
```ts
import { prisma } from '@/shared/db/client';

export type UserCandidate = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export interface SearchCandidatesInput {
  q: string;
  teamId: string;
  callerId: string;
  limit?: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

export const UserSearchService = {
  async searchCandidates(input: SearchCandidatesInput): Promise<UserCandidate[]> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    return prisma.$queryRaw<UserCandidate[]>`
      SELECT u.id, u.name, u.avatar_url AS "avatarUrl"
      FROM users u
      WHERE u.deleted_at IS NULL
        AND u.id != ${input.callerId}
        AND u.id NOT IN (
          SELECT tm.user_id FROM team_members tm WHERE tm.team_id = ${input.teamId}
        )
        AND u.id NOT IN (
          SELECT ti.invited_user_id FROM team_invitations ti
          WHERE ti.team_id = ${input.teamId} AND ti.status = 'PENDING'
        )
        AND unaccent(LOWER(u.name)) LIKE unaccent(LOWER('%' || ${input.q} || '%'))
      ORDER BY u.name ASC
      LIMIT ${limit}
    `;
  },
} as const;
```

- [ ] **Step 4: Re-export from the users module index**

Edit `src/modules/users/index.ts`:
```ts
export { UserAdminService } from './application/user-admin-service';
export type { UserListItem, UserDetail } from './application/user-admin-service';
export { RegistrationCodeService } from './application/registration-code-service';
export type { RegistrationCodeRow } from './application/registration-code-service';
export { UserSearchService } from './application/user-search-service';
export type { UserCandidate, SearchCandidatesInput } from './application/user-search-service';
```

- [ ] **Step 5: Run integration tests — should pass**

Run:
```bash
pnpm test:integration -- tests/integration/user-search.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 6: Run the full integration suite as smoke**

Run:
```bash
pnpm test:integration
```
Expected: every test passes.

- [ ] **Step 7: Commit**

```bash
git add src/modules/users/application/user-search-service.ts \
        src/modules/users/index.ts \
        tests/integration/user-search.test.ts
git commit -m "feat(users): UserSearchService with accent-insensitive name search"
```

---

## Task 6 — Add `GET /api/users/search` route as thin wrapper

**Files:**
- Create: `src/app/api/users/search/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/api/users/search/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { UserSearchService } from '@/modules/users';
import { logger } from '@/shared/logger';

const querySchema = z.object({
  q: z.string().trim().min(1).max(60),
  teamId: z.string().cuid(),
});

export async function GET(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getValidatedSession(sessionToken).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q'),
    teamId: url.searchParams.get('teamId'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 400 },
    );
  }

  // Caller must be a member of the team they search candidates for.
  const member = await prisma.teamMember.findFirst({
    where: { teamId: parsed.data.teamId, userId: user.id },
    select: { id: true },
  });
  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rate limit: 60 hits per 15-min window, scoped per user.
  try {
    await checkRateLimit(buildRateLimitKey('users.search', 'user', user.id), { limit: 60 });
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const rows = await UserSearchService.searchCandidates({
      q: parsed.data.q,
      teamId: parsed.data.teamId,
      callerId: user.id,
    });
    return NextResponse.json(rows);
  } catch (err) {
    logger().error({ err, userId: user.id, q: parsed.data.q }, 'users.search.failed');
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run typecheck and full test suite**

Run:
```bash
pnpm typecheck && pnpm test:unit && pnpm test:integration
```
Expected: all green. The route's behaviour above the service (auth, team membership, rate limit) we'll smoke manually.

- [ ] **Step 3: Manual smoke**

Run `pnpm dev`. With your usual session cookie, hit:
```bash
curl -i 'http://localhost:3000/api/users/search?q=jua&teamId=<a-team-you-belong-to>' \
  -H "cookie: padel_session=<your-session-token>"
```
Expected: 200 with a JSON array of candidates. Repeat with `teamId` of a team you DON'T belong to → 401/403. Without cookie → 401.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/users/search/route.ts
git commit -m "feat(api): scoped /api/users/search route for team-invite typeahead"
```

---

## Task 7 — Build the `UserSearchPicker` client component

**Files:**
- Create: `src/app/(app)/equipos/[id]/_components/user-search-picker.tsx`

- [ ] **Step 1: Create the component file**

Create `src/app/(app)/equipos/[id]/_components/user-search-picker.tsx`:
```tsx
'use client';

import { useEffect, useId, useRef, useState } from 'react';

type Candidate = { id: string; name: string; avatarUrl: string | null };

interface Props {
  teamId: string;
  /** Hidden form field name. Defaults to "invitedUserId". */
  name?: string;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

export function UserSearchPicker({ teamId, name = 'invitedUserId' }: Props) {
  const inputId = useId();
  const listId = useId();
  const liveId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [liveMessage, setLiveMessage] = useState('');

  // Debounced fetch on query change
  useEffect(() => {
    if (selected) return;
    if (query.trim().length < MIN_CHARS) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setError(null);
    const timeout = setTimeout(() => {
      const url = new URL('/api/users/search', window.location.origin);
      url.searchParams.set('q', query.trim());
      url.searchParams.set('teamId', teamId);

      fetch(url.toString())
        .then(async (res) => {
          if (!res.ok) throw new Error(`status ${res.status}`);
          return (await res.json()) as Candidate[];
        })
        .then((rows) => {
          setResults(rows);
          setHighlighted(0);
          setOpen(true);
          setLiveMessage(
            rows.length === 0
              ? 'Sin resultados.'
              : `${rows.length} resultado${rows.length === 1 ? '' : 's'}.`,
          );
        })
        .catch(() => {
          setResults([]);
          setError('No se pudo cargar la búsqueda.');
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query, teamId, selected]);

  // Close on click outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function selectCandidate(c: Candidate) {
    setSelected(c);
    setQuery(c.name);
    setOpen(false);
    setResults([]);
  }

  function clearSelection() {
    setSelected(null);
    setQuery('');
    setResults([]);
    setOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = results[highlighted];
      if (c) selectCandidate(c);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input type="hidden" name={name} value={selected?.id ?? ''} />

      {selected ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm">
          <Avatar name={selected.name} url={selected.avatarUrl} />
          <span className="flex-1 font-medium text-slate-700">{selected.name}</span>
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Limpiar selección"
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>
      ) : (
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Buscar jugador por nombre…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      )}

      <span id={liveId} aria-live="polite" className="sr-only">
        {liveMessage}
      </span>

      {open && !selected && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-md max-h-60 overflow-auto"
        >
          {loading && <li className="px-3 py-2 text-sm text-slate-400">Buscando…</li>}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">Sin resultados. Comprueba el nombre.</li>
          )}
          {!loading &&
            results.map((c, idx) => (
              <li
                key={c.id}
                role="option"
                aria-selected={idx === highlighted}
                onMouseEnter={() => setHighlighted(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCandidate(c);
                }}
                className={`px-3 py-2 text-sm flex items-center gap-2 cursor-pointer ${
                  idx === highlighted ? 'bg-slate-100' : 'hover:bg-slate-50'
                }`}
              >
                <Avatar name={c.name} url={c.avatarUrl} />
                <span className="text-slate-700">{c.name}</span>
              </li>
            ))}
        </ul>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      <span
        className="w-6 h-6 rounded-full bg-slate-100 overflow-hidden inline-block shrink-0"
        style={{ backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        aria-hidden
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span
      className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-xs font-bold flex items-center justify-center shrink-0"
      aria-hidden
    >
      {initial}
    </span>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/equipos/\[id\]/_components/user-search-picker.tsx
git commit -m "feat(equipos): UserSearchPicker typeahead component"
```

---

## Task 8 — Wire `UserSearchPicker` into the team invite form

**Files:**
- Modify: `src/app/(app)/equipos/[id]/invite-form.tsx`

- [ ] **Step 1: Replace the form's plain input with the picker**

Replace the entire contents of `src/app/(app)/equipos/[id]/invite-form.tsx`:
```tsx
'use client';

import { useActionState, useEffect, useRef } from 'react';
import { inviteToTeamAction } from '../actions';
import { UserSearchPicker } from './_components/user-search-picker';

export function InviteForm({ teamId }: { teamId: string }) {
  const [state, formAction, pending] = useActionState(inviteToTeamAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <UserSearchPicker teamId={teamId} />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {pending ? 'Enviando…' : 'Enviar invitación'}
        </button>
        {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
        {state?.success && <p className="text-xs text-emerald-700">Invitación enviada.</p>}
      </div>
    </form>
  );
}
```

Note: the submit button is no longer disabled by absence of selection — the server-side schema rejects empty `invitedUserId` and surfaces the error in `state.error`. We could wire client-side disable later if it's awkward.

- [ ] **Step 2: Run typecheck**

Run:
```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 3: Manual smoke**

Run the dev server:
```bash
pnpm dev
```

In a browser, log in as a user who is in a team. Open `/equipos/[teamId]`. Confirm:
- The input shows "Buscar jugador por nombre…"
- After typing 2 chars, results appear under the input.
- Avatars render (initials fallback when no `avatarUrl`).
- Selecting a result fills the chip; the email is nowhere on the page.
- Submit creates a pending invitation; the page re-renders showing it.
- Cancel an invitation works.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/equipos/\[id\]/invite-form.tsx
git commit -m "feat(equipos): use UserSearchPicker in team invite form"
```

---

## Task 9 — Hide email in the team detail page

**Files:**
- Modify: `src/app/(app)/equipos/[id]/page.tsx`

- [ ] **Step 1: Remove email from members list**

In `src/app/(app)/equipos/[id]/page.tsx`, find the members `<ul>` and replace:
```tsx
        <ul className="space-y-2">
          {team.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-xs flex items-center justify-center font-semibold shrink-0">
                {m.name[0]?.toUpperCase()}
              </span>
              <span>
                <span className="font-medium">{m.name}</span>
                <span className="ml-2 text-xs text-slate-400">{m.email}</span>
              </span>
            </li>
          ))}
        </ul>
```

with:
```tsx
        <ul className="space-y-2">
          {team.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-xs flex items-center justify-center font-semibold shrink-0">
                {m.name[0]?.toUpperCase()}
              </span>
              <span className="font-medium">{m.name}</span>
            </li>
          ))}
        </ul>
```

- [ ] **Step 2: Remove email from pending invitations list**

Find the pending invitations block and replace:
```tsx
            {team.invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium text-slate-700">{inv.invitedUser.name}</span>
                  <span className="ml-2 text-xs text-slate-400">{inv.invitedUser.email}</span>
                </div>
                <CancelInvitationButton invitationId={inv.id} teamId={team.id} />
              </div>
            ))}
```

with:
```tsx
            {team.invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2">
                <span className="font-medium text-slate-700 text-sm">{inv.invitedUser.name}</span>
                <CancelInvitationButton invitationId={inv.id} teamId={team.id} />
              </div>
            ))}
```

- [ ] **Step 3: Run typecheck**

Run:
```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 4: Manual smoke**

Reload `/equipos/[teamId]` and confirm no email appears under any member or pending invitation.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/equipos/\[id\]/page.tsx
git commit -m "fix(equipos): hide member and invitee emails on team detail"
```

---

## Task 10 — Audit other team-flow pages for stray emails

**Files:**
- Modify (only if hits found): `src/app/(app)/equipos/page.tsx`, `src/app/(app)/dashboard/**/*.tsx`

- [ ] **Step 1: Grep for `.email` in team-flow files**

Run:
```bash
grep -rn "\.email" "src/app/(app)/equipos/" "src/app/(app)/dashboard/"
```

- [ ] **Step 2: Inspect each hit and decide**

For each hit:
- If it's rendering a user's email in the page, remove it (same pattern as task 8).
- If it's just a TypeScript reference (e.g. selecting `email` from a query that doesn't render it), leave it — type tightening is out of scope for this iteration.
- If it's an admin-only page (`/admin/...`), leave it.

- [ ] **Step 3: Run typecheck if any change made**

Run:
```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit (only if changes were made)**

```bash
git add <changed files>
git commit -m "fix(ui): hide email in remaining team-flow surfaces"
```
If no changes, skip this task with no commit.

---

## Task 11 — Final validation and push

- [ ] **Step 1: Run full test suite**

Run:
```bash
pnpm typecheck && pnpm test:unit && pnpm test:integration
```
Expected: all green.

- [ ] **Step 2: Production build**

Run:
```bash
pnpm build
```
Expected: build completes without errors. Watch for any warnings about server/client component boundaries.

- [ ] **Step 3: Push branch**

```bash
git push origin <branch>
```

- [ ] **Step 4: Open PR or merge**

Per project convention. The PR description should reference the spec at `docs/superpowers/specs/2026-04-30-team-invite-by-name-design.md`.
