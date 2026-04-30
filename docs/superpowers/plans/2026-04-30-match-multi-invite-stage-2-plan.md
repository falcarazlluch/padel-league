# Match Multi-Invite — Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-30-match-multi-invite-design.md`
**Stage 1 plan (reference, already shipped):** `docs/superpowers/plans/2026-04-30-match-multi-invite-stage-1-plan.md`

**Goal:** Finish the consolidation: introduce a host-team concept, allow inviting whole teams, drop the legacy TEAM_CHALLENGE flow, and migrate any existing challenge rows into the new model.

**Architecture:** Add `host_team_id` to `IndependentMatch` and `invited_team_id` to `IndependentMatchInvitation` (extending the polymorphic CHECK to three branches). A SQL data migration rewrites every legacy `TEAM_CHALLENGE` row into the new model. The service drops `createChallenge / acceptChallenge / rejectChallenge`, extends `createOpen` to seed two participants when a host team is set, and adds `inviteTeam`. `acceptInvitation` grows a team branch that fills two slots in one transaction. The frontend rename merges `MatchUserPicker` into a single `MatchEntityPicker` that mixes users and teams from two parallel search endpoints.

**Tech Stack:** Same as Stage 1 — Next.js 15 (App Router, React 18), Prisma 5, Postgres + `unaccent`, pg-boss, Vitest, Tailwind.

**Reactive notifications only:** Per user direction, do NOT add a proactive `INDEPENDENT_MATCH_FULL` notification when a match closes. Pending invitees only see "Este partido ya está completo" if they try to accept after the match is full.

---

## File Structure

**Created:**

- `prisma/migrations/<ts>_match_host_team_and_team_invite/migration.sql` — adds `host_team_id`, `invited_team_id`, extends CHECK to 3 branches.
- `prisma/migrations/<ts>_migrate_team_challenges_to_open/migration.sql` — pure DML.
- `prisma/migrations/<ts>_drop_match_legacy_columns/migration.sql` — drops `type`, `organizer_team_id`, `challenged_team_id`, drops `IndependentMatchType` enum.
- `src/modules/teams/application/team-search-service.ts` — `TeamSearchService.searchInvitableForMatch`.
- `src/app/api/teams/search/route.ts` — `GET ?q=&matchId=` returning teams.
- `tests/integration/match-team-invite.test.ts` — race-safe team accept + slot-block + already-invited.
- `tests/integration/match-team-search.test.ts` — exclusion logic + response shape.

**Renamed (file moves):**

- `src/app/(app)/jugar/[id]/_components/match-user-picker.tsx` → `match-entity-picker.tsx`. Component renamed `MatchUserPicker` → `MatchEntityPicker`, generalised to mix users and teams.

**Modified:**

- `prisma/schema.prisma` — three rounds, one per migration.
- `src/modules/teams/index.ts` — re-export `TeamSearchService`.
- `src/modules/independent-matches/domain/types.ts` — drop `CreateChallengeInput`, `TeamForChallenge`; drop `type` and `challengedTeam(Id)` from row/detail; add `hostTeamId` to row + `hostTeam` to detail; extend invitation shape.
- `src/modules/independent-matches/application/independent-match-service.ts` — drop `createChallenge / acceptChallenge / rejectChallenge / getTeamsForUser`; remove `challengedTeam` from `MATCH_DETAIL_INCLUDE`, add `hostTeam`; extend `createOpen` with `hostTeamId`; add `inviteTeam`; generalise `acceptInvitation` for team branch.
- `src/app/(app)/jugar/[id]/page.tsx` — drop `ChallengePanel` import + usage; rename "Invitar por email" header to "Invitar".
- `src/app/(app)/jugar/[id]/actions.ts` — drop `respondToChallenge`; extend `inviteUserToMatchAction` to also accept `invitedTeamId` (or add a parallel `inviteTeamToMatchAction`).
- `src/app/(app)/jugar/[id]/_components/invite-form.tsx` — uses `MatchEntityPicker`; the form posts either `invitedUserId` or `invitedTeamId` to the unified action.
- `src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx` — adds host-kind picker (USER/TEAM); forces `maxPlayers = 4` when TEAM; shows the user's teams in a select.
- `src/app/(app)/jugar/nuevo/actions.ts` — schema accepts `hostKind` + optional `hostTeamId`.
- `src/app/(app)/jugar/nuevo/page.tsx` — loads the user's teams and passes them to the form.

**Deleted:**

- `src/app/(app)/jugar/[id]/_components/challenge-panel.tsx`

**NOT touched in this plan (deferred):**

- Cleanup of `IndependentMatchStatus` legacy values (`PENDING_APPROVAL`, `REJECTED`) — Postgres can't drop enum values without a recreate-and-cast dance. After the data migration no rows use them; leaving them as orphans is harmless. Defer to a future enum-cleanup commit if the user asks.

---

## Task 1 — Schema: add `host_team_id`, `invited_team_id`, extend CHECK

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_match_host_team_and_team_invite/migration.sql`

- [ ] **Step 1: Update `prisma/schema.prisma`**

In `model IndependentMatch`, add the new field (right after `organizerTeamId`):

```prisma
  hostTeamId       String?              @map("host_team_id")
  hostTeam         Team?                @relation("MatchHostTeam", fields: [hostTeamId], references: [id], onDelete: SetNull)
```

If the existing relation block has `organizerTeam` referencing the same `Team` model, give the new relation a unique `name` (`"MatchHostTeam"`) so Prisma can disambiguate while both columns coexist briefly.

In `model IndependentMatchInvitation`, add:

```prisma
  invitedTeamId String?  @map("invited_team_id")
  invitedTeam   Team?    @relation(fields: [invitedTeamId], references: [id], onDelete: Cascade)

  @@unique([matchId, invitedTeamId], map: "imi_match_team_uniq")
```

In `model Team`, add the back-relations:

```prisma
  hostedMatches            IndependentMatch[]            @relation("MatchHostTeam")
  matchInvitationsReceived IndependentMatchInvitation[]
