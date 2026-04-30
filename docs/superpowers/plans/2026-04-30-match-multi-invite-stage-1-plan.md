# Match Multi-Invite — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-30-match-multi-invite-design.md`

**Goal:** Ship the user-multi-invite + public/private flow for independent matches: drop the approve-join-request flow, add a `visibility` field, replace the email-only invitation form with a name-search typeahead, and let public matches be joined directly from the tablón.

**Architecture:** A new `visibility: PUBLIC | PRIVATE` column gates whether matches surface in the tablón and whether public-join is allowed. `IndependentMatchInvitation` becomes polymorphic over `email | invitedUserId` with a CHECK constraint. `IndependentMatchJoinRequest` is dropped entirely. A new `joinPublicMatch` service method does race-safe direct-join. A new `UserSearchService.searchCandidatesForMatch` powers the typeahead, exposed via the existing `/api/users/search` route extended to accept either `teamId` or `matchId`.

**Tech Stack:** Next.js 15 (App Router, React 18), Prisma 5, Postgres + `unaccent`, pg-boss, Vitest (unit + integration with testcontainers), Tailwind. TEAM_CHALLENGE remains live but hidden from the new-match form; full removal is in Stage 2.

---

## File Structure

**Created:**

- `prisma/migrations/<ts>_match_visibility/migration.sql`
- `prisma/migrations/<ts>_match_invitations_polymorphic/migration.sql`
- `prisma/migrations/<ts>_drop_match_join_requests/migration.sql`
- `src/app/(app)/jugar/[id]/_components/match-user-picker.tsx` — typeahead component for user invitations.
- `src/app/(app)/jugar/[id]/_components/join-public-match-button.tsx` — direct-join button.
- `tests/integration/match-public-join.test.ts` — race-safe join + visibility filtering.
- `tests/integration/match-user-search.test.ts` — `/api/users/search?matchId=` exclusions.
- `tests/unit/modules/independent-matches/invite-user.test.ts` — service unit test.

**Modified:**

- `prisma/schema.prisma` — schema changes for visibility, invitation polymorphism, drop of join-request models.
- `src/modules/independent-matches/domain/types.ts` — add `MatchVisibility`, drop join-request types, extend `IndependentMatchDetail`.
- `src/modules/independent-matches/application/independent-match-service.ts` — drop `requestToJoin / approveJoinRequest / rejectJoinRequest`, extend `createOpen`, add `inviteUser`, generalise `acceptInvitation`, add `joinPublicMatch`.
- `src/modules/users/application/user-search-service.ts` — add `searchCandidatesForMatch`.
- `src/modules/users/index.ts` — re-export the new method.
- `src/app/api/users/search/route.ts` — accept either `teamId` or `matchId`; route to the right service method.
- `src/app/(app)/jugar/page.tsx` — filter tablón to `visibility = PUBLIC`, render direct-join button per row.
- `src/app/(app)/jugar/[id]/page.tsx` — drop `JoinRequestsPanel` + `JoinRequestButton`; add `JoinPublicMatchButton` for non-organizer/non-participant viewers when public + slot free.
- `src/app/(app)/jugar/[id]/actions.ts` — drop `requestToJoin / approveJoinRequest / rejectJoinRequest`; replace `inviteByEmail` action with `inviteUserToMatch` (still keep email path as a separate action).
- `src/app/(app)/jugar/[id]/_components/invite-form.tsx` — replace plain email input with `MatchUserPicker`; keep the email path as a small "or invite by email" expandable.
- `src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx` — add visibility radio (PUBLIC/PRIVATE); hide the team-challenge tab.
- `src/app/(app)/jugar/nuevo/actions.ts` — `createOpenSchema` accepts `visibility`.

**Deleted:**

- `src/app/(app)/jugar/[id]/_components/join-request-button.tsx`
- `src/app/(app)/jugar/[id]/_components/join-requests-panel.tsx`

---

## Task 1 — Schema migration: add `visibility`

**Files:**
- Create: `prisma/migrations/<ts>_match_visibility/migration.sql`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update `prisma/schema.prisma`**

Add the new enum near the other `IndependentMatch`-related enums:

```prisma
enum MatchVisibility {
  PUBLIC
  PRIVATE
}
```

In `model IndependentMatch`, add this field (place it next to the existing `type` field):

```prisma
  visibility       MatchVisibility       @default(PUBLIC) @map("visibility")
```

- [ ] **Step 2: Generate the migration**

```bash
pnpm prisma migrate dev --name match_visibility --create-only
```
A new folder appears under `prisma/migrations/`; verify the SQL is what you expect:

```sql
-- CreateEnum
CREATE TYPE "MatchVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "independent_matches" ADD COLUMN "visibility" "MatchVisibility" NOT NULL DEFAULT 'PUBLIC';
```

- [ ] **Step 3: Apply locally**

```bash
pnpm prisma migrate dev
```
Expected: "Database is now in sync with your Prisma schema."

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): add MatchVisibility (PUBLIC | PRIVATE) to IndependentMatch"
```

---

## Task 2 — Schema migration: invitations polymorphic over email|user

**Files:**
- Create: `prisma/migrations/<ts>_match_invitations_polymorphic/migration.sql`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update `prisma/schema.prisma`**

Replace the `IndependentMatchInvitation` model entirely:

```prisma
model IndependentMatchInvitation {
  id            String    @id @default(cuid())
  matchId       String    @map("match_id")
  email         String?   @db.Citext
  invitedUserId String?   @map("invited_user_id")
  expiresAt     DateTime  @map("expires_at")
  acceptedAt    DateTime? @map("accepted_at")
  createdAt     DateTime  @default(now()) @map("created_at")

  match       IndependentMatch @relation(fields: [matchId], references: [id], onDelete: Cascade)
  invitedUser User?            @relation(fields: [invitedUserId], references: [id], onDelete: SetNull)

  @@unique([matchId, email], map: "imi_match_email_uniq")
  @@unique([matchId, invitedUserId], map: "imi_match_user_uniq")
  @@index([matchId])
  @@map("independent_match_invitations")
}
```

In `model User`, add the back-relation:

```prisma
  matchInvitationsReceived IndependentMatchInvitation[]