```

(If `Team` already has a `matchInvitationsReceived` relation pointing somewhere else, give the new one a different name.)

- [ ] **Step 2: Create the migration manually**

Path: `prisma/migrations/20260430180000_match_host_team_and_team_invite/migration.sql`

Content:

```sql
-- AlterTable: add host_team_id to independent_matches
ALTER TABLE "independent_matches" ADD COLUMN "host_team_id" TEXT;
ALTER TABLE "independent_matches"
  ADD CONSTRAINT "independent_matches_host_team_id_fkey"
  FOREIGN KEY ("host_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add invited_team_id to independent_match_invitations
ALTER TABLE "independent_match_invitations" ADD COLUMN "invited_team_id" TEXT;
ALTER TABLE "independent_match_invitations"
  ADD CONSTRAINT "independent_match_invitations_invited_team_id_fkey"
  FOREIGN KEY ("invited_team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique index: at most one pending team invitation per match.
CREATE UNIQUE INDEX "imi_match_team_uniq"
  ON "independent_match_invitations"("match_id", "invited_team_id")
  WHERE "invited_team_id" IS NOT NULL;

-- Replace the polymorphic CHECK with a 3-branch version.
ALTER TABLE "independent_match_invitations" DROP CONSTRAINT IF EXISTS "imi_one_target";
ALTER TABLE "independent_match_invitations"
  ADD CONSTRAINT "imi_one_target" CHECK (
    (CASE WHEN "email" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "invited_user_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "invited_team_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
```

- [ ] **Step 3: Apply locally**

```bash
pnpm prisma migrate dev
pnpm prisma generate
```

Expected: "Database is now in sync with your Prisma schema."

If docker is not available locally, skip the apply. The migration runs on Vercel.

- [ ] **Step 4: Verify typecheck still green**

```bash
pnpm typecheck
```
Expected: green. New fields are optional, so existing code keeps compiling.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): add host_team_id and invited_team_id with 3-branch CHECK"
```

---

## Task 2 — Schema: data migration of legacy TEAM_CHALLENGE matches

**Files:**
- Create: `prisma/migrations/<ts>_migrate_team_challenges_to_open/migration.sql`

This is a DML-only migration. It rewrites legacy challenge data into the new model **before** any code reads from the new columns and **before** legacy columns are dropped (Task 3). It must be idempotent so it's safe to re-run.

- [ ] **Step 1: Create the migration manually**

Path: `prisma/migrations/20260430180100_migrate_team_challenges_to_open/migration.sql`

Content:

```sql
-- 1) Backfill host_team_id from organizer_team_id for every legacy TEAM_CHALLENGE row.
--    For OPEN rows, organizer_team_id is null, so this is a no-op for them.
UPDATE "independent_matches"
SET "host_team_id" = "organizer_team_id",
    "visibility" = 'PRIVATE'
WHERE "type" = 'TEAM_CHALLENGE'
  AND "host_team_id" IS NULL;

-- 2) For PENDING_APPROVAL challenges, create a team invitation pointing at the
--    challenged team so the invitee can still accept after migration.
INSERT INTO "independent_match_invitations" (id, match_id, invited_team_id, expires_at, created_at)
SELECT
  -- cuid-shaped id from md5; prefix to avoid collisions
  'cmgr' || substring(md5(random()::text || im.id), 1, 21),
  im.id,
  im.challenged_team_id,
  now() + interval '7 days',
  now()
FROM "independent_matches" im
WHERE im."type" = 'TEAM_CHALLENGE'
  AND im."status" = 'PENDING_APPROVAL'
  AND im."challenged_team_id" IS NOT NULL
ON CONFLICT ("match_id", "invited_team_id") DO NOTHING;

-- 3) Map status: PENDING_APPROVAL -> OPEN; REJECTED -> CANCELLED.
UPDATE "independent_matches"
SET "status" = 'OPEN'
WHERE "type" = 'TEAM_CHALLENGE'
  AND "status" = 'PENDING_APPROVAL';

UPDATE "independent_matches"
SET "status" = 'CANCELLED'
WHERE "type" = 'TEAM_CHALLENGE'
  AND "status" = 'REJECTED';

-- 4) Switch the type. After this, no rows have type = 'TEAM_CHALLENGE'.
UPDATE "independent_matches"
SET "type" = 'OPEN'
WHERE "type" = 'TEAM_CHALLENGE';
```

- [ ] **Step 2: Apply locally**

```bash
pnpm prisma migrate dev
```

Expected: applies cleanly. If you have legacy challenge data in your local DB, query a few rows to confirm `host_team_id` is now populated and `type = 'OPEN'`.

If docker is not available locally, skip the apply.

- [ ] **Step 3: Commit**

```bash
git add prisma/migrations
git commit -m "feat(schema): migrate TEAM_CHALLENGE rows into the OPEN model"
```

---

## Task 3 — Schema: drop legacy columns + drop `IndependentMatchType` enum

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_drop_match_legacy_columns/migration.sql`

After Task 2, no code or data reads the legacy columns. Drop them.

- [ ] **Step 1: Update `prisma/schema.prisma`**

In `model IndependentMatch`, delete these lines:

```prisma
  type             IndependentMatchType  @default(OPEN)
  organizerTeamId  String?               @map("organizer_team_id")
  organizerTeam    Team?                 @relation("MatchOrganizerTeam", fields: [organizerTeamId], references: [id], onDelete: SetNull)
  challengedTeamId String?               @map("challenged_team_id")
  challengedTeam   Team?                 @relation("MatchChallengedTeam", fields: [challengedTeamId], references: [id], onDelete: SetNull)
```

(The exact relation names may differ — match the existing names in the file.)

Delete the entire `enum IndependentMatchType { OPEN, TEAM_CHALLENGE }` block.

In `model Team`, drop the corresponding back-relations:

```prisma
  organizedMatches    IndependentMatch[]  @relation("MatchOrganizerTeam")
  challengedMatches   IndependentMatch[]  @relation("MatchChallengedTeam")
```

- [ ] **Step 2: Create the migration manually**

Path: `prisma/migrations/20260430180200_drop_match_legacy_columns/migration.sql`

Content:

```sql
-- DropForeignKey on legacy columns
ALTER TABLE "independent_matches" DROP CONSTRAINT IF EXISTS "independent_matches_organizer_team_id_fkey";
ALTER TABLE "independent_matches" DROP CONSTRAINT IF EXISTS "independent_matches_challenged_team_id_fkey";

-- DropColumn
ALTER TABLE "independent_matches" DROP COLUMN "organizer_team_id";
ALTER TABLE "independent_matches" DROP COLUMN "challenged_team_id";
ALTER TABLE "independent_matches" DROP COLUMN "type";

-- DropEnum (no column references it anymore)
DROP TYPE "IndependentMatchType";
```

- [ ] **Step 3: Apply locally**

```bash
pnpm prisma migrate dev
pnpm prisma generate
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: failures will appear in `independent-match-service.ts`, `domain/types.ts`, `actions.ts`, `page.tsx`, `listOpen` (via the now-removed `type` filter), and the create-match form / actions, since they reference `type`, `organizerTeamId`, `challengedTeamId`. These are fixed in tasks 4-7.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): drop legacy match type, organizer_team_id, challenged_team_id"
```

---

## Task 4 — Service: drop challenge methods, drop legacy types, update `MATCH_DETAIL_INCLUDE`

**Files:**
- Modify: `src/modules/independent-matches/domain/types.ts`
- Modify: `src/modules/independent-matches/application/independent-match-service.ts`

- [ ] **Step 1: Update `domain/types.ts`**

a) Delete the `CreateChallengeInput` and `TeamForChallenge` types entirely.

b) Update `IndependentMatchRow`: remove `type`, `organizerTeamId`, `challengedTeamId`. Add `hostTeamId: string | null`.

```ts
import type { IndependentMatchStatus, MatchVisibility, ParticipantStatus } from '@prisma/client';

export type IndependentMatchRow = {
  id: string;
  name: string;
  visibility: MatchVisibility;
  organizerId: string;
  hostTeamId: string | null;
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

(Note: `IndependentMatchType` is no longer imported.)

c) Update `IndependentMatchDetail`: remove `challengedTeam`. Add `hostTeam`. Extend `invitations` to include `invitedTeamId` and `invitedTeam`.

```ts
export type IndependentMatchDetail = IndependentMatchRow & {
  organizer: { id: string; name: string };
  hostTeam: { id: string; name: string; logoUrl: string | null } | null;
  league: { id: string; name: string; slug: string } | null;
  participants: { userId: string; user: { id: string; name: string }; status: ParticipantStatus }[];
  invitations: {
    id: string;
    email: string | null;
    invitedUserId: string | null;
    invitedUser: { id: string; name: string } | null;
    invitedTeamId: string | null;
    invitedTeam: { id: string; name: string; logoUrl: string | null } | null;
    acceptedAt: Date | null;
    createdAt: Date;
  }[];
};
```

d) Add `CreateOpenMatchInput.hostTeamId`:

```ts
export type CreateOpenMatchInput = {
  organizerId: string;
  name: string;
  visibility: MatchVisibility;
  hostTeamId?: string;
  scheduledAt?: Date;
  location?: string;
  description?: string;
  maxPlayers: 2 | 4;
};
```

- [ ] **Step 2: Update `independent-match-service.ts`**

a) Update `MATCH_DETAIL_INCLUDE`:

```ts
const MATCH_DETAIL_INCLUDE = {
  organizer: { select: { id: true, name: true } },
  hostTeam: { select: { id: true, name: true, logoUrl: true } },
  league: { select: { id: true, name: true, slug: true } },
  participants: {
    where: { status: 'ACCEPTED' as const },
    include: { user: { select: { id: true, name: true } } },
  },
  invitations: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      invitedUser: { select: { id: true, name: true } },
      invitedTeam: { select: { id: true, name: true, logoUrl: true } },
    },
  },
} as const;
```

b) Remove `createChallenge`, `acceptChallenge`, `rejectChallenge`, `getTeamsForUser` from the service object entirely. Their tests are nothing to delete (unit tests only covered things we kept).