```

- [ ] **Step 2: Generate the migration**

```bash
pnpm prisma migrate dev --name match_invitations_polymorphic --create-only
```

- [ ] **Step 3: Augment the migration with the CHECK constraint**

Open the generated `migration.sql` and append at the end:

```sql
-- Polymorphic guard: exactly one of {email, invited_user_id} must be set.
ALTER TABLE "independent_match_invitations"
  ADD CONSTRAINT "imi_one_target" CHECK (
    (CASE WHEN "email" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "invited_user_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
```

The Prisma-generated SQL above this should already include the column add, FK, and unique index changes. Do not delete those.

- [ ] **Step 4: Apply locally**

```bash
pnpm prisma migrate dev
```
Expected: "Database is now in sync with your Prisma schema."

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): polymorphic match invitations over email|user with CHECK"
```

---

## Task 3 — Schema migration: drop `IndependentMatchJoinRequest`

**Files:**
- Create: `prisma/migrations/<ts>_drop_match_join_requests/migration.sql`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update `prisma/schema.prisma`**

Delete the entire `model IndependentMatchJoinRequest { ... }` block and the `enum JoinRequestStatus { ... }` block.

In `model IndependentMatch`, remove the back-relation `joinRequests`. Likewise on `model User`, remove the `matchJoinRequests` relation if present.

- [ ] **Step 2: Generate the migration**

```bash
pnpm prisma migrate dev --name drop_match_join_requests --create-only
```

The generated SQL should contain `DROP TABLE` and `DROP TYPE` statements.

- [ ] **Step 3: Apply locally**

```bash
pnpm prisma migrate dev
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): drop IndependentMatchJoinRequest (approve flow gone)"
```

---

## Task 4 — Service: drop join-request methods, extend `createOpen`

**Files:**
- Modify: `src/modules/independent-matches/domain/types.ts`
- Modify: `src/modules/independent-matches/application/independent-match-service.ts`

- [ ] **Step 1: Update domain types**

In `src/modules/independent-matches/domain/types.ts`, remove `JoinRequestStatus` import and any types that reference it. Update `CreateOpenMatchInput`:

```ts
import type { IndependentMatchStatus, IndependentMatchType, MatchVisibility, ParticipantStatus } from '@prisma/client';

export type CreateOpenMatchInput = {
  organizerId: string;
  name: string;
  visibility: MatchVisibility;
  scheduledAt?: Date;
  location?: string;
  description?: string;
  maxPlayers: 2 | 4;
};
```

Update `IndependentMatchDetail` to drop the `joinRequests` field:

```ts
export type IndependentMatchDetail = IndependentMatchRow & {
  organizer: { id: string; name: string };
  challengedTeam: { id: string; name: string } | null;
  league: { id: string; name: string; slug: string } | null;
  participants: { userId: string; user: { id: string; name: string }; status: ParticipantStatus }[];
  invitations: {
    id: string;
    email: string | null;
    invitedUserId: string | null;
    invitedUser: { id: string; name: string } | null;
    acceptedAt: Date | null;
    createdAt: Date;
  }[];
};

export type IndependentMatchRow = {
  id: string;
  name: string;
  type: IndependentMatchType;
  visibility: MatchVisibility;
  organizerId: string;
  challengedTeamId: string | null;
  leagueId: string | null;
  scheduledAt: Date | null;
  location: string | null;
  description: string | null;
  maxPlayers: number;
  status: IndependentMatchStatus;
  createdAt: Date;
  updatedAt: Date;
};
```

- [ ] **Step 2: Update `IndependentMatchService`**

In `src/modules/independent-matches/application/independent-match-service.ts`:

a) Update `MATCH_DETAIL_INCLUDE`: drop the `joinRequests` block and extend the `invitations` block to include the related user:

```ts
const MATCH_DETAIL_INCLUDE = {
  organizer: { select: { id: true, name: true } },
  challengedTeam: { select: { id: true, name: true } },
  league: { select: { id: true, name: true, slug: true } },
  participants: {
    where: { status: 'ACCEPTED' as const },
    include: { user: { select: { id: true, name: true } } },
  },
  invitations: {
    orderBy: { createdAt: 'asc' as const },
    include: { invitedUser: { select: { id: true, name: true } } },
  },
} as const;
```

b) Update the `createOpen` method body (top of the service) to write `visibility`:

```ts
async createOpen(input: CreateOpenMatchInput): Promise<IndependentMatchRow> {
  const match = await prisma.$transaction(async (tx) => {
    const m = await tx.independentMatch.create({
      data: {
        organizerId: input.organizerId,
        name: input.name,
        type: 'OPEN',
        visibility: input.visibility,
        scheduledAt: input.scheduledAt ?? null,
        location: input.location ?? null,
        description: input.description ?? null,
        maxPlayers: input.maxPlayers,
      },
    });
    await tx.independentMatchParticipant.create({
      data: { independentMatchId: m.id, userId: input.organizerId, status: 'ACCEPTED' },
    });
    return m;
  });
  return match;
},
```

c) Delete the methods `requestToJoin`, `approveJoinRequest`, `rejectJoinRequest` entirely (and their types).