c) Update `listOpen` to drop the `type` filter (which no longer exists):

```ts
async listOpen(): Promise<(IndependentMatchRow & { confirmedCount: number })[]> {
  const matches = await prisma.independentMatch.findMany({
    where: { status: 'OPEN', visibility: 'PUBLIC' },
    include: { _count: { select: { participants: { where: { status: 'ACCEPTED' } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return matches.map((m) => ({
    ...m,
    confirmedCount: m._count.participants,
  }));
},
```

d) Update `inviteByEmail` (and any helper) that referenced `match.type` or `'PENDING_APPROVAL'` — only `'OPEN'` remains as an invitable status:

```ts
if (match.status !== 'OPEN')
  throw new DomainError('MATCH_NOT_INVITABLE', 'No se puede invitar a este partido.');
```

Apply the same change inside `inviteUser`.

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```
Expected: errors in `actions.ts` and `page.tsx` (the action `respondToChallenge`, the `ChallengePanel` import, the render branch using `match.type` / `match.challengedTeam`). Those are fixed in tasks 7-9.

- [ ] **Step 4: Run unit tests**

```bash
pnpm test:unit
```

If any unit test imports `IndependentMatchType` or references the dropped methods, update it:
- `tests/unit/modules/independent-matches/invite-user.test.ts` — already mocks via the service surface, no change expected.
- `tests/unit/modules/independent-matches/slots.test.ts` — pure function test, no change expected.

Expected: 123 tests pass.

- [ ] **Step 5: No commit yet** — bundle with tasks 5-7. Continue.

---

## Task 5 — Service: extend `createOpen` with `hostTeamId`

**Files:**
- Modify: `src/modules/independent-matches/application/independent-match-service.ts`

- [ ] **Step 1: Replace `createOpen` with the host-team-aware version**

```ts
async createOpen(input: CreateOpenMatchInput): Promise<IndependentMatchRow> {
  // Host-team validation up-front, outside the TX, to give a fast error path.
  let hostTeamMembers: { userId: string }[] = [];
  if (input.hostTeamId) {
    if (input.maxPlayers !== 4)
      throw new DomainError('TEAM_HOST_REQUIRES_4', 'Un partido como equipo debe tener 4 jugadores.');
    const team = await prisma.team.findUnique({
      where: { id: input.hostTeamId },
      include: { members: { select: { userId: true } } },
    });
    if (!team)
      throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo organizador no encontrado.');
    if (!team.members.some((m) => m.userId === input.organizerId))
      throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro del equipo organizador.');
    hostTeamMembers = team.members;
  }

  const match = await prisma.$transaction(async (tx) => {
    const m = await tx.independentMatch.create({
      data: {
        organizerId: input.organizerId,
        name: input.name,
        visibility: input.visibility,
        hostTeamId: input.hostTeamId ?? null,
        scheduledAt: input.scheduledAt ?? null,
        location: input.location ?? null,
        description: input.description ?? null,
        maxPlayers: input.maxPlayers,
      },
    });

    const seedUserIds = input.hostTeamId
      ? hostTeamMembers.map((mem) => mem.userId)
      : [input.organizerId];

    await tx.independentMatchParticipant.createMany({
      data: seedUserIds.map((userId) => ({
        independentMatchId: m.id,
        userId,
        status: 'ACCEPTED' as const,
      })),
      skipDuplicates: true,
    });

    return m;
  });
  return match;
},
```

- [ ] **Step 2: Run typecheck and existing unit tests**

```bash
pnpm typecheck
pnpm test:unit
```
Expected: existing tests still green.

- [ ] **Step 3: No commit yet** — bundle.

---

## Task 6 — Service: add `inviteTeam` and generalise `acceptInvitation`

**Files:**
- Modify: `src/modules/independent-matches/application/independent-match-service.ts`
- Create: `tests/unit/modules/independent-matches/invite-team.test.ts`

- [ ] **Step 1: Add `inviteTeam`**

Place this method right after `inviteUser`:

```ts
async inviteTeam(
  matchId: string,
  organizerId: string,
  invitedTeamId: string,
): Promise<{ invitationId: string; isNew: boolean }> {
  const match = await prisma.independentMatch.findUnique({
    where: { id: matchId },
    include: { participants: { where: { status: 'ACCEPTED' } } },
  });
  if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
  if (match.organizerId !== organizerId)
    throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede invitar.');
  if (match.status !== 'OPEN')
    throw new DomainError('MATCH_NOT_INVITABLE', 'No se puede invitar a este partido.');
  if (calculateAvailableSlots(match.maxPlayers, match.participants.length) < 2)
    throw new DomainError('NOT_ENOUGH_SLOTS_FOR_TEAM', 'No quedan dos huecos libres para invitar a un equipo.');
  if (match.hostTeamId === invitedTeamId)
    throw new DomainError('CANNOT_INVITE_OWN_TEAM', 'No puedes invitar a tu propio equipo.');

  const team = await prisma.team.findUnique({
    where: { id: invitedTeamId },
    include: { members: { select: { userId: true } } },
  });
  if (!team) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo no encontrado.');

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const existing = await prisma.independentMatchInvitation.findFirst({
    where: { matchId, invitedTeamId },
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
        data: { matchId, invitedTeamId, expiresAt },
      });

  return { invitationId: invitation.id, isNew: true };
},
```

- [ ] **Step 2: Replace `acceptInvitation` with the team-aware version**

```ts
async acceptInvitation(token: string, userId: string): Promise<string> {
  const { subjectId } = await SignedTokenService.consume(token, SignedTokenPurpose.INDEPENDENT_MATCH_INVITE);

  const invitation = await prisma.independentMatchInvitation.findUnique({
    where: { id: subjectId },
    include: {
      match: { include: { participants: { where: { status: 'ACCEPTED' } } } },
      invitedTeam: { include: { members: { select: { userId: true } } } },
    },
  });
  if (!invitation) throw new NotFoundError('INVITATION_NOT_FOUND', 'Invitación no encontrada.');
  if (invitation.acceptedAt) throw new DomainError('ALREADY_ACCEPTED', 'Esta invitación ya fue usada.');

  const { match } = invitation;
  if (match.status === 'CANCELLED') throw new DomainError('MATCH_CANCELLED', 'Este partido fue cancelado.');

  // Branch on invitation kind.
  if (invitation.invitedTeamId !== null) {
    if (!invitation.invitedTeam)
      throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo invitado no encontrado.');
    const isMember = invitation.invitedTeam.members.some((m) => m.userId === userId);
    if (!isMember)
      throw new AuthorizationError('NOT_INVITEE', 'Esta invitación es para un equipo del que no formas parte.');

    const teamUserIds = invitation.invitedTeam.members.map((m) => m.userId);

    await prisma.$transaction(async (tx) => {
      // Fresh read inside the TX for race-safety. `match.participants` loaded
      // outside the TX may be stale if someone joined between the two reads.
      const currentParticipants = await tx.independentMatchParticipant.findMany({
        where: { independentMatchId: match.id, status: 'ACCEPTED' },
        select: { userId: true },
      });
      const currentIds = new Set(currentParticipants.map((p) => p.userId));
      const newcomers = teamUserIds.filter((uid) => !currentIds.has(uid));

      if (currentIds.size + newcomers.length > match.maxPlayers)
        throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

      await tx.independentMatchInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      if (newcomers.length > 0) {
        await tx.independentMatchParticipant.createMany({
          data: newcomers.map((uid) => ({
            independentMatchId: match.id,
            userId: uid,
            status: 'ACCEPTED' as const,
          })),
          skipDuplicates: true,
        });
      }

      const totalAfter = currentIds.size + newcomers.length;
      if (totalAfter >= match.maxPlayers) {
        await tx.independentMatch.update({ where: { id: match.id }, data: { status: 'CONFIRMED' } });
      }
    });

    NotificationService.create({
      userId: match.organizerId,
      type: 'INDEPENDENT_MATCH_CONFIRMED',
      title: 'Equipo aceptó tu invitación',
      body: `${invitation.invitedTeam.name} se unió a "${match.name}".`,
      metadata: { matchId: match.id },
    }).catch(() => undefined);

    return match.id;
  }

  // User-targeted invitation (existing behaviour).
  if (invitation.invitedUserId !== null && invitation.invitedUserId !== userId) {
    throw new AuthorizationError('NOT_INVITEE', 'Esta invitación no es para ti.');
  }

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

- [ ] **Step 3: Add unit tests for `inviteTeam`**

Create `tests/unit/modules/independent-matches/invite-team.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndependentMatchService } from '@/modules/independent-matches';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    independentMatch: { findUnique: vi.fn() },
    independentMatchInvitation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    team: { findUnique: vi.fn() },
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    independentMatch: { findUnique: ReturnType<typeof vi.fn> };
    independentMatchInvitation: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    team: { findUnique: ReturnType<typeof vi.fn> };
  };
}

describe('IndependentMatchService.inviteTeam', () => {
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
      hostTeamId: 'host-team',
      participants: [],
    });

    await expect(
      IndependentMatchService.inviteTeam('m1', 'u1', 't2'),
    ).rejects.toThrow(/organizador/i);
  });

  it('rejects when fewer than 2 slots remain', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      hostTeamId: 'host-team',
      participants: [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }],
    });

    await expect(
      IndependentMatchService.inviteTeam('m1', 'u1', 't2'),
    ).rejects.toThrow(/dos huecos/i);
  });

  it('rejects when invited team is the host team', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      hostTeamId: 'team-x',
      participants: [{ userId: 'u1' }, { userId: 'u2' }],
    });

    await expect(
      IndependentMatchService.inviteTeam('m1', 'u1', 'team-x'),
    ).rejects.toThrow(/tu propio equipo/i);
  });

  it('returns existing pending team invitation as not-new', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      hostTeamId: null,
      participants: [{ userId: 'u1' }],
    });
    prisma.team.findUnique.mockResolvedValue({ id: 't2', members: [{ userId: 'u3' }, { userId: 'u4' }] });
    const future = new Date(Date.now() + 60_000);
    prisma.independentMatchInvitation.findFirst.mockResolvedValue({
      id: 'inv1',
      acceptedAt: null,
      expiresAt: future,
    });

    const result = await IndependentMatchService.inviteTeam('m1', 'u1', 't2');
    expect(result).toEqual({ invitationId: 'inv1', isNew: false });
    expect(prisma.independentMatchInvitation.create).not.toHaveBeenCalled();
  });

  it('creates a new team invitation when none exists', async () => {
    const prisma = await getPrisma();
    prisma.independentMatch.findUnique.mockResolvedValue({
      id: 'm1',
      organizerId: 'u1',
      maxPlayers: 4,
      status: 'OPEN',
      hostTeamId: null,
      participants: [{ userId: 'u1' }],
    });
    prisma.team.findUnique.mockResolvedValue({ id: 't2', members: [{ userId: 'u3' }, { userId: 'u4' }] });
    prisma.independentMatchInvitation.findFirst.mockResolvedValue(null);
    prisma.independentMatchInvitation.create.mockResolvedValue({ id: 'inv-new' });

    const result = await IndependentMatchService.inviteTeam('m1', 'u1', 't2');
    expect(result).toEqual({ invitationId: 'inv-new', isNew: true });
    expect(prisma.independentMatchInvitation.create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Run unit tests**

```bash
pnpm test:unit
```

Expected: 5 new tests pass; 128 total.

- [ ] **Step 5: No commit yet** — bundle. Continue.

---

## Task 7 — Search: `TeamSearchService` + `/api/teams/search`

**Files:**
- Create: `src/modules/teams/application/team-search-service.ts`
- Modify: `src/modules/teams/index.ts`
- Create: `src/app/api/teams/search/route.ts`

- [ ] **Step 1: Create `team-search-service.ts`**

```ts
import { prisma } from '@/shared/db/client';

export type TeamCandidate = {
  id: string;
  name: string;
  logoUrl: string | null;
  memberCount: number;
};

export interface SearchInvitableForMatchInput {
  q: string;
  matchId: string;
  callerId: string;
  limit?: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

export const TeamSearchService = {
  async searchInvitableForMatch(input: SearchInvitableForMatchInput): Promise<TeamCandidate[]> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    return prisma.$queryRaw<TeamCandidate[]>`
      SELECT t.id, t.name, t.logo_url AS "logoUrl",
             (SELECT COUNT(*)::int FROM team_members tm WHERE tm.team_id = t.id) AS "memberCount"
      FROM teams t
      WHERE t.id != COALESCE(
        (SELECT host_team_id FROM independent_matches WHERE id = ${input.matchId}),
        '00000000-0000-0000-0000-000000000000'
      )
        AND t.id NOT IN (
          SELECT imi.invited_team_id FROM independent_match_invitations imi
          WHERE imi.match_id = ${input.matchId}
            AND imi.invited_team_id IS NOT NULL
            AND imi.accepted_at IS NULL
        )
        AND unaccent(LOWER(t.name)) LIKE unaccent(LOWER('%' || ${input.q} || '%'))
      ORDER BY t.name ASC
      LIMIT ${limit}
    `;
  },
} as const;
```

- [ ] **Step 2: Re-export from `src/modules/teams/index.ts`**

Add at the end of the existing file:

```ts
export { TeamSearchService } from './application/team-search-service';
export type { TeamCandidate, SearchInvitableForMatchInput } from './application/team-search-service';
```

- [ ] **Step 3: Create `src/app/api/teams/search/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { TeamSearchService } from '@/modules/teams';
import { logger } from '@/shared/logger';

const querySchema = z.object({
  q: z.string().trim().min(1).max(60),
  matchId: z.string().cuid(),
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
    matchId: url.searchParams.get('matchId'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 400 },
    );
  }

  const match = await prisma.independentMatch.findUnique({
    where: { id: parsed.data.matchId },
    select: { organizerId: true },
  });
  if (!match || match.organizerId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await checkRateLimit(buildRateLimitKey('teams.search', 'user', user.id), { limit: 60 });
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const rows = await TeamSearchService.searchInvitableForMatch({
      q: parsed.data.q,
      matchId: parsed.data.matchId,
      callerId: user.id,
    });
    return NextResponse.json(rows);
  } catch (err) {
    logger().error({ err, userId: user.id, q: parsed.data.q }, 'teams.search.failed');
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: only the leftover frontend errors from Task 3-4 remain.

- [ ] **Step 5: Commit tasks 4-7 together**

```bash
git add \
  src/modules/independent-matches/domain/types.ts \
  src/modules/independent-matches/application/independent-match-service.ts \
  src/modules/teams/application/team-search-service.ts \
  src/modules/teams/index.ts \
  src/app/api/teams/search/route.ts \
  tests/unit/modules/independent-matches/invite-team.test.ts
git commit -m "feat(jugar): host-team support, inviteTeam, team-aware acceptInvitation, team search"
```

---

## Task 8 — Frontend: drop `ChallengePanel` + `respondToChallenge`

**Files:**
- Delete: `src/app/(app)/jugar/[id]/_components/challenge-panel.tsx`
- Modify: `src/app/(app)/jugar/[id]/page.tsx`
- Modify: `src/app/(app)/jugar/[id]/actions.ts`

- [ ] **Step 1: Delete the component file**

```bash
git rm "src/app/(app)/jugar/[id]/_components/challenge-panel.tsx"
```

- [ ] **Step 2: Update `page.tsx`**

a) Remove the import:
```ts
import { ChallengePanel } from './_components/challenge-panel';
```

b) Remove the `isChallengeMember` block:
```ts
const isChallengeMember =
  match.type === 'TEAM_CHALLENGE' &&
  match.status === 'PENDING_APPROVAL' &&
  match.challengedTeam != null;
```