d) Update `getForUser` (no change to signature; just verify it doesn't reference join-requests).

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```
Expected: failures will appear in `actions.ts` and components that referenced join-requests. We'll fix those in tasks 9-11.

- [ ] **Step 4: No commit yet** — typecheck is intentionally red. Continue to Task 5.

---

## Task 5 — Service: `inviteUser` + generalise `acceptInvitation`

**Files:**
- Modify: `src/modules/independent-matches/application/independent-match-service.ts`
- Create: `tests/unit/modules/independent-matches/invite-user.test.ts`

- [ ] **Step 1: Add the `inviteUser` method**

In `src/modules/independent-matches/application/independent-match-service.ts`, add this method right after `inviteByEmail`:

```ts
async inviteUser(
  matchId: string,
  organizerId: string,
  invitedUserId: string,
): Promise<{ invitationId: string; isNew: boolean }> {
  const match = await prisma.independentMatch.findUnique({
    where: { id: matchId },
    include: { participants: { where: { status: 'ACCEPTED' } } },
  });
  if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
  if (match.organizerId !== organizerId)
    throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede invitar.');
  if (!['OPEN', 'PENDING_APPROVAL'].includes(match.status))
    throw new DomainError('MATCH_NOT_INVITABLE', 'No se puede invitar a este partido.');
  if (calculateAvailableSlots(match.maxPlayers, match.participants.length) === 0)
    throw new DomainError('MATCH_FULL', 'El partido ya está completo.');
  if (invitedUserId === organizerId)
    throw new DomainError('CANNOT_INVITE_SELF', 'No puedes invitarte a ti mismo.');
  if (match.participants.some((p) => p.userId === invitedUserId))
    throw new ConflictError('ALREADY_PARTICIPANT', 'Esa persona ya está en el partido.');

  const invitee = await prisma.user.findUnique({
    where: { id: invitedUserId },
    select: { id: true, deletedAt: true },
  });
  if (!invitee || invitee.deletedAt !== null)
    throw new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado.');

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const existing = await prisma.independentMatchInvitation.findUnique({
    where: { matchId_invitedUserId: { matchId, invitedUserId } },
  });

  if (existing && !existing.acceptedAt && existing.expiresAt > new Date()) {
    return { invitationId: existing.id, isNew: false };
  }

  const invitation = existing
    ? await prisma.independentMatchInvitation.update({
        where: { id: existing.id },
        data: { expiresAt, acceptedAt: null },
      })
    : await prisma.independentMatchInvitation.create({
        data: { matchId, invitedUserId, expiresAt },
      });

  return { invitationId: invitation.id, isNew: true };
},
```

- [ ] **Step 2: Generalise `acceptInvitation`**

Replace the `acceptInvitation` method with one that handles both branches:

```ts
async acceptInvitation(token: string, userId: string): Promise<string> {
  const { subjectId } = await SignedTokenService.consume(token, SignedTokenPurpose.INDEPENDENT_MATCH_INVITE);

  const invitation = await prisma.independentMatchInvitation.findUnique({
    where: { id: subjectId },
    include: { match: { include: { participants: { where: { status: 'ACCEPTED' } } } } },
  });
  if (!invitation) throw new NotFoundError('INVITATION_NOT_FOUND', 'Invitación no encontrada.');
  if (invitation.acceptedAt) throw new DomainError('ALREADY_ACCEPTED', 'Esta invitación ya fue usada.');

  // For user-targeted invitations, only the targeted user can accept.
  if (invitation.invitedUserId !== null && invitation.invitedUserId !== userId) {
    throw new AuthorizationError('NOT_INVITEE', 'Esta invitación no es para ti.');
  }

  const { match } = invitation;
  if (match.status === 'CANCELLED') throw new DomainError('MATCH_CANCELLED', 'Este partido fue cancelado.');
  if (calculateAvailableSlots(match.maxPlayers, match.participants.length) === 0)
    throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

  const alreadyParticipant = match.participants.some((p) => p.userId === userId);
  if (alreadyParticipant) {
    await prisma.independentMatchInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    return match.id;
  }

  await prisma.$transaction(async (tx) => {
    const confirmedCount = await tx.independentMatchParticipant.count({
      where: { independentMatchId: match.id, status: 'ACCEPTED' },
    });
    if (confirmedCount >= match.maxPlayers)
      throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

    const isFull = confirmedCount + 1 >= match.maxPlayers;

    await tx.independentMatchInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    await tx.independentMatchParticipant.upsert({
      where: { independentMatchId_userId: { independentMatchId: match.id, userId } },
      create: { independentMatchId: match.id, userId, status: 'ACCEPTED' },
      update: { status: 'ACCEPTED' },
    });
    if (isFull) {
      await tx.independentMatch.update({ where: { id: match.id }, data: { status: 'CONFIRMED' } });
    }
  });

  NotificationService.create({
    userId: match.organizerId,
    type: 'INDEPENDENT_MATCH_CONFIRMED',
    title: 'Alguien aceptó tu invitación',
    body: `Un jugador se unió a "${match.name}".`,
    metadata: { matchId: match.id },
  }).catch(() => undefined);

  return match.id;
},
```

- [ ] **Step 3: Write the unit test**

Create `tests/unit/modules/independent-matches/invite-user.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndependentMatchService } from '@/modules/independent-matches';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    independentMatch: { findUnique: vi.fn() },
    independentMatchInvitation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    independentMatch: { findUnique: ReturnType<typeof vi.fn> };
    independentMatchInvitation: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    user: { findUnique: ReturnType<typeof vi.fn> };
  };
}

describe('IndependentMatchService.inviteUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when caller is not the organizer', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'someone-else',
      maxPlayers: 4,
      status: 'OPEN',
      participants: [],
    });

    await expect(
      IndependentMatchService.inviteUser('m1', 'u1', 'u2'),
    ).rejects.toThrow(/organizador/i);
  });

  it('rejects self-invite', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      participants: [],
    });

    await expect(
      IndependentMatchService.inviteUser('m1', 'u1', 'u1'),
    ).rejects.toThrow(/ti mismo/i);
  });

  it('rejects when invitee is already a participant', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      participants: [{ userId: 'u2' }],
    });

    await expect(
      IndependentMatchService.inviteUser('m1', 'u1', 'u2'),
    ).rejects.toThrow(/ya está en el partido/i);
  });

  it('returns existing invitation as not-new when still pending', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      participants: [],
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', deletedAt: null });
    const future = new Date(Date.now() + 60_000);
    prisma.independentMatchInvitation.findUnique.mockResolvedValue({
      id: 'inv1',
      acceptedAt: null,
      expiresAt: future,
    });

    const result = await IndependentMatchService.inviteUser('m1', 'u1', 'u2');
    expect(result).toEqual({ invitationId: 'inv1', isNew: false });
    expect(prisma.independentMatchInvitation.create).not.toHaveBeenCalled();
  });

  it('creates a new invitation when none exists', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      participants: [],
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', deletedAt: null });
    prisma.independentMatchInvitation.findUnique.mockResolvedValue(null);
    prisma.independentMatchInvitation.create.mockResolvedValue({ id: 'inv-new' });

    const result = await IndependentMatchService.inviteUser('m1', 'u1', 'u2');
    expect(result).toEqual({ invitationId: 'inv-new', isNew: true });
    expect(prisma.independentMatchInvitation.create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Run unit tests**

```bash
pnpm test:unit -- tests/unit/modules/independent-matches/invite-user.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 5: No commit yet** — service still has missing pieces (joinPublicMatch). Continue.

---

## Task 6 — Service: `joinPublicMatch`

**Files:**
- Modify: `src/modules/independent-matches/application/independent-match-service.ts`

- [ ] **Step 1: Add the method**

Add right after `acceptInvitation`:

```ts
async joinPublicMatch(matchId: string, userId: string): Promise<void> {
  const match = await prisma.independentMatch.findUnique({
    where: { id: matchId },
    include: { participants: { where: { status: 'ACCEPTED' } } },
  });
  if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
  if (match.visibility !== 'PUBLIC')
    throw new DomainError('NOT_PUBLIC', 'Este partido no es público.');
  if (match.status === 'CANCELLED')
    throw new DomainError('MATCH_CANCELLED', 'Este partido fue cancelado.');

  if (match.participants.some((p) => p.userId === userId)) return; // idempotent

  await prisma.$transaction(async (tx) => {
    const confirmedCount = await tx.independentMatchParticipant.count({
      where: { independentMatchId: match.id, status: 'ACCEPTED' },
    });
    if (confirmedCount >= match.maxPlayers)
      throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

    const isFull = confirmedCount + 1 >= match.maxPlayers;

    await tx.independentMatchParticipant.upsert({
      where: { independentMatchId_userId: { independentMatchId: match.id, userId } },
      create: { independentMatchId: match.id, userId, status: 'ACCEPTED' },
      update: { status: 'ACCEPTED' },
    });
    if (isFull) {
      await tx.independentMatch.update({ where: { id: match.id }, data: { status: 'CONFIRMED' } });
    }
  });

  NotificationService.create({
    userId: match.organizerId,
    type: 'INDEPENDENT_MATCH_CONFIRMED',
    title: 'Alguien se unió a tu partido',
    body: `Un jugador se unió a "${match.name}".`,
    metadata: { matchId: match.id },
  }).catch(() => undefined);
},
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: still red in `actions.ts` and components — those are fixed in later tasks.

- [ ] **Step 3: No commit yet** — bundle with later commits.

---

## Task 7 — Search: `UserSearchService.searchCandidatesForMatch`

**Files:**
- Modify: `src/modules/users/application/user-search-service.ts`
- Modify: `src/modules/users/index.ts`

- [ ] **Step 1: Add the method**

In `src/modules/users/application/user-search-service.ts`, add a new method to the existing `UserSearchService` object:

```ts
export interface SearchCandidatesForMatchInput {
  q: string;
  matchId: string;
  callerId: string;
  limit?: number;
}

// inside UserSearchService:
async searchCandidatesForMatch(input: SearchCandidatesForMatchInput): Promise<UserCandidate[]> {
  const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  return prisma.$queryRaw<UserCandidate[]>`
    SELECT u.id, u.name, u.avatar_url AS "avatarUrl"
    FROM users u
    WHERE u.deleted_at IS NULL
      AND u.id != ${input.callerId}
      AND u.id NOT IN (
        SELECT imp.user_id FROM independent_match_participants imp
        WHERE imp.independent_match_id = ${input.matchId} AND imp.status = 'ACCEPTED'
      )
      AND u.id NOT IN (
        SELECT imi.invited_user_id FROM independent_match_invitations imi
        WHERE imi.match_id = ${input.matchId}
          AND imi.invited_user_id IS NOT NULL
          AND imi.accepted_at IS NULL
      )
      AND unaccent(LOWER(u.name)) LIKE unaccent(LOWER('%' || ${input.q} || '%'))
    ORDER BY u.name ASC
    LIMIT ${limit}
  `;
},
```

- [ ] **Step 2: Re-export the new input type**

In `src/modules/users/index.ts`, add:

```ts
export type { SearchCandidatesForMatchInput } from './application/user-search-service';
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```
Expected: still some errors in routes/UI (fixed later).

- [ ] **Step 4: No commit yet.**

---

## Task 8 — API route: extend `/api/users/search` to accept `matchId`

**Files:**
- Modify: `src/app/api/users/search/route.ts`

- [ ] **Step 1: Replace the entire file**

Overwrite `src/app/api/users/search/route.ts` with:

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

const querySchema = z
  .object({
    q: z.string().trim().min(1).max(60),
    teamId: z.string().cuid().optional(),
    matchId: z.string().cuid().optional(),
  })
  .refine((v) => Boolean(v.teamId) !== Boolean(v.matchId), {
    message: 'Provide either teamId or matchId.',
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
    teamId: url.searchParams.get('teamId') ?? undefined,
    matchId: url.searchParams.get('matchId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 400 },
    );
  }

  // Rate limit: 60 hits per 15-min window per user.
  try {
    await checkRateLimit(buildRateLimitKey('users.search', 'user', user.id), { limit: 60 });
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    if (parsed.data.teamId) {
      // Team-invite scope: caller must be member of the team.
      const member = await prisma.teamMember.findFirst({
        where: { teamId: parsed.data.teamId, userId: user.id },
        select: { id: true },
      });
      if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

      const rows = await UserSearchService.searchCandidates({
        q: parsed.data.q,
        teamId: parsed.data.teamId,
        callerId: user.id,
      });
      return NextResponse.json(rows);
    }

    // Match-invite scope: caller must be the match organizer.
    const match = await prisma.independentMatch.findUnique({
      where: { id: parsed.data.matchId! },
      select: { organizerId: true },
    });
    if (!match || match.organizerId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = await UserSearchService.searchCandidatesForMatch({
      q: parsed.data.q,
      matchId: parsed.data.matchId!,
      callerId: user.id,
    });
    return NextResponse.json(rows);
  } catch (err) {
    logger().error({ err, userId: user.id, q: parsed.data.q }, 'users.search.failed');
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: still red in actions/components — handled next.

- [ ] **Step 3: No commit yet.**

---

## Task 9 — Frontend: drop `JoinRequestsPanel` + `JoinRequestButton`; remove server actions

**Files:**
- Delete: `src/app/(app)/jugar/[id]/_components/join-request-button.tsx`
- Delete: `src/app/(app)/jugar/[id]/_components/join-requests-panel.tsx`
- Modify: `src/app/(app)/jugar/[id]/page.tsx`
- Modify: `src/app/(app)/jugar/[id]/actions.ts`

- [ ] **Step 1: Delete the files**

```bash
rm "src/app/(app)/jugar/[id]/_components/join-request-button.tsx"
rm "src/app/(app)/jugar/[id]/_components/join-requests-panel.tsx"
```

- [ ] **Step 2: Update `page.tsx`**

Open `src/app/(app)/jugar/[id]/page.tsx`:

a) Remove these imports:
```ts
import { JoinRequestButton } from './_components/join-request-button';
import { JoinRequestsPanel } from './_components/join-requests-panel';
```

b) Add this import (we'll create the file in Task 11):
```ts
import { JoinPublicMatchButton } from './_components/join-public-match-button';
```

c) Replace this block:

```tsx
      {match.type === 'OPEN' && match.status === 'OPEN' && !isOrganizer && !isParticipant && !hasPendingRequest && availableSlots > 0 && (
        <JoinRequestButton matchId={id} />
      )}
      {hasPendingRequest && (
        <p className="text-sm text-amber-700 bg-gradient-to-r from-yellow-50 to-amber-100 border border-amber-200 rounded-xl px-4 py-2">
          Tu solicitud está pendiente de aprobación.
        </p>
      )}
```

with:

```tsx
      {match.type === 'OPEN' && match.status === 'OPEN' && match.visibility === 'PUBLIC' && !isOrganizer && !isParticipant && availableSlots > 0 && (
        <JoinPublicMatchButton matchId={id} />
      )}
```

d) Inside the `isOrganizer` block, replace this line:

```tsx
            {match.type === 'OPEN' && <JoinRequestsPanel requests={match.joinRequests} matchId={id} />}
```

with: (delete the line entirely; no replacement)

e) Remove the variable that's now unused:

```ts
const hasPendingRequest = match.joinRequests.some((r) => r.userId === user.id);
```

(delete this line)

- [ ] **Step 3: Update `actions.ts`**

Open `src/app/(app)/jugar/[id]/actions.ts`. Remove these three exports entirely: `requestToJoin`, `approveJoinRequest`, `rejectJoinRequest`. Remove their schemas if any are unique to them.

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: failures will mention `JoinPublicMatchButton` not found (Task 11) and possibly missing tablón changes (Task 10). Continue.

- [ ] **Step 5: No commit yet** — leave green for the bundle.

---

## Task 10 — Frontend: tablón filters PUBLIC + adds direct-join

**Files:**
- Modify: `src/app/(app)/jugar/page.tsx`
- Modify: `src/app/(app)/jugar/[id]/actions.ts` (add `joinPublicMatchAction`)
- Modify: `src/modules/independent-matches/application/independent-match-service.ts` (filter `listOpen`)

- [ ] **Step 1: Filter `listOpen` to public**

In `src/modules/independent-matches/application/independent-match-service.ts`, update:

```ts
async listOpen(): Promise<(IndependentMatchRow & { confirmedCount: number })[]> {
  const matches = await prisma.independentMatch.findMany({
    where: { type: 'OPEN', status: 'OPEN', visibility: 'PUBLIC' },
    include: { _count: { select: { participants: { where: { status: 'ACCEPTED' } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return matches.map((m) => ({
    ...m,
    confirmedCount: m._count.participants,
  }));
},
```

- [ ] **Step 2: Add `joinPublicMatchAction`**

In `src/app/(app)/jugar/[id]/actions.ts`, add:

```ts
export async function joinPublicMatchAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const matchId = formData.get('matchId');
  if (typeof matchId !== 'string') return { error: 'Datos inválidos.' };
  try {
    await IndependentMatchService.joinPublicMatch(matchId, user.id);
    revalidatePath(`/jugar/${matchId}`);
    revalidatePath('/jugar');
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
```

- [ ] **Step 3: Update `/jugar/page.tsx` cards**

Find the loop that renders open matches in the tablón. Add a "Unirme" button on each card. Replace the existing card body (or extend it):

```tsx
import { JoinPublicMatchInlineButton } from './[id]/_components/join-public-match-button';

// inside the open-matches list:
{openMatches.map((m) => {
  const available = calculateAvailableSlots(m.maxPlayers, m.confirmedCount);
  return (
    <li key={m.id} className="block p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <Link href={`/jugar/${m.id}` as Route} className="min-w-0 flex-1">
          <p className="font-bold text-brand-navy truncate">{m.name}</p>
          {m.scheduledAt && (
            <p className="text-sm text-slate-400 mt-0.5">
              {new Intl.DateTimeFormat('es-ES', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit',
                timeZone: 'Europe/Madrid',
              }).format(new Date(m.scheduledAt))}
            </p>
          )}
          {m.location && <p className="text-sm text-slate-400 truncate">{m.location}</p>}
        </Link>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            available === 0 ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700'
          }`}>
            {available === 0 ? 'Completo' : `${available} libre${available !== 1 ? 's' : ''}`}
          </span>
          {available > 0 && <JoinPublicMatchInlineButton matchId={m.id} />}
        </div>
      </div>
    </li>
  );
})}
```

(Imports already present: `Link`, `Route`, `calculateAvailableSlots`. The `JoinPublicMatchInlineButton` will be created in Task 11 — it's a small variant of `JoinPublicMatchButton` that fits a card.)

- [ ] **Step 4: No commit yet.** Continue.

---

## Task 11 — Frontend: `MatchUserPicker` + `JoinPublicMatchButton` + invite-form rewire

**Files:**
- Create: `src/app/(app)/jugar/[id]/_components/match-user-picker.tsx`
- Create: `src/app/(app)/jugar/[id]/_components/join-public-match-button.tsx`
- Modify: `src/app/(app)/jugar/[id]/_components/invite-form.tsx`
- Modify: `src/app/(app)/jugar/[id]/actions.ts` (add `inviteUserToMatchAction`)

- [ ] **Step 1: Create `MatchUserPicker`**

Create `src/app/(app)/jugar/[id]/_components/match-user-picker.tsx`:

```tsx
'use client';