c) Remove the JSX usage:
```tsx
{isChallengeMember && !isOrganizer && (
  <ChallengePanel matchId={id} challengerTeamName={match.organizer.name} />
)}
```

d) Remove the textual ramifications of `match.type`:
```tsx
<p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">
  {match.type === 'TEAM_CHALLENGE' ? 'Reto de equipos' : 'Partido abierto'}
</p>
```

Replace with:
```tsx
<p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">
  Partido abierto
</p>
```

e) The condition that guards "Unirme a este partido" should drop the `match.type === 'OPEN'` term:

```tsx
{match.status === 'OPEN' && match.visibility === 'PUBLIC' && !isOrganizer && !isParticipant && availableSlots > 0 && (
  <JoinPublicMatchButton matchId={id} />
)}
```

f) The condition guarding the invite section should drop `'PENDING_APPROVAL'`:

```tsx
{match.status === 'OPEN' && availableSlots > 0 && (
  <div>
    <h3 className="text-sm font-semibold text-gray-700 mb-2">Invitar</h3>
    <InviteForm matchId={id} availableSlots={availableSlots} />
    {match.invitations.length > 0 && (
      ...
    )}
  </div>
)}
```

(Note the heading changes from "Invitar por email" to "Invitar"; we add `availableSlots` prop in Task 9.)

g) The pending-invitations list should also display team invitations. Update the loop:

```tsx
{match.invitations.map((inv) => {
  const label = inv.email ?? inv.invitedUser?.name ?? inv.invitedTeam?.name ?? '—';
  return (
    <li key={inv.id} className="text-xs text-gray-600 flex items-center gap-2 flex-wrap">
      <span>
        {inv.invitedTeam ? '🏆 ' : inv.invitedUser ? '👤 ' : '✉️ '}
        {label}
      </span>
      {inv.acceptedAt ? (
        <span className="text-green-600">✓ Aceptada</span>
      ) : (
        <>
          <span className="text-gray-400">Pendiente</span>
          <CancelInvitationButton matchId={id} invitationId={inv.id} />
        </>
      )}
    </li>
  );
})}
```

- [ ] **Step 3: Update `actions.ts`**

Delete the entire `respondToChallenge` export and its zod schema. Keep everything else.

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: errors in `nuevo/actions.ts` (`createOpen` now accepts hostTeamId) and `invite-form.tsx` (uses MatchUserPicker still). Those are tasks 9-10.

- [ ] **Step 5: No commit yet** — bundle with task 9.

---

## Task 9 — Frontend: rename `MatchUserPicker` → `MatchEntityPicker`, mix users + teams; rewire invite form + action

**Files:**
- Rename: `src/app/(app)/jugar/[id]/_components/match-user-picker.tsx` → `match-entity-picker.tsx`
- Modify: `src/app/(app)/jugar/[id]/_components/invite-form.tsx`
- Modify: `src/app/(app)/jugar/[id]/actions.ts`

- [ ] **Step 1: Rename the file via git**

```bash
git mv "src/app/(app)/jugar/[id]/_components/match-user-picker.tsx" "src/app/(app)/jugar/[id]/_components/match-entity-picker.tsx"
```

- [ ] **Step 2: Replace `match-entity-picker.tsx` content**

Overwrite with:

```tsx
'use client';

import { useEffect, useId, useRef, useState } from 'react';

type UserCandidate = { kind: 'user'; id: string; name: string; avatarUrl: string | null };
type TeamCandidate = { kind: 'team'; id: string; name: string; logoUrl: string | null; memberCount: number };
type Candidate = UserCandidate | TeamCandidate;

interface Props {
  matchId: string;
  /** Free slots in the match. When < 2, team results are hidden. */
  availableSlots: number;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

export function MatchEntityPicker({ matchId, availableSlots }: Props) {
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

      const userUrl = new URL('/api/users/search', window.location.origin);
      userUrl.searchParams.set('q', query.trim());
      userUrl.searchParams.set('matchId', matchId);
      const userPromise = fetch(userUrl.toString()).then(async (res) => {
        if (!res.ok) throw new Error(`users ${res.status}`);
        return (await res.json()) as Omit<UserCandidate, 'kind'>[];
      });

      const teamPromise = availableSlots >= 2
        ? (() => {
            const teamUrl = new URL('/api/teams/search', window.location.origin);
            teamUrl.searchParams.set('q', query.trim());
            teamUrl.searchParams.set('matchId', matchId);
            return fetch(teamUrl.toString()).then(async (res) => {
              if (!res.ok) throw new Error(`teams ${res.status}`);
              return (await res.json()) as Omit<TeamCandidate, 'kind'>[];
            });
          })()
        : Promise.resolve([] as Omit<TeamCandidate, 'kind'>[]);

      Promise.all([userPromise, teamPromise])
        .then(([users, teams]) => {
          const merged: Candidate[] = [
            ...teams.map((t) => ({ ...t, kind: 'team' as const })),
            ...users.map((u) => ({ ...u, kind: 'user' as const })),
          ];
          setResults(merged);
          setHighlighted(0);
          setOpen(true);
          setLiveMessage(
            merged.length === 0
              ? 'Sin resultados.'
              : `${merged.length} resultado${merged.length === 1 ? '' : 's'}.`,
          );
        })
        .catch(() => {
          setResults([]);
          setError('No se pudo cargar la búsqueda.');
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query, matchId, availableSlots, selected]);

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

  const selectedUserId = selected?.kind === 'user' ? selected.id : '';
  const selectedTeamId = selected?.kind === 'team' ? selected.id : '';

  return (
    <div ref={containerRef} className="relative w-full">
      <input type="hidden" name="invitedUserId" value={selectedUserId} />
      <input type="hidden" name="invitedTeamId" value={selectedTeamId} />

      {selected ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm">
          <Avatar candidate={selected} />
          <span className="flex-1 font-medium text-slate-700">
            {selected.name}
            {selected.kind === 'team' && (
              <span className="ml-2 text-xs text-slate-400">{selected.memberCount} jugadores</span>
            )}
          </span>
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
          placeholder="Buscar jugador o equipo por nombre…"
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
            <li className="px-3 py-2 text-sm text-slate-400">Sin resultados.</li>
          )}
          {!loading &&
            results.map((c, idx) => (
              <li
                key={`${c.kind}-${c.id}`}
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
                <Avatar candidate={c} />
                <span className="flex-1 text-slate-700">
                  {c.name}
                  {c.kind === 'team' && (
                    <span className="ml-2 text-xs text-slate-400">{c.memberCount} jugadores</span>
                  )}
                </span>
                <span className="text-xs text-slate-400 shrink-0">
                  {c.kind === 'team' ? 'Equipo' : 'Jugador'}
                </span>
              </li>
            ))}
        </ul>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Avatar({ candidate }: { candidate: Candidate }) {
  const url = candidate.kind === 'user' ? candidate.avatarUrl : candidate.logoUrl;
  if (url) {
    return (
      <span
        className="w-6 h-6 rounded-full bg-slate-100 overflow-hidden inline-block shrink-0"
        style={{ backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        aria-hidden
      />
    );
  }
  const initial = candidate.name.trim().charAt(0).toUpperCase();
  return (
    <span
      className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 ${
        candidate.kind === 'team'
          ? 'bg-gradient-to-br from-amber-500 to-amber-700'
          : 'bg-gradient-to-br from-brand-navy to-brand-navy-light'
      }`}
      aria-hidden
    >
      {initial}
    </span>
  );
}
```

- [ ] **Step 3: Replace `actions.ts` invite logic with a unified action**

Open `src/app/(app)/jugar/[id]/actions.ts` and:

a) Replace `inviteUserToMatchAction` and its schema with the unified version:

```ts
const inviteEntitySchema = z
  .object({
    matchId: z.string().cuid(),
    invitedUserId: z.string().cuid().optional().or(z.literal('').transform(() => undefined)),
    invitedTeamId: z.string().cuid().optional().or(z.literal('').transform(() => undefined)),
  })
  .refine((v) => Boolean(v.invitedUserId) !== Boolean(v.invitedTeamId), {
    message: 'Selecciona un jugador o un equipo del listado.',
  });