import { useEffect, useId, useRef, useState } from 'react';

type Candidate = { id: string; name: string; avatarUrl: string | null };

interface Props {
  matchId: string;
  /** Hidden form field name. Defaults to "invitedUserId". */
  name?: string;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

export function MatchUserPicker({ matchId, name = 'invitedUserId' }: Props) {
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

  useEffect(() => {
    if (selected || query.trim().length < MIN_CHARS) return;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);
      const url = new URL('/api/users/search', window.location.origin);
      url.searchParams.set('q', query.trim());
      url.searchParams.set('matchId', matchId);

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
  }, [query, matchId, selected]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function onChangeQuery(value: string) {
    setQuery(value);
    if (value.trim().length < MIN_CHARS) {
      setOpen(false);
      setResults([]);
    }
  }

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
          onChange={(e) => onChangeQuery(e.target.value)}
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

- [ ] **Step 2: Create `JoinPublicMatchButton` and inline variant**

Create `src/app/(app)/jugar/[id]/_components/join-public-match-button.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { joinPublicMatchAction } from '../actions';

type ActionResult = { error: string } | { success: true } | null;

export function JoinPublicMatchButton({ matchId }: { matchId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(joinPublicMatchAction, null);
  if (state && 'success' in state) {
    return <p className="text-sm text-green-600 font-medium">¡Estás dentro!</p>;
  }
  return (
    <form action={action}>
      <input type="hidden" name="matchId" value={matchId} />
      {state && 'error' in state && <p className="text-sm text-red-600 mb-2">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? 'Entrando…' : 'Unirme a este partido'}
      </button>
    </form>
  );
}

export function JoinPublicMatchInlineButton({ matchId }: { matchId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(joinPublicMatchAction, null);
  if (state && 'success' in state) {
    return <span className="text-xs text-green-600 font-bold">¡Dentro!</span>;
  }
  return (
    <form action={action}>
      <input type="hidden" name="matchId" value={matchId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs px-3 py-1.5 bg-brand-navy text-white font-bold rounded-full shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? '…' : 'Unirme'}
      </button>
      {state && 'error' in state && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Add `inviteUserToMatchAction` and remove old email-only logic**

In `src/app/(app)/jugar/[id]/actions.ts`, add a new schema and action (keep the existing `inviteByEmail` which still works for email-only invites):

```ts
const inviteUserSchema = z.object({
  matchId: z.string().cuid(),
  invitedUserId: z.string().cuid('Selecciona un jugador del listado.'),
});

export async function inviteUserToMatchAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = inviteUserSchema.safeParse({
    matchId: formData.get('matchId'),
    invitedUserId: formData.get('invitedUserId'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    const { invitationId, isNew } = await IndependentMatchService.inviteUser(
      parsed.data.matchId,
      user.id,
      parsed.data.invitedUserId,
    );

    if (isNew) {
      const token = await SignedTokenService.issue({
        purpose: SignedTokenPurpose.INDEPENDENT_MATCH_INVITE,
        subjectId: invitationId,
        ttlSeconds: 7 * 24 * 60 * 60,
      });

      const matchUrl = `${env().APP_URL}/jugar/${parsed.data.matchId}?token=${token}`;
      const match = await prisma.independentMatch.findUnique({
        where: { id: parsed.data.matchId },
        include: { organizer: { select: { name: true } } },
      });
      const invitee = await prisma.user.findUnique({
        where: { id: parsed.data.invitedUserId },
        select: { name: true, email: true },
      });

      // Email is best-effort; if the user has none configured we skip silently.
      if (invitee?.email) {
        const q = queue();
        await q.start();
        await q.publish('send-email', {
          template: 'ind-match-invite',
          to: invitee.email,
          data: {
            organizerName: match?.organizer.name ?? 'Organizador',
            matchName: match?.name ?? 'Partido',
            matchUrl,
            scheduledAt: match?.scheduledAt?.toLocaleDateString('es-ES') ?? undefined,
            location: match?.location ?? undefined,
          },
          dedupKey: `ind-invite-${invitationId}`,
        });
      }

      await NotificationService.create({
        userId: parsed.data.invitedUserId,
        type: 'INDEPENDENT_MATCH_INVITE',
        title: 'Invitación a partido',
        body: `${match?.organizer.name ?? 'Alguien'} te invita a "${match?.name ?? 'un partido'}".`,
        metadata: { matchId: parsed.data.matchId },
      });
    }

    revalidatePath(`/jugar/${parsed.data.matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
```

- [ ] **Step 4: Update `invite-form.tsx`**

Open `src/app/(app)/jugar/[id]/_components/invite-form.tsx`. Replace its entire contents with:

```tsx
'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { inviteByEmail, inviteUserToMatchAction } from '../actions';
import { MatchUserPicker } from './match-user-picker';

type ActionResult = { error: string } | { success: true } | null;

export function InviteForm({ matchId }: { matchId: string }) {
  const [showEmailFallback, setShowEmailFallback] = useState(false);

  const [userState, userAction, userPending] = useActionState<ActionResult, FormData>(
    inviteUserToMatchAction,
    null,
  );
  const userFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (userState && 'success' in userState) userFormRef.current?.reset();
  }, [userState]);

  const [emailState, emailAction, emailPending] = useActionState<ActionResult, FormData>(
    inviteByEmail,
    null,
  );

  return (
    <div className="space-y-3">
      <form ref={userFormRef} action={userAction} className="flex flex-col gap-2">
        <input type="hidden" name="matchId" value={matchId} />
        <MatchUserPicker matchId={matchId} />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={userPending}
            className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {userPending ? 'Enviando…' : 'Invitar'}
          </button>
          {userState && 'error' in userState && <p className="text-xs text-red-600">{userState.error}</p>}
          {userState && 'success' in userState && <p className="text-xs text-emerald-700">Invitación enviada.</p>}
        </div>
      </form>

      <button
        type="button"
        onClick={() => setShowEmailFallback((v) => !v)}
        className="text-xs text-slate-500 hover:text-slate-700 underline transition-colors"
      >
        {showEmailFallback ? 'Ocultar invitación por email' : '¿No lo encuentras? Invitar por email'}
      </button>

      {showEmailFallback && (
        <form action={emailAction} className="flex gap-2 items-start">
          <input type="hidden" name="matchId" value={matchId} />
          <div className="flex-1">
            <input
              name="email"
              type="email"
              placeholder="email@ejemplo.com"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
            {emailState && 'error' in emailState && <p className="text-xs text-red-600 mt-1">{emailState.error}</p>}
            {emailState && 'success' in emailState && <p className="text-xs text-green-600 mt-1">Invitación enviada.</p>}
          </div>
          <button
            type="submit"
            disabled={emailPending}
            className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 shrink-0 transition-opacity"
          >
            {emailPending ? '…' : 'Invitar'}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```
Expected: green now.

- [ ] **Step 6: Run unit tests**

```bash
pnpm test:unit
```
Expected: all pass.

- [ ] **Step 7: Commit tasks 4-11 together**

```bash
git -C "c:/Users/ferralca/Desktop/Proyectos/Padel League" add \
        src/modules/independent-matches/domain/types.ts \
        src/modules/independent-matches/application/independent-match-service.ts \
        src/modules/users/application/user-search-service.ts \
        src/modules/users/index.ts \
        src/app/api/users/search/route.ts \
        "src/app/(app)/jugar/[id]/page.tsx" \
        "src/app/(app)/jugar/[id]/actions.ts" \
        "src/app/(app)/jugar/[id]/_components/match-user-picker.tsx" \
        "src/app/(app)/jugar/[id]/_components/join-public-match-button.tsx" \
        "src/app/(app)/jugar/[id]/_components/invite-form.tsx" \
        "src/app/(app)/jugar/page.tsx" \
        tests/unit/modules/independent-matches/invite-user.test.ts
git -C "c:/Users/ferralca/Desktop/Proyectos/Padel League" rm \
        "src/app/(app)/jugar/[id]/_components/join-request-button.tsx" \
        "src/app/(app)/jugar/[id]/_components/join-requests-panel.tsx"
git -C "c:/Users/ferralca/Desktop/Proyectos/Padel League" commit -m "feat(jugar): user multi-invite + public/private + drop join-requests"
```

---

## Task 12 — Frontend: `/jugar/nuevo` adds visibility selector + hide team-challenge tab

**Files:**
- Modify: `src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx`
- Modify: `src/app/(app)/jugar/nuevo/actions.ts`

- [ ] **Step 1: Update the action's schema**

In `src/app/(app)/jugar/nuevo/actions.ts`, replace `createOpenSchema`:

```ts
const createOpenSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(100),
  visibility: z.enum(['PUBLIC', 'PRIVATE']),
  scheduledAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => d === undefined || !isNaN(d.getTime()), { message: 'Fecha no válida.' }),
  location: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  maxPlayers: z.coerce
    .number()
    .refine((n): n is 2 | 4 => n === 2 || n === 4, { message: 'El máximo de jugadores debe ser 2 o 4.' }),
});
```

And update the body of `createOpenMatch` to read `visibility` from `formData`:

```ts
const parsed = createOpenSchema.safeParse({
  name: formData.get('name'),
  visibility: formData.get('visibility'),
  scheduledAt: formData.get('scheduledAt') || undefined,
  location: formData.get('location') || undefined,
  description: formData.get('description') || undefined,
  maxPlayers: formData.get('maxPlayers'),
});
```

- [ ] **Step 2: Update the create-match form**

Open `src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx`. The file is long; the changes:

a) Add a visibility selector in the OPEN-creation tab. Place it near `maxPlayers`:

```tsx
<fieldset className="border border-slate-200 rounded-xl p-3">
  <legend className="px-1 text-xs font-bold text-slate-500 uppercase tracking-widest">Visibilidad</legend>
  <div className="flex gap-2 mt-1">
    <label className="flex-1 cursor-pointer">
      <input type="radio" name="visibility" value="PUBLIC" defaultChecked className="peer sr-only" />
      <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
        👁️ Público
      </span>
    </label>
    <label className="flex-1 cursor-pointer">
      <input type="radio" name="visibility" value="PRIVATE" className="peer sr-only" />
      <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
        🔒 Privado
      </span>
    </label>
  </div>
  <p className="mt-1 text-xs text-slate-400">
    Público: aparece en el tablón y cualquiera puede unirse. Privado: solo por invitación.
  </p>
</fieldset>
```

b) Hide the team-challenge tab (the section that uses `challengeLeagues` from props). Wrap the entire challenge tab markup in `false && (…)` — or simpler, comment it out by wrapping in `{/* … */}`. Keep the OPEN tab visible. Optionally remove the tab bar buttons that switch between them; the user only sees the OPEN form.

- [ ] **Step 3: Run typecheck and dev smoke**

```bash
pnpm typecheck
pnpm dev
```
Browse to `/jugar/nuevo`. Confirm: the visibility selector renders, the team-challenge UI is gone, you can create a public and a private match.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx" "src/app/(app)/jugar/nuevo/actions.ts"
git commit -m "feat(jugar): visibility selector on create form, hide team-challenge tab"
```

---

## Task 13 — Integration tests

**Files:**
- Create: `tests/integration/match-public-join.test.ts`
- Create: `tests/integration/match-user-search.test.ts`

- [ ] **Step 1: Write `match-public-join.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { IndependentMatchService } from '@/modules/independent-matches';

const prisma = testPrisma();

async function user(name: string, suffix: string) {
  return prisma.user.create({
    data: { name, email: `${suffix}@t.com`, passwordHash: 'h', emailVerifiedAt: new Date() },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('joinPublicMatch', () => {
  it('lets a user join a public match with free slot', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    const joiner = await user('Joiner', `j-${Date.now()}`);
    const m = await IndependentMatchService.createOpen({
      organizerId: org.id,
      name: 'P',
      visibility: 'PUBLIC',
      maxPlayers: 2,
    });

    await IndependentMatchService.joinPublicMatch(m.id, joiner.id);

    const ps = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: m.id, status: 'ACCEPTED' },
    });
    expect(ps.map((p) => p.userId).sort()).toEqual([org.id, joiner.id].sort());

    const updated = await prisma.independentMatch.findUniqueOrThrow({ where: { id: m.id } });
    expect(updated.status).toBe('CONFIRMED');
  });

  it('rejects join on a private match', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    const joiner = await user('Joiner', `j-${Date.now()}`);
    const m = await IndependentMatchService.createOpen({
      organizerId: org.id,
      name: 'P',
      visibility: 'PRIVATE',
      maxPlayers: 4,
    });

    await expect(
      IndependentMatchService.joinPublicMatch(m.id, joiner.id),
    ).rejects.toThrow(/no es público/i);
  });

  it('only one of two concurrent joins for the last slot succeeds', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    const a = await user('A', `a-${Date.now()}`);
    const b = await user('B', `b-${Date.now()}`);
    const m = await IndependentMatchService.createOpen({
      organizerId: org.id,
      name: 'Race',
      visibility: 'PUBLIC',
      maxPlayers: 2,
    });

    const results = await Promise.allSettled([
      IndependentMatchService.joinPublicMatch(m.id, a.id),
      IndependentMatchService.joinPublicMatch(m.id, b.id),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const fail = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);

    const ps = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: m.id, status: 'ACCEPTED' },
    });
    expect(ps).toHaveLength(2); // organizer + 1 winner
  });
});