export async function inviteEntityToMatchAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = inviteEntitySchema.safeParse({
    matchId: formData.get('matchId'),
    invitedUserId: formData.get('invitedUserId'),
    invitedTeamId: formData.get('invitedTeamId'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    if (parsed.data.invitedUserId) {
      const { invitationId, isNew } = await IndependentMatchService.inviteUser(
        parsed.data.matchId,
        user.id,
        parsed.data.invitedUserId,
      );
      if (isNew) {
        await issueInvitationToken(parsed.data.matchId, invitationId);
        await sendUserInviteEmail(parsed.data.matchId, parsed.data.invitedUserId, invitationId);
        await NotificationService.create({
          userId: parsed.data.invitedUserId,
          type: 'INDEPENDENT_MATCH_INVITE',
          title: 'Invitación a partido',
          body: `Te invitan a un partido.`,
          metadata: { matchId: parsed.data.matchId },
        });
      }
    } else if (parsed.data.invitedTeamId) {
      const { invitationId, isNew } = await IndependentMatchService.inviteTeam(
        parsed.data.matchId,
        user.id,
        parsed.data.invitedTeamId,
      );
      if (isNew) {
        await issueInvitationToken(parsed.data.matchId, invitationId);
        await sendTeamInviteNotifications(parsed.data.matchId, parsed.data.invitedTeamId, invitationId);
      }
    }

    revalidatePath(`/jugar/${parsed.data.matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

// Helpers (place at the bottom of the file, BEFORE the existing exports if any).

async function issueInvitationToken(matchId: string, invitationId: string): Promise<string> {
  return SignedTokenService.issue({
    purpose: SignedTokenPurpose.INDEPENDENT_MATCH_INVITE,
    subjectId: invitationId,
    ttlSeconds: 7 * 24 * 60 * 60,
  });
}

async function sendUserInviteEmail(matchId: string, invitedUserId: string, invitationId: string): Promise<void> {
  const token = await issueInvitationToken(matchId, invitationId);
  const matchUrl = `${env().APP_URL}/jugar/${matchId}?token=${token}`;
  const match = await prisma.independentMatch.findUnique({
    where: { id: matchId },
    include: { organizer: { select: { name: true } } },
  });
  const invitee = await prisma.user.findUnique({
    where: { id: invitedUserId },
    select: { email: true },
  });
  if (!invitee?.email) return;

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

async function sendTeamInviteNotifications(matchId: string, invitedTeamId: string, invitationId: string): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: invitedTeamId },
    include: { members: { include: { user: { select: { id: true, email: true } } } } },
  });
  if (!team) return;

  const token = await issueInvitationToken(matchId, invitationId);
  const matchUrl = `${env().APP_URL}/jugar/${matchId}?token=${token}`;
  const match = await prisma.independentMatch.findUnique({
    where: { id: matchId },
    include: { organizer: { select: { name: true } } },
  });

  // In-app notification per team member.
  await NotificationService.createMany(
    team.members.map((m) => ({
      userId: m.userId,
      type: 'INDEPENDENT_MATCH_INVITE' as const,
      title: 'Invitación a partido',
      body: `${match?.organizer.name ?? 'Alguien'} ha invitado a tu equipo "${team.name}" a "${match?.name ?? 'un partido'}".`,
      metadata: { matchId },
    })),
  );

  // Email per team member with an email.
  const q = queue();
  await q.start();
  await Promise.all(
    team.members
      .filter((m) => Boolean(m.user.email))
      .map((m) =>
        q.publish('send-email', {
          template: 'ind-match-invite',
          to: m.user.email,
          data: {
            organizerName: match?.organizer.name ?? 'Organizador',
            matchName: match?.name ?? 'Partido',
            matchUrl,
            scheduledAt: match?.scheduledAt?.toLocaleDateString('es-ES') ?? undefined,
            location: match?.location ?? undefined,
          },
          dedupKey: `ind-invite-${invitationId}-${m.userId}`,
        }),
      ),
  );
}
```

b) Delete the old `inviteUserToMatchAction` and its `inviteUserSchema`. Keep `inviteByEmail`, `cancelMatchInvitation`, `joinPublicMatchAction`, `cancelMatch`.

- [ ] **Step 4: Update `invite-form.tsx`**

Replace its entire contents with:

```tsx
'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { inviteByEmail, inviteEntityToMatchAction } from '../actions';
import { MatchEntityPicker } from './match-entity-picker';

type ActionResult = { error: string } | { success: true } | null;

interface Props {
  matchId: string;
  availableSlots: number;
}

export function InviteForm({ matchId, availableSlots }: Props) {
  const [showEmailFallback, setShowEmailFallback] = useState(false);

  const [entityState, entityAction, entityPending] = useActionState<ActionResult, FormData>(
    inviteEntityToMatchAction,
    null,
  );
  const entityFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (entityState && 'success' in entityState) entityFormRef.current?.reset();
  }, [entityState]);

  const [emailState, emailAction, emailPending] = useActionState<ActionResult, FormData>(
    inviteByEmail,
    null,
  );

  return (
    <div className="space-y-3">
      <form ref={entityFormRef} action={entityAction} className="flex flex-col gap-2">
        <input type="hidden" name="matchId" value={matchId} />
        <MatchEntityPicker matchId={matchId} availableSlots={availableSlots} />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={entityPending}
            className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {entityPending ? 'Enviando…' : 'Invitar'}
          </button>
          {entityState && 'error' in entityState && <p className="text-xs text-red-600">{entityState.error}</p>}
          {entityState && 'success' in entityState && <p className="text-xs text-emerald-700">Invitación enviada.</p>}
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

- [ ] **Step 5: Run typecheck and unit tests**

```bash
pnpm typecheck
pnpm test:unit
```
Expected: typecheck has remaining errors only in `src/app/(app)/jugar/nuevo/...` (Task 10). Unit tests pass.

- [ ] **Step 6: Commit tasks 8-9 together**

```bash
git add \
  "src/app/(app)/jugar/[id]/page.tsx" \
  "src/app/(app)/jugar/[id]/actions.ts" \
  "src/app/(app)/jugar/[id]/_components/match-entity-picker.tsx" \
  "src/app/(app)/jugar/[id]/_components/invite-form.tsx"
git rm "src/app/(app)/jugar/[id]/_components/challenge-panel.tsx" \
       "src/app/(app)/jugar/[id]/_components/match-user-picker.tsx"
git commit -m "feat(jugar): mixed user/team typeahead + drop ChallengePanel"
```

(`match-user-picker.tsx` is removed via the `git mv` from Step 1 of this task.)

---

## Task 10 — Frontend: `/jugar/nuevo` host-kind selector

**Files:**
- Modify: `src/app/(app)/jugar/nuevo/page.tsx`
- Modify: `src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx`
- Modify: `src/app/(app)/jugar/nuevo/actions.ts`

- [ ] **Step 1: Server component fetches the user's teams**

Update `src/app/(app)/jugar/nuevo/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { NuevoPartidoForm } from './_components/nuevo-partido-form';

export const metadata = { title: 'Crear partido — Padel League' };

export default async function NuevoPartidoPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token).catch(() => redirect('/login' as Route));

  const teams = await prisma.team.findMany({
    where: { members: { some: { userId: user.id } } },
    select: { id: true, name: true, _count: { select: { members: true } } },
    orderBy: { name: 'asc' },
  });

  const myTeams = teams
    .filter((t) => t._count.members === 2)
    .map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="max-w-lg">
      <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Crear partido</p>
      <h1 className="text-2xl font-extrabold text-brand-navy mb-6">Nuevo partido</h1>
      <NuevoPartidoForm myTeams={myTeams} />
    </div>
  );
}
```

(Only fully-formed teams of 2 members can host — if your team is alone, the host-team option doesn't make sense.)

- [ ] **Step 2: Update the action**

In `src/app/(app)/jugar/nuevo/actions.ts`, replace `createOpenSchema` and the action body:

```ts
const createOpenSchema = z
  .object({
    name: z.string().min(1, 'El nombre es obligatorio.').max(100),
    visibility: z.enum(['PUBLIC', 'PRIVATE']),
    hostKind: z.enum(['USER', 'TEAM']),
    hostTeamId: z.string().cuid().optional().or(z.literal('').transform(() => undefined)),
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
  })
  .refine((v) => v.hostKind === 'USER' || (v.hostKind === 'TEAM' && Boolean(v.hostTeamId)), {
    message: 'Selecciona el equipo organizador.',
    path: ['hostTeamId'],
  });