describe('listOpen visibility filter', () => {
  it('omits private matches', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    await IndependentMatchService.createOpen({ organizerId: org.id, name: 'Pub', visibility: 'PUBLIC', maxPlayers: 4 });
    await IndependentMatchService.createOpen({ organizerId: org.id, name: 'Priv', visibility: 'PRIVATE', maxPlayers: 4 });
    const list = await IndependentMatchService.listOpen();
    expect(list.map((m) => m.name)).toEqual(['Pub']);
  });
});
```

- [ ] **Step 2: Write `match-user-search.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { UserSearchService } from '@/modules/users';
import { IndependentMatchService } from '@/modules/independent-matches';

const prisma = testPrisma();

async function user(name: string, suffix: string) {
  return prisma.user.create({
    data: { name, email: `${suffix}@t.com`, passwordHash: 'h', emailVerifiedAt: new Date() },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('UserSearchService.searchCandidatesForMatch', () => {
  it('excludes self, current participants, and pending invitees', async () => {
    const org = await user('Owner', `own-${Date.now()}`);
    const inside = await user('Juan Dentro', `in-${Date.now()}`);
    const pending = await user('Juan Pending', `pen-${Date.now()}`);
    const open = await user('Juan Libre', `ok-${Date.now()}`);
    const noise = await user('Pedro', `pedro-${Date.now()}`);

    const m = await IndependentMatchService.createOpen({
      organizerId: org.id,
      name: 'M',
      visibility: 'PRIVATE',
      maxPlayers: 4,
    });
    await prisma.independentMatchParticipant.create({
      data: { independentMatchId: m.id, userId: inside.id, status: 'ACCEPTED' },
    });
    await IndependentMatchService.inviteUser(m.id, org.id, pending.id);

    const rows = await UserSearchService.searchCandidatesForMatch({
      q: 'jua',
      matchId: m.id,
      callerId: org.id,
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(org.id);
    expect(ids).not.toContain(inside.id);
    expect(ids).not.toContain(pending.id);
    expect(ids).not.toContain(noise.id);
  });
});
```

- [ ] **Step 3: Run integration tests**

```bash
pnpm test:integration -- tests/integration/match-public-join.test.ts tests/integration/match-user-search.test.ts
```
Expected: all pass. (If docker is unavailable in this environment, this step fails locally but will pass in CI / on Vercel preview.)

- [ ] **Step 4: Commit**

```bash
git add tests/integration/match-public-join.test.ts tests/integration/match-user-search.test.ts
git commit -m "test(jugar): integration tests for public-join race and match-scoped user search"
```

---

## Task 14 — Final validation + push

- [ ] **Step 1: Full validation**

```bash
pnpm typecheck && pnpm test:unit && pnpm next build
```
Expected: all green.

- [ ] **Step 2: Manual smoke (after deploy)**

In production:
1. Create a public 2-player match. Confirm it appears in the tablón with "1 libre" and a "Unirme" button.
2. From a different account, click "Unirme" → "¡Estás dentro!" Confirm match shows CONFIRMED, both as participants, no email visible.
3. Create a private match. Confirm it does NOT appear in the tablón.
4. Open the private match as organizer. Type a name in the typeahead. Pick → click "Invitar". Confirm pending invitation appears.
5. Cancel an invitation. Confirm the row vanishes.
6. From the invited account, accept the invitation. Confirm participant added.
7. Race smoke (optional): two browsers, both click "Unirme" on a 2-player public match with 1 slot left. One succeeds, the other gets "Este partido ya está completo".

- [ ] **Step 3: Push**

```bash
git push origin main
```
Vercel deploy applies the migrations on `prisma migrate deploy`. Verify in Vercel logs that all three Stage 1 migrations completed.

---

## Deferred (still inside Stage 1 scope, separate follow-up commit)

The spec lists a proactive `INDEPENDENT_MATCH_FULL` in-app notification for pending invitees when the match closes. This plan ships the reactive path only (an invitee who tries to accept too late sees "Este partido ya está completo"). Deferring the proactive notification keeps Stage 1 focused; it is a small follow-up:

1. Add `INDEPENDENT_MATCH_FULL` to the `NotificationType` enum (one-line Prisma migration).
2. After `joinPublicMatch` or `acceptInvitation` flips the match to `CONFIRMED`, find all pending `IndependentMatchInvitation` rows with `invitedUserId IS NOT NULL` and fire a notification per invitee.
3. (Optional) email — same dedup pattern.

Do this as a single task before tagging Stage 1 done if the user wants the proactive UX before moving to Stage 2.