export async function createOpenMatch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = createOpenSchema.safeParse({
    name: formData.get('name'),
    visibility: formData.get('visibility'),
    hostKind: formData.get('hostKind'),
    hostTeamId: formData.get('hostTeamId'),
    scheduledAt: formData.get('scheduledAt') || undefined,
    location: formData.get('location') || undefined,
    description: formData.get('description') || undefined,
    maxPlayers: formData.get('maxPlayers'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { hostKind, hostTeamId, ...rest } = parsed.data;
  const effectiveMaxPlayers = hostKind === 'TEAM' ? (4 as const) : rest.maxPlayers;

  try {
    const match = await IndependentMatchService.createOpen({
      ...rest,
      organizerId: user.id,
      maxPlayers: effectiveMaxPlayers,
      hostTeamId: hostKind === 'TEAM' ? hostTeamId : undefined,
    });
    revalidatePath('/jugar');
    return { success: true, matchId: match.id };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
```

(Delete the entire `createChallenge` action and `createChallengeSchema` from this file — no longer needed. Also remove unused imports.)

- [ ] **Step 3: Update the form**

Edit `src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx`. Replace its props and add the host-kind picker. Only the OPEN tab is rendered (no challenge tab anymore — Task 12 of Stage 1 already hid it).

```tsx
'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { createOpenMatch } from '../actions';

type ActionResult = { error?: string; success?: true; matchId?: string };

interface Props {
  myTeams: { id: string; name: string }[];
}

export function NuevoPartidoForm({ myTeams }: Props) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => {
      const res = await createOpenMatch(_prev, formData);
      if (res && 'success' in res && res.success && res.matchId) {
        router.push(`/jugar/${res.matchId}` as Route);
      }
      return res;
    },
    null,
  );

  const [hostKind, setHostKind] = useState<'USER' | 'TEAM'>('USER');
  const canHostAsTeam = myTeams.length > 0;

  return (
    <form action={action} className="space-y-4">
      <fieldset className="border border-slate-200 rounded-xl p-3">
        <legend className="px-1 text-xs font-bold text-slate-500 uppercase tracking-widest">Cómo juego</legend>
        <div className="flex gap-2 mt-1">
          <label className="flex-1 cursor-pointer">
            <input
              type="radio"
              name="hostKind"
              value="USER"
              checked={hostKind === 'USER'}
              onChange={() => setHostKind('USER')}
              className="peer sr-only"
            />
            <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
              👤 Como usuario
            </span>
          </label>
          <label className={`flex-1 ${canHostAsTeam ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`} title={canHostAsTeam ? '' : 'Necesitas un equipo de 2 jugadores'}>
            <input
              type="radio"
              name="hostKind"
              value="TEAM"
              checked={hostKind === 'TEAM'}
              onChange={() => setHostKind('TEAM')}
              disabled={!canHostAsTeam}
              className="peer sr-only"
            />
            <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
              🏆 Como equipo
            </span>
          </label>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Como usuario: tú ocupas 1 hueco. Como equipo: tu equipo ocupa 2 huecos (partido de 4).
        </p>
      </fieldset>

      {hostKind === 'TEAM' && (
        <div>
          <label htmlFor="hostTeamId" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
            Equipo organizador
          </label>
          <select
            id="hostTeamId"
            name="hostTeamId"
            required
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          >
            <option value="">Selecciona…</option>
            {myTeams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          placeholder="Sábado por la tarde"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>

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
      </fieldset>

      {hostKind === 'USER' && (
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
            Jugadores
          </label>
          <div className="flex gap-2">
            <label className="flex-1 cursor-pointer">
              <input type="radio" name="maxPlayers" value="2" defaultChecked className="peer sr-only" />
              <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
                2 (1v1)
              </span>
            </label>
            <label className="flex-1 cursor-pointer">
              <input type="radio" name="maxPlayers" value="4" className="peer sr-only" />
              <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
                4 (2v2)
              </span>
            </label>
          </div>
        </div>
      )}
      {hostKind === 'TEAM' && <input type="hidden" name="maxPlayers" value="4" />}

      <div>
        <label htmlFor="scheduledAt" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
          Fecha (opcional)
        </label>
        <input
          id="scheduledAt"
          name="scheduledAt"
          type="datetime-local"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>

      <div>
        <label htmlFor="location" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
          Lugar (opcional)
        </label>
        <input
          id="location"
          name="location"
          type="text"
          maxLength={200}
          placeholder="Club de Pádel Centro"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
          Descripción (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          maxLength={500}
          rows={3}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? 'Creando…' : 'Crear partido'}
      </button>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
```

(If your existing `nuevo-partido-form.tsx` already has bespoke styling for these inputs, preserve the styling and only add the new host-kind fieldset and the team-select.)

- [ ] **Step 4: Run typecheck, unit tests, build**

```bash
pnpm typecheck
pnpm test:unit
pnpm next build
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add \
  "src/app/(app)/jugar/nuevo/page.tsx" \
  "src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx" \
  "src/app/(app)/jugar/nuevo/actions.ts"
git commit -m "feat(jugar): create-as-team support with host-kind selector"
```

---

## Task 11 — Integration tests

**Files:**
- Create: `tests/integration/match-team-invite.test.ts`
- Create: `tests/integration/match-team-search.test.ts`

- [ ] **Step 1: Create `match-team-invite.test.ts`**

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

async function team(name: string, members: { id: string }[], creatorId: string) {
  return prisma.team.create({
    data: {
      name,
      category: 'INTERMEDIATE',
      createdByUserId: creatorId,
      members: { create: members.map((m) => ({ userId: m.id })) },
    },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('inviteTeam + acceptInvitation team branch', () => {
  it('seeds 2 host members on createOpen with hostTeamId', async () => {
    const captain = await user('Captain', `cap-${Date.now()}`);
    const partner = await user('Partner', `par-${Date.now()}`);
    const t = await team('Halcones', [{ id: captain.id }, { id: partner.id }], captain.id);

    const m = await IndependentMatchService.createOpen({
      organizerId: captain.id,
      name: 'Sábado',
      visibility: 'PUBLIC',
      hostTeamId: t.id,
      maxPlayers: 4,
    });

    const ps = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: m.id, status: 'ACCEPTED' },
    });
    expect(ps.map((p) => p.userId).sort()).toEqual([captain.id, partner.id].sort());
    expect(m.hostTeamId).toBe(t.id);
  });

  it('inviteTeam blocks when fewer than 2 slots remain', async () => {
    const cap = await user('Cap', `cap-${Date.now()}`);
    const inv1 = await user('I1', `i1-${Date.now()}`);
    const inv2 = await user('I2', `i2-${Date.now()}`);
    const otherCap = await user('OC', `oc-${Date.now()}`);
    const otherPartner = await user('OP', `op-${Date.now()}`);
    const otherTeam = await team('Otro', [{ id: otherCap.id }, { id: otherPartner.id }], otherCap.id);

    const m = await IndependentMatchService.createOpen({
      organizerId: cap.id,
      name: 'Match',
      visibility: 'PRIVATE',
      maxPlayers: 4,
    });
    // Fill match to 3/4
    await prisma.independentMatchParticipant.createMany({
      data: [
        { independentMatchId: m.id, userId: inv1.id, status: 'ACCEPTED' },
        { independentMatchId: m.id, userId: inv2.id, status: 'ACCEPTED' },
      ],
    });

    await expect(
      IndependentMatchService.inviteTeam(m.id, cap.id, otherTeam.id),
    ).rejects.toThrow(/dos huecos/i);
  });

  it('team accept fills 2 slots and confirms', async () => {
    const cap = await user('Cap', `cap-${Date.now()}`);
    const inv = await user('Inv', `inv-${Date.now()}`);
    const otherCap = await user('OC', `oc-${Date.now()}`);
    const otherPartner = await user('OP', `op-${Date.now()}`);
    const otherTeam = await team('Otro', [{ id: otherCap.id }, { id: otherPartner.id }], otherCap.id);

    const m = await IndependentMatchService.createOpen({
      organizerId: cap.id,
      name: 'M',
      visibility: 'PRIVATE',
      maxPlayers: 4,
    });
    await prisma.independentMatchParticipant.create({
      data: { independentMatchId: m.id, userId: inv.id, status: 'ACCEPTED' },
    });

    await IndependentMatchService.inviteTeam(m.id, cap.id, otherTeam.id);

    // Find the invitation and accept via SignedTokenService directly.
    const invitation = await prisma.independentMatchInvitation.findFirstOrThrow({
      where: { matchId: m.id, invitedTeamId: otherTeam.id },
    });
    const { SignedTokenService, SignedTokenPurpose } = await import('@/shared/auth/signed-tokens');
    const token = await SignedTokenService.issue({
      purpose: SignedTokenPurpose.INDEPENDENT_MATCH_INVITE,
      subjectId: invitation.id,
      ttlSeconds: 60,
    });

    await IndependentMatchService.acceptInvitation(token, otherCap.id);

    const ps = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: m.id, status: 'ACCEPTED' },
    });
    expect(ps).toHaveLength(4);
    expect(ps.map((p) => p.userId).sort()).toEqual([cap.id, inv.id, otherCap.id, otherPartner.id].sort());

    const updated = await prisma.independentMatch.findUniqueOrThrow({ where: { id: m.id } });
    expect(updated.status).toBe('CONFIRMED');
  });
});
```

- [ ] **Step 2: Create `match-team-search.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { TeamSearchService } from '@/modules/teams';
import { IndependentMatchService } from '@/modules/independent-matches';

const prisma = testPrisma();

async function user(name: string, suffix: string) {
  return prisma.user.create({
    data: { name, email: `${suffix}@t.com`, passwordHash: 'h', emailVerifiedAt: new Date() },
  });
}

async function team(name: string, members: { id: string }[], creatorId: string) {
  return prisma.team.create({
    data: {
      name,
      category: 'INTERMEDIATE',
      createdByUserId: creatorId,
      members: { create: members.map((m) => ({ userId: m.id })) },
    },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('TeamSearchService.searchInvitableForMatch', () => {
  it('excludes host team and pending invited teams', async () => {
    const cap = await user('Cap', `cap-${Date.now()}`);
    const par = await user('Par', `par-${Date.now()}`);
    const host = await team('Halcones', [{ id: cap.id }, { id: par.id }], cap.id);

    const c1 = await user('C1', `c1-${Date.now()}`);
    const c2 = await user('C2', `c2-${Date.now()}`);
    const candidate = await team('Tigres', [{ id: c1.id }, { id: c2.id }], c1.id);

    const p1 = await user('P1', `p1-${Date.now()}`);
    const p2 = await user('P2', `p2-${Date.now()}`);
    const pending = await team('Lobos', [{ id: p1.id }, { id: p2.id }], p1.id);

    const m = await IndependentMatchService.createOpen({
      organizerId: cap.id,
      name: 'M',
      visibility: 'PRIVATE',
      hostTeamId: host.id,
      maxPlayers: 4,
    });
    await IndependentMatchService.inviteTeam(m.id, cap.id, pending.id);

    const rows = await TeamSearchService.searchInvitableForMatch({
      q: 't',
      matchId: m.id,
      callerId: cap.id,
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(candidate.id);
    expect(ids).not.toContain(host.id);
    expect(ids).not.toContain(pending.id);
  });

  it('returns memberCount and accent-insensitive matching', async () => {
    const cap = await user('Cap', `cap-${Date.now()}`);
    const m1 = await user('M1', `m1-${Date.now()}`);
    const m2 = await user('M2', `m2-${Date.now()}`);
    const t = await team('Águilas Solitarias', [{ id: m1.id }, { id: m2.id }], m1.id);

    const match = await IndependentMatchService.createOpen({
      organizerId: cap.id,
      name: 'M',
      visibility: 'PRIVATE',
      maxPlayers: 4,
    });

    const rows = await TeamSearchService.searchInvitableForMatch({
      q: 'aguilas',
      matchId: match.id,
      callerId: cap.id,
    });
    expect(rows.map((r) => r.id)).toContain(t.id);
    const found = rows.find((r) => r.id === t.id);
    expect(found?.memberCount).toBe(2);
  });
});
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```
Expected: green. (Tests don't run locally without docker — they execute in CI.)

- [ ] **Step 4: Commit**

```bash
git add tests/integration/match-team-invite.test.ts tests/integration/match-team-search.test.ts
git commit -m "test(jugar): integration tests for team invite + team search"
```

---

## Task 12 — Final validation + push

- [ ] **Step 1: Full validation**

```bash
pnpm typecheck && pnpm test:unit && pnpm next build
```
Expected: all green.

- [ ] **Step 2: Push**

```bash
git push origin main
```

Vercel applies the three Stage 2 migrations on `prisma migrate deploy`. Verify in Vercel deploy logs that all migrations completed and that any pre-existing TEAM_CHALLENGE rows were converted (the data migration logs nothing explicit; check the count of `independent_matches WHERE host_team_id IS NOT NULL` is at least the previous count of `type='TEAM_CHALLENGE'`).

- [ ] **Step 3: Manual smoke (after deploy)**

1. Create a public 4-player match "as team" — picks one of your teams. Confirm both team members appear as participants from the start.
2. Invite a different team via the typeahead — the dropdown shows 🏆 entries with member counts. Send the invitation.
3. From a member of the invited team's account, click the email/notification link. Both members of the invited team should now be participants. Match status = CONFIRMED.
4. Create a private 4-player "as user". Type a name in the typeahead; confirm both 👤 users and 🏆 teams appear if matching.
5. Drop the typeahead query: confirm that on a match with only 1 slot left, the team results disappear (only users show).
6. Confirm any previously existing `TEAM_CHALLENGE` matches show up under `/jugar/[id]` with the new layout — host team rendered, no challenge panel, invitation pending if status was `PENDING_APPROVAL`.

If anything misbehaves, the `error.tsx` boundary captures the digest; pair it with Vercel logs to find the cause.
