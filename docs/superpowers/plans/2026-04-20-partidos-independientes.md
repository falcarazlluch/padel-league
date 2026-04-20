# Partidos Independientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `/jugar` feature — open matches for loose players and team-vs-team challenges — with join requests, email invitations via token, and in-app notifications.

**Architecture:** A new `src/modules/independent-matches/` service handles all DB logic and in-app notifications. Server actions in `src/app/(app)/jugar/` call the service and enqueue emails via pg-boss. The existing `SignedTokenService` with purpose `INDEPENDENT_MATCH_INVITE` is used for invitation tokens; a new `IndependentMatchInvitation` table tracks pending email invites.

**Tech Stack:** Next.js 15 App Router (async Server Components, Server Actions, `useActionState`), Prisma 5, pg-boss queue, Resend via `EmailService`, `NotificationService`, `SignedTokenService`, Zod 4, Tailwind CSS v4.

---

## File Structure

**New files:**
- `src/modules/independent-matches/domain/types.ts` — TypeScript types for the module
- `src/modules/independent-matches/application/independent-match-service.ts` — all DB logic + notifications
- `src/modules/independent-matches/index.ts` — barrel export
- `src/worker/email-templates/ind-match-invite.tsx` — email: invitation to open match
- `src/worker/email-templates/ind-match-challenge.tsx` — email: team challenge received
- `src/worker/email-templates/ind-match-challenge-response.tsx` — email: challenge accepted/rejected
- `src/app/(app)/jugar/page.tsx` — hub: Tablón + Mis partidos tabs
- `src/app/(app)/jugar/nuevo/page.tsx` — create match page
- `src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx` — client form
- `src/app/(app)/jugar/nuevo/actions.ts` — `createOpenMatch`, `createChallenge` server actions
- `src/app/(app)/jugar/[id]/page.tsx` — match detail (token acceptance + view)
- `src/app/(app)/jugar/[id]/actions.ts` — `requestToJoin`, `approveJoin`, `rejectJoin`, `inviteByEmail`, `respondToChallenge`, `cancelMatch` server actions
- `src/app/(app)/jugar/[id]/_components/join-request-button.tsx` — client "Unirme" button
- `src/app/(app)/jugar/[id]/_components/join-requests-panel.tsx` — organizer approve/reject panel
- `src/app/(app)/jugar/[id]/_components/invite-form.tsx` — organizer email invite form
- `src/app/(app)/jugar/[id]/_components/challenge-panel.tsx` — accept/reject challenge panel
- `tests/unit/modules/independent-matches/slots.test.ts` — unit test for `calculateAvailableSlots`
- `tests/integration/independent-matches.test.ts` — integration tests for main flows

**Modified files:**
- `prisma/schema.prisma` — add `IndependentMatchType` enum, fields on `IndependentMatch`, new `IndependentMatchInvitation` model, relations on `Team` and `League`
- `src/worker/handlers/send-email.ts` — add 3 new template cases
- `src/app/(app)/layout.tsx` — add "Jugar" nav link

---

## Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `IndependentMatchType` enum to schema.prisma**

In `prisma/schema.prisma`, after the `JoinRequestStatus` enum (around line 92), add:

```prisma
enum IndependentMatchType {
  OPEN
  TEAM_CHALLENGE
}
```

- [ ] **Step 2: Update `IndependentMatch` model**

Replace the existing `IndependentMatch` model with:

```prisma
model IndependentMatch {
  id               String                 @id @default(cuid())
  organizerId      String                 @map("organizer_id")
  name             String
  type             IndependentMatchType   @default(OPEN)
  challengedTeamId String?                @map("challenged_team_id")
  leagueId         String?                @map("league_id")
  scheduledAt      DateTime?              @map("scheduled_at")
  location         String?
  description      String?
  maxPlayers       Int                    @default(4) @map("max_players")
  status           IndependentMatchStatus @default(OPEN)
  createdAt        DateTime               @default(now()) @map("created_at")
  updatedAt        DateTime               @updatedAt @map("updated_at")

  organizer      User                              @relation("IndependentOrganizer", fields: [organizerId], references: [id], onDelete: Restrict)
  challengedTeam Team?                             @relation("ChallengedTeam", fields: [challengedTeamId], references: [id], onDelete: Restrict)
  league         League?                           @relation("IndependentMatchLeague", fields: [leagueId], references: [id], onDelete: Restrict)
  participants   IndependentMatchParticipant[]
  joinRequests   IndependentMatchJoinRequest[]
  invitations    IndependentMatchInvitation[]

  @@index([status, scheduledAt])
  @@map("independent_matches")
}
```

- [ ] **Step 3: Add `IndependentMatchInvitation` model**

After `IndependentMatchJoinRequest`, add:

```prisma
model IndependentMatchInvitation {
  id         String    @id @default(cuid())
  matchId    String    @map("match_id")
  email      String    @db.Citext
  expiresAt  DateTime  @map("expires_at")
  acceptedAt DateTime? @map("accepted_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  match IndependentMatch @relation(fields: [matchId], references: [id], onDelete: Cascade)

  @@unique([matchId, email])
  @@index([matchId])
  @@map("independent_match_invitations")
}
```

- [ ] **Step 4: Add back-relations to `Team` and `League`**

In the `Team` model, after `wonMatches MatchResult[] @relation("MatchWinner")`, add:

```prisma
  challengedIndependentMatches IndependentMatch[] @relation("ChallengedTeam")
```

In the `League` model, after `matches Match[]`, add:

```prisma
  independentMatches IndependentMatch[] @relation("IndependentMatchLeague")
```

In the `User` model, after `indJoinRequests IndependentMatchJoinRequest[]`, add:

```prisma
  indInvitations     IndependentMatchInvitation[]
```

Wait — `IndependentMatchInvitation` has no `userId` FK. Remove that line from `User`. The invitation is by email only. No User relation needed on `IndependentMatchInvitation`.

- [ ] **Step 5: Run migration**

```bash
pnpm prisma migrate dev --name independent_matches_spec6
```

Expected: Migration created and applied. Prisma client regenerated.

- [ ] **Step 6: Verify Prisma client**

```bash
pnpm prisma generate
```

Expected: No errors. `IndependentMatchType`, `IndependentMatchInvitation` available in `@prisma/client`.

- [ ] **Step 7: Commit**

```bash
git add prisma/
git commit -m "feat(db): add IndependentMatch type/challenge fields + invitation table"
```

---

## Task 2: IndependentMatchService — types + create + read

**Files:**
- Create: `src/modules/independent-matches/domain/types.ts`
- Create: `src/modules/independent-matches/application/independent-match-service.ts`
- Create: `src/modules/independent-matches/index.ts`
- Create: `tests/unit/modules/independent-matches/slots.test.ts`

- [ ] **Step 1: Write failing unit test for `calculateAvailableSlots`**

Create `tests/unit/modules/independent-matches/slots.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateAvailableSlots } from '@/modules/independent-matches/application/independent-match-service';

describe('calculateAvailableSlots', () => {
  it('returns maxPlayers minus confirmed participant count', () => {
    expect(calculateAvailableSlots(4, 2)).toBe(2);
  });

  it('returns 0 when full', () => {
    expect(calculateAvailableSlots(4, 4)).toBe(0);
  });

  it('never returns negative', () => {
    expect(calculateAvailableSlots(4, 5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit -- tests/unit/modules/independent-matches/slots.test.ts
```

Expected: FAIL — "calculateAvailableSlots is not a function"

- [ ] **Step 3: Create domain types**

Create `src/modules/independent-matches/domain/types.ts`:

```typescript
import type { IndependentMatchStatus, IndependentMatchType, JoinRequestStatus, ParticipantStatus } from '@prisma/client';

export type IndependentMatchRow = {
  id: string;
  name: string;
  type: IndependentMatchType;
  organizerId: string;
  challengedTeamId: string | null;
  leagueId: string | null;
  scheduledAt: Date | null;
  location: string | null;
  description: string | null;
  maxPlayers: number;
  status: IndependentMatchStatus;
  createdAt: Date;
};

export type IndependentMatchDetail = IndependentMatchRow & {
  organizer: { id: string; name: string };
  challengedTeam: { id: string; name: string; leagueId: string } | null;
  league: { id: string; name: string; slug: string } | null;
  participants: { userId: string; user: { id: string; name: string }; status: ParticipantStatus }[];
  joinRequests: { id: string; userId: string; user: { id: string; name: string }; status: JoinRequestStatus; createdAt: Date }[];
  invitations: { id: string; email: string; acceptedAt: Date | null; createdAt: Date }[];
};

export type CreateOpenMatchInput = {
  organizerId: string;
  name: string;
  scheduledAt?: Date;
  location?: string;
  description?: string;
  maxPlayers: 2 | 4;
};

export type CreateChallengeInput = {
  organizerId: string;
  organizerTeamId: string;
  challengedTeamId: string;
  leagueId: string;
  name: string;
  scheduledAt?: Date;
  location?: string;
  description?: string;
};

export type TeamForChallenge = {
  id: string;
  leagueId: string;
  name: string;
  members: { userId: string; user: { id: string; name: string; email: string } }[];
};
```

- [ ] **Step 4: Create IndependentMatchService with create/read + `calculateAvailableSlots`**

Create `src/modules/independent-matches/application/independent-match-service.ts`:

```typescript
import { prisma } from '@/shared/db/client';
import {
  NotFoundError,
  AuthorizationError,
  DomainError,
  ConflictError,
} from '@/shared/errors';
import { NotificationService } from '@/modules/notifications';
import type {
  CreateOpenMatchInput,
  CreateChallengeInput,
  IndependentMatchDetail,
  IndependentMatchRow,
  TeamForChallenge,
} from '../domain/types';

const MATCH_DETAIL_INCLUDE = {
  organizer: { select: { id: true, name: true } },
  challengedTeam: { select: { id: true, name: true, leagueId: true } },
  league: { select: { id: true, name: true, slug: true } },
  participants: {
    where: { status: 'ACCEPTED' as const },
    include: { user: { select: { id: true, name: true } } },
  },
  joinRequests: {
    where: { status: 'PENDING' as const },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  invitations: {
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

export function calculateAvailableSlots(maxPlayers: number, confirmedCount: number): number {
  return Math.max(0, maxPlayers - confirmedCount);
}

export const IndependentMatchService = {
  async createOpen(input: CreateOpenMatchInput): Promise<IndependentMatchRow> {
    const match = await prisma.$transaction(async (tx) => {
      const m = await tx.independentMatch.create({
        data: {
          organizerId: input.organizerId,
          name: input.name,
          type: 'OPEN',
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

  async createChallenge(input: CreateChallengeInput): Promise<IndependentMatchRow> {
    // Validate both teams belong to the same league
    const [organizerTeam, challengedTeam] = await Promise.all([
      prisma.team.findUnique({
        where: { id: input.organizerTeamId },
        include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
      }),
      prisma.team.findUnique({
        where: { id: input.challengedTeamId },
        include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
      }),
    ]);

    if (!organizerTeam) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo organizador no encontrado.');
    if (!challengedTeam) throw new NotFoundError('TEAM_NOT_FOUND', 'Equipo retado no encontrado.');
    if (organizerTeam.leagueId !== challengedTeam.leagueId)
      throw new DomainError('TEAMS_DIFF_LEAGUE', 'Los equipos deben pertenecer a la misma liga.');
    if (input.organizerTeamId === input.challengedTeamId)
      throw new DomainError('SAME_TEAM', 'No puedes retar a tu propio equipo.');
    if (!organizerTeam.members.some((m) => m.userId === input.organizerId))
      throw new AuthorizationError('NOT_TEAM_MEMBER', 'No eres miembro del equipo organizador.');

    const match = await prisma.independentMatch.create({
      data: {
        organizerId: input.organizerId,
        name: input.name,
        type: 'TEAM_CHALLENGE',
        challengedTeamId: input.challengedTeamId,
        leagueId: input.leagueId,
        scheduledAt: input.scheduledAt ?? null,
        location: input.location ?? null,
        description: input.description ?? null,
        maxPlayers: 4,
        status: 'PENDING_APPROVAL',
      },
    });

    // Notify challenged team members (fire-and-forget)
    NotificationService.createMany(
      challengedTeam.members.map((m) => ({
        userId: m.userId,
        type: 'INDEPENDENT_MATCH_INVITE' as const,
        title: 'Reto de pádel recibido',
        body: `${organizerTeam.name} os reta a un partido amistoso.`,
        metadata: { matchId: match.id },
      })),
    ).catch(() => undefined);

    return match;
  },

  async listOpen(): Promise<(IndependentMatchRow & { confirmedCount: number })[]> {
    const matches = await prisma.independentMatch.findMany({
      where: { type: 'OPEN', status: 'OPEN' },
      include: { _count: { select: { participants: { where: { status: 'ACCEPTED' } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return matches.map((m) => ({
      ...m,
      confirmedCount: m._count.participants,
    }));
  },

  async getForUser(userId: string): Promise<IndependentMatchRow[]> {
    return prisma.independentMatch.findMany({
      where: {
        status: { notIn: ['CANCELLED', 'REJECTED'] },
        OR: [
          { organizerId: userId },
          { participants: { some: { userId, status: 'ACCEPTED' } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getById(id: string): Promise<IndependentMatchDetail> {
    const match = await prisma.independentMatch.findUnique({
      where: { id },
      include: MATCH_DETAIL_INCLUDE,
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    return match as IndependentMatchDetail;
  },

  async getTeamsForUser(userId: string): Promise<TeamForChallenge[]> {
    const teams = await prisma.team.findMany({
      where: {
        members: { some: { userId } },
        league: { status: 'ACTIVE' },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    return teams;
  },
} as const;
```

- [ ] **Step 5: Create barrel export**

Create `src/modules/independent-matches/index.ts`:

```typescript
export { IndependentMatchService, calculateAvailableSlots } from './application/independent-match-service';
export type {
  IndependentMatchRow,
  IndependentMatchDetail,
  CreateOpenMatchInput,
  CreateChallengeInput,
  TeamForChallenge,
} from './domain/types';
```

- [ ] **Step 6: Run unit tests**

```bash
pnpm test:unit -- tests/unit/modules/independent-matches/slots.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 7: Commit**

```bash
git add src/modules/independent-matches/ tests/unit/modules/independent-matches/
git commit -m "feat(independent-matches): module setup with create/read service methods"
```

---

## Task 3: Join request flow

**Files:**
- Modify: `src/modules/independent-matches/application/independent-match-service.ts`

- [ ] **Step 1: Add `requestToJoin`, `approveJoinRequest`, `rejectJoinRequest` methods**

Append to the `IndependentMatchService` object (before `} as const`):

```typescript
  async requestToJoin(matchId: string, userId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: {
        participants: { where: { status: 'ACCEPTED' } },
        joinRequests: { where: { userId, status: 'PENDING' } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.type !== 'OPEN') throw new DomainError('NOT_OPEN_MATCH', 'Solo puedes unirte a partidos abiertos.');
    if (match.status !== 'OPEN') throw new DomainError('MATCH_NOT_OPEN', 'Este partido ya no admite solicitudes.');
    if (match.organizerId === userId) throw new DomainError('IS_ORGANIZER', 'Eres el organizador de este partido.');
    if (match.participants.some((p) => p.userId === userId))
      throw new ConflictError('ALREADY_PARTICIPANT', 'Ya eres participante de este partido.');
    if (match.joinRequests.length > 0)
      throw new ConflictError('REQUEST_EXISTS', 'Ya tienes una solicitud pendiente.');
    if (calculateAvailableSlots(match.maxPlayers, match.participants.length) === 0)
      throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

    await prisma.independentMatchJoinRequest.create({
      data: { independentMatchId: matchId, userId },
    });

    // Notify organizer
    NotificationService.create({
      userId: match.organizerId,
      type: 'INDEPENDENT_MATCH_JOIN_REQUEST',
      title: 'Nueva solicitud para tu partido',
      body: 'Alguien quiere unirse a tu partido.',
      metadata: { matchId },
    }).catch(() => undefined);
  },

  async approveJoinRequest(requestId: string, organizerId: string): Promise<void> {
    const request = await prisma.independentMatchJoinRequest.findUnique({
      where: { id: requestId },
      include: {
        match: {
          include: { participants: { where: { status: 'ACCEPTED' } } },
        },
      },
    });
    if (!request) throw new NotFoundError('REQUEST_NOT_FOUND', 'Solicitud no encontrada.');
    if (request.match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede aprobar solicitudes.');
    if (request.status !== 'PENDING')
      throw new DomainError('REQUEST_NOT_PENDING', 'Esta solicitud ya fue procesada.');

    const available = calculateAvailableSlots(request.match.maxPlayers, request.match.participants.length);
    if (available === 0) throw new DomainError('MATCH_FULL', 'El partido ya está completo.');

    const newCount = request.match.participants.length + 1;
    const isFull = newCount >= request.match.maxPlayers;

    await prisma.$transaction(async (tx) => {
      await tx.independentMatchJoinRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', respondedByUserId: organizerId, respondedAt: new Date() },
      });
      await tx.independentMatchParticipant.create({
        data: { independentMatchId: request.independentMatchId, userId: request.userId, status: 'ACCEPTED' },
      });
      if (isFull) {
        await tx.independentMatch.update({
          where: { id: request.independentMatchId },
          data: { status: 'CONFIRMED' },
        });
      }
    });

    NotificationService.create({
      userId: request.userId,
      type: 'INDEPENDENT_MATCH_CONFIRMED',
      title: 'Solicitud aprobada',
      body: `Te has unido al partido "${request.match.name}".`,
      metadata: { matchId: request.independentMatchId },
    }).catch(() => undefined);
  },

  async rejectJoinRequest(requestId: string, organizerId: string): Promise<void> {
    const request = await prisma.independentMatchJoinRequest.findUnique({
      where: { id: requestId },
      include: { match: { select: { organizerId: true } } },
    });
    if (!request) throw new NotFoundError('REQUEST_NOT_FOUND', 'Solicitud no encontrada.');
    if (request.match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede rechazar solicitudes.');
    if (request.status !== 'PENDING')
      throw new DomainError('REQUEST_NOT_PENDING', 'Esta solicitud ya fue procesada.');

    await prisma.independentMatchJoinRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', respondedByUserId: organizerId, respondedAt: new Date() },
    });
  },
```

- [ ] **Step 2: Run typecheck to verify no type errors**

```bash
pnpm typecheck
```

Expected: no errors in `independent-match-service.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/modules/independent-matches/
git commit -m "feat(independent-matches): join request flow (request, approve, reject)"
```

---

## Task 4: Email invitation flow

**Files:**
- Modify: `src/modules/independent-matches/application/independent-match-service.ts`

- [ ] **Step 1: Add `inviteByEmail` and `acceptInvitation` methods**

Append to the `IndependentMatchService` object (before `} as const`):

```typescript
  async inviteByEmail(
    matchId: string,
    organizerId: string,
    email: string,
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

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Upsert: if expired invitation exists, recreate; if active, return existing
    const existing = await prisma.independentMatchInvitation.findUnique({
      where: { matchId_email: { matchId, email } },
    });

    if (existing && !existing.acceptedAt && existing.expiresAt > new Date()) {
      return { invitationId: existing.id, isNew: false };
    }

    const invitation = existing
      ? await prisma.independentMatchInvitation.update({
          where: { id: existing.id },
          data: { expiresAt, acceptedAt: null, createdAt: new Date() },
        })
      : await prisma.independentMatchInvitation.create({
          data: { matchId, email, expiresAt },
        });

    return { invitationId: invitation.id, isNew: true };
  },

  async acceptInvitation(token: string, userId: string): Promise<string> {
    const { SignedTokenService, SignedTokenPurpose } = await import('@/shared/auth/signed-tokens');

    const { subjectId } = await SignedTokenService.consume(token, SignedTokenPurpose.INDEPENDENT_MATCH_INVITE);

    const invitation = await prisma.independentMatchInvitation.findUnique({
      where: { id: subjectId },
      include: {
        match: { include: { participants: { where: { status: 'ACCEPTED' } } } },
      },
    });
    if (!invitation) throw new NotFoundError('INVITATION_NOT_FOUND', 'Invitación no encontrada.');
    if (invitation.acceptedAt) throw new DomainError('ALREADY_ACCEPTED', 'Esta invitación ya fue usada.');

    const { match } = invitation;
    if (match.status === 'CANCELLED') throw new DomainError('MATCH_CANCELLED', 'Este partido fue cancelado.');
    if (calculateAvailableSlots(match.maxPlayers, match.participants.length) === 0)
      throw new DomainError('MATCH_FULL', 'Este partido ya está completo.');

    const alreadyParticipant = match.participants.some((p) => p.userId === userId);
    if (alreadyParticipant) {
      // Idempotent: mark invitation accepted and return
      await prisma.independentMatchInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return match.id;
    }

    const newCount = match.participants.length + 1;
    const isFull = newCount >= match.maxPlayers;

    await prisma.$transaction(async (tx) => {
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

- [ ] **Step 2: Export `SignedTokenPurpose` info note**

The `acceptInvitation` method uses a dynamic import to avoid circular deps. Alternatively it can be a static import — check if there's a circular dependency issue by running typecheck:

```bash
pnpm typecheck
```

If circular dep error: move the `SignedTokenService` import to the top of the file as a static import alongside the other imports:

```typescript
import { SignedTokenService, SignedTokenPurpose } from '@/shared/auth/signed-tokens';
```

And remove the dynamic import from `acceptInvitation`, replacing:
```typescript
const { SignedTokenService, SignedTokenPurpose } = await import('@/shared/auth/signed-tokens');
```
with just:
```typescript
// (uses the static import above)
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/independent-matches/
git commit -m "feat(independent-matches): email invitation flow with SignedToken"
```

---

## Task 5: TEAM_CHALLENGE flow — accept, reject, cancel

**Files:**
- Modify: `src/modules/independent-matches/application/independent-match-service.ts`

- [ ] **Step 1: Add `acceptChallenge`, `rejectChallenge`, `cancelMatch` methods**

Append to the `IndependentMatchService` object (before `} as const`):

```typescript
  async acceptChallenge(matchId: string, userId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: {
        challengedTeam: { include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } } },
        organizer: { select: { id: true, name: true } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.type !== 'TEAM_CHALLENGE') throw new DomainError('NOT_CHALLENGE', 'Este partido no es un reto.');
    if (match.status !== 'PENDING_APPROVAL')
      throw new ConflictError('CHALLENGE_ALREADY_RESOLVED', 'Este reto ya fue respondido.');
    if (!match.challengedTeam)
      throw new DomainError('NO_CHALLENGED_TEAM', 'Equipo retado no encontrado.');

    const isChallengedMember = match.challengedTeam.members.some((m) => m.userId === userId);
    if (!isChallengedMember)
      throw new AuthorizationError('NOT_CHALLENGED_MEMBER', 'Solo un miembro del equipo retado puede aceptar.');

    // Get organizer team members
    const organizerTeam = await prisma.team.findFirst({
      where: {
        leagueId: match.leagueId!,
        members: { some: { userId: match.organizerId } },
        id: { not: match.challengedTeamId! },
      },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });

    const allParticipantUserIds = [
      ...match.challengedTeam.members.map((m) => m.userId),
      ...(organizerTeam?.members.map((m) => m.userId) ?? [match.organizerId]),
    ];

    await prisma.$transaction(async (tx) => {
      await tx.independentMatch.update({
        where: { id: matchId },
        data: { status: 'CONFIRMED' },
      });
      await tx.independentMatchParticipant.createMany({
        data: allParticipantUserIds.map((uid) => ({
          independentMatchId: matchId,
          userId: uid,
          status: 'ACCEPTED' as const,
        })),
        skipDuplicates: true,
      });
    });

    // Notify organizer
    NotificationService.create({
      userId: match.organizerId,
      type: 'INDEPENDENT_MATCH_CONFIRMED',
      title: 'Reto aceptado',
      body: `${match.challengedTeam.name} aceptó tu reto "${match.name}".`,
      metadata: { matchId },
    }).catch(() => undefined);
  },

  async rejectChallenge(matchId: string, userId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: {
        challengedTeam: { include: { members: { select: { userId: true } } } },
      },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.type !== 'TEAM_CHALLENGE') throw new DomainError('NOT_CHALLENGE', 'Este partido no es un reto.');
    if (match.status !== 'PENDING_APPROVAL')
      throw new ConflictError('CHALLENGE_ALREADY_RESOLVED', 'Este reto ya fue respondido.');

    const isChallengedMember = match.challengedTeam?.members.some((m) => m.userId === userId);
    if (!isChallengedMember)
      throw new AuthorizationError('NOT_CHALLENGED_MEMBER', 'Solo un miembro del equipo retado puede rechazar.');

    await prisma.independentMatch.update({
      where: { id: matchId },
      data: { status: 'REJECTED' },
    });

    NotificationService.create({
      userId: match.organizerId,
      type: 'INDEPENDENT_MATCH_CANCELLED',
      title: 'Reto rechazado',
      body: `Tu reto "${match.name}" fue rechazado.`,
      metadata: { matchId },
    }).catch(() => undefined);
  },

  async cancelMatch(matchId: string, organizerId: string): Promise<void> {
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: { participants: { where: { status: 'ACCEPTED' }, select: { userId: true } } },
    });
    if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
    if (match.organizerId !== organizerId)
      throw new AuthorizationError('NOT_ORGANIZER', 'Solo el organizador puede cancelar el partido.');
    if (match.status === 'CANCELLED')
      throw new DomainError('ALREADY_CANCELLED', 'El partido ya está cancelado.');

    await prisma.independentMatch.update({
      where: { id: matchId },
      data: { status: 'CANCELLED' },
    });

    const otherParticipantIds = match.participants
      .map((p) => p.userId)
      .filter((id) => id !== organizerId);

    if (otherParticipantIds.length > 0) {
      NotificationService.createMany(
        otherParticipantIds.map((userId) => ({
          userId,
          type: 'INDEPENDENT_MATCH_CANCELLED' as const,
          title: 'Partido cancelado',
          body: `El partido "${match.name}" ha sido cancelado.`,
          metadata: { matchId },
        })),
      ).catch(() => undefined);
    }
  },
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/independent-matches/
git commit -m "feat(independent-matches): challenge accept/reject and cancel flow"
```

---

## Task 6: Email templates + worker update

**Files:**
- Create: `src/worker/email-templates/ind-match-invite.tsx`
- Create: `src/worker/email-templates/ind-match-challenge.tsx`
- Create: `src/worker/email-templates/ind-match-challenge-response.tsx`
- Modify: `src/worker/handlers/send-email.ts`

- [ ] **Step 1: Create invitation email template**

Create `src/worker/email-templates/ind-match-invite.tsx`:

```typescript
import * as React from 'react';

interface Props {
  organizerName: string;
  matchName: string;
  matchUrl: string;
  scheduledAt?: string;
  location?: string;
}

export function IndMatchInviteEmail({ organizerName, matchName, matchUrl, scheduledAt, location }: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Te invitan a un partido de pádel</h1>
      <p><strong>{organizerName}</strong> te invita a unirte al partido <strong>"{matchName}"</strong>.</p>
      {scheduledAt && <p>Fecha: {scheduledAt}</p>}
      {location && <p>Lugar: {location}</p>}
      <a
        href={matchUrl}
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          background: '#0D1E45',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px',
          marginTop: '1rem',
        }}
      >
        Ver partido y unirme
      </a>
      <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
        El enlace es válido durante 7 días. Si no esperabas esta invitación, puedes ignorar este email.
      </p>
    </div>
  );
}

export const indMatchInviteSubject = 'Te invitan a un partido de pádel';
```

- [ ] **Step 2: Create team challenge email template**

Create `src/worker/email-templates/ind-match-challenge.tsx`:

```typescript
import * as React from 'react';

interface Props {
  organizerTeamName: string;
  matchName: string;
  matchUrl: string;
  scheduledAt?: string;
  location?: string;
}

export function IndMatchChallengeEmail({ organizerTeamName, matchName, matchUrl, scheduledAt, location }: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Reto de pádel recibido</h1>
      <p>El equipo <strong>{organizerTeamName}</strong> os reta a un partido amistoso: <strong>"{matchName}"</strong>.</p>
      {scheduledAt && <p>Fecha propuesta: {scheduledAt}</p>}
      {location && <p>Lugar: {location}</p>}
      <p>Cualquier miembro de tu equipo puede aceptar o rechazar el reto.</p>
      <a
        href={matchUrl}
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          background: '#0D1E45',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px',
          marginTop: '1rem',
        }}
      >
        Ver reto
      </a>
    </div>
  );
}

export const indMatchChallengeSubject = 'Reto de pádel recibido';
```

- [ ] **Step 3: Create challenge response email template**

Create `src/worker/email-templates/ind-match-challenge-response.tsx`:

```typescript
import * as React from 'react';

interface Props {
  challengedTeamName: string;
  matchName: string;
  accepted: boolean;
  matchUrl: string;
}

export function IndMatchChallengeResponseEmail({ challengedTeamName, matchName, accepted, matchUrl }: Props) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>{accepted ? 'Reto aceptado' : 'Reto rechazado'}</h1>
      <p>
        El equipo <strong>{challengedTeamName}</strong> ha{' '}
        {accepted ? 'aceptado' : 'rechazado'} tu reto <strong>"{matchName}"</strong>.
      </p>
      {accepted && (
        <a
          href={matchUrl}
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            background: '#0D1E45',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            marginTop: '1rem',
          }}
        >
          Ver partido
        </a>
      )}
    </div>
  );
}

export const indMatchChallengeResponseSubject = (accepted: boolean) =>
  accepted ? 'Tu reto fue aceptado' : 'Tu reto fue rechazado';
```

- [ ] **Step 4: Update `send-email.ts` handler to register the 3 new templates**

In `src/worker/handlers/send-email.ts`:

Add imports after the existing template imports (after line 10):

```typescript
import { IndMatchInviteEmail, indMatchInviteSubject } from '../email-templates/ind-match-invite';
import { IndMatchChallengeEmail, indMatchChallengeSubject } from '../email-templates/ind-match-challenge';
import { IndMatchChallengeResponseEmail, indMatchChallengeResponseSubject } from '../email-templates/ind-match-challenge-response';
```

Add 3 new `case` blocks inside `renderTemplate`'s `switch` (before `default:`):

```typescript
    case 'ind-match-invite':
      return {
        subject: indMatchInviteSubject,
        html: renderToStaticMarkup(
          React.createElement(IndMatchInviteEmail, {
            organizerName: str(data['organizerName'], 'Organizador'),
            matchName: str(data['matchName'], 'Partido'),
            matchUrl: str(data['matchUrl'], ''),
            scheduledAt: typeof data['scheduledAt'] === 'string' ? data['scheduledAt'] : undefined,
            location: typeof data['location'] === 'string' ? data['location'] : undefined,
          }),
        ),
      };
    case 'ind-match-challenge':
      return {
        subject: indMatchChallengeSubject,
        html: renderToStaticMarkup(
          React.createElement(IndMatchChallengeEmail, {
            organizerTeamName: str(data['organizerTeamName'], 'Equipo'),
            matchName: str(data['matchName'], 'Reto'),
            matchUrl: str(data['matchUrl'], ''),
            scheduledAt: typeof data['scheduledAt'] === 'string' ? data['scheduledAt'] : undefined,
            location: typeof data['location'] === 'string' ? data['location'] : undefined,
          }),
        ),
      };
    case 'ind-match-challenge-response':
      return {
        subject: indMatchChallengeResponseSubject(data['accepted'] === true),
        html: renderToStaticMarkup(
          React.createElement(IndMatchChallengeResponseEmail, {
            challengedTeamName: str(data['challengedTeamName'], 'Equipo'),
            matchName: str(data['matchName'], 'Reto'),
            accepted: data['accepted'] === true,
            matchUrl: str(data['matchUrl'], ''),
          }),
        ),
      };
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors in worker files.

- [ ] **Step 6: Commit**

```bash
git add src/worker/
git commit -m "feat(worker): add ind-match-invite, ind-match-challenge, ind-match-challenge-response email templates"
```

---

## Task 7: Navigation update + /jugar hub page

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/jugar/page.tsx`

- [ ] **Step 1: Add "Jugar" link to nav**

In `src/app/(app)/layout.tsx`, in the nav links block, add after the "Mis partidos" link and before the SUPER_ADMIN Disputas link:

```tsx
<Link
  href={'/jugar' as Route}
  className="text-sm font-medium text-white/80 hover:text-white transition-colors"
>
  Jugar
</Link>
```

- [ ] **Step 2: Create /jugar hub page**

Create `src/app/(app)/jugar/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService, calculateAvailableSlots } from '@/modules/independent-matches';

export const metadata = { title: 'Jugar — Padel League' };

export default async function JugarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token).catch(() => redirect('/login' as Route));

  const [openMatches, myMatches] = await Promise.all([
    IndependentMatchService.listOpen(),
    IndependentMatchService.getForUser(user.id),
  ]);

  const isTablon = tab !== 'mis';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Jugar</h1>
        <Link
          href={'/jugar/nuevo' as Route}
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          Crear partido
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <Link
          href={'/jugar' as Route}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            isTablon
              ? 'border-brand-navy text-brand-navy'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Tablón ({openMatches.filter((m) => calculateAvailableSlots(m.maxPlayers, m.confirmedCount) > 0).length})
        </Link>
        <Link
          href={'/jugar?tab=mis' as Route}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            !isTablon
              ? 'border-brand-navy text-brand-navy'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Mis partidos ({myMatches.length})
        </Link>
      </div>

      {isTablon ? (
        <section>
          {openMatches.length === 0 ? (
            <p className="text-sm text-gray-400">No hay partidos abiertos ahora mismo.</p>
          ) : (
            <div className="space-y-3">
              {openMatches.map((m) => {
                const available = calculateAvailableSlots(m.maxPlayers, m.confirmedCount);
                if (available === 0) return null;
                return (
                  <Link
                    key={m.id}
                    href={`/jugar/${m.id}` as Route}
                    className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-gray-900">{m.name}</h3>
                        {m.location && <p className="text-sm text-gray-500 mt-0.5">{m.location}</p>}
                        {m.scheduledAt && (
                          <p className="text-sm text-gray-500 mt-0.5">
                            {m.scheduledAt.toLocaleDateString('es-ES', {
                              weekday: 'short', day: 'numeric', month: 'short',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        )}
                        {m.description && <p className="text-sm text-gray-400 mt-1">{m.description}</p>}
                      </div>
                      <span className="shrink-0 text-sm font-medium text-brand-navy bg-blue-50 px-2 py-1 rounded">
                        {m.confirmedCount}/{m.maxPlayers} jugadores
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section>
          {myMatches.length === 0 ? (
            <p className="text-sm text-gray-400">No tienes partidos independientes.</p>
          ) : (
            <div className="space-y-3">
              {myMatches.map((m) => (
                <Link
                  key={m.id}
                  href={`/jugar/${m.id}` as Route}
                  className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-gray-900">{m.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {m.type === 'TEAM_CHALLENGE' ? 'Reto de equipo' : 'Partido abierto'}
                      </p>
                    </div>
                    <StatusBadge status={m.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    OPEN: { label: 'Abierto', className: 'bg-green-50 text-green-700' },
    PENDING_APPROVAL: { label: 'Pendiente', className: 'bg-yellow-50 text-yellow-700' },
    CONFIRMED: { label: 'Confirmado', className: 'bg-blue-50 text-blue-700' },
    REJECTED: { label: 'Rechazado', className: 'bg-red-50 text-red-700' },
    CANCELLED: { label: 'Cancelado', className: 'bg-gray-100 text-gray-500' },
  };
  const { label, className } = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-500' };
  return <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded ${className}`}>{label}</span>;
}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/layout.tsx src/app/\(app\)/jugar/
git commit -m "feat(ui): add Jugar nav link and hub page with Tablón/Mis partidos tabs"
```

---

## Task 8: /jugar/nuevo — create form + actions

**Files:**
- Create: `src/app/(app)/jugar/nuevo/page.tsx`
- Create: `src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx`
- Create: `src/app/(app)/jugar/nuevo/actions.ts`

- [ ] **Step 1: Create server actions for creating matches**

Create `src/app/(app)/jugar/nuevo/actions.ts`:

```typescript
'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService } from '@/modules/independent-matches';
import { isUserFacingError } from '@/shared/errors';
import { prisma } from '@/shared/db/client';
import { queue } from '@/shared/queue/client';
import { env } from '@/shared/config/env';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

type ActionResult = { error: string } | { success: true; matchId: string };

const createOpenSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(100),
  scheduledAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => d === undefined || !isNaN(d.getTime()), { message: 'Fecha no válida.' }),
  location: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  maxPlayers: z.coerce
    .number()
    .refine((n) => n === 2 || n === 4, { message: 'El máximo de jugadores debe ser 2 o 4.' })
    .transform((n) => n as 2 | 4),
});

export async function createOpenMatch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = createOpenSchema.safeParse({
    name: formData.get('name'),
    scheduledAt: formData.get('scheduledAt') || undefined,
    location: formData.get('location') || undefined,
    description: formData.get('description') || undefined,
    maxPlayers: formData.get('maxPlayers'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    const match = await IndependentMatchService.createOpen({ ...parsed.data, organizerId: user.id });
    revalidatePath('/jugar');
    return { success: true, matchId: match.id };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const createChallengeSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(100),
  organizerTeamId: z.string().cuid(),
  challengedTeamId: z.string().cuid(),
  leagueId: z.string().cuid(),
  scheduledAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => d === undefined || !isNaN(d.getTime()), { message: 'Fecha no válida.' }),
  location: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});

export async function createChallenge(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = createChallengeSchema.safeParse({
    name: formData.get('name'),
    organizerTeamId: formData.get('organizerTeamId'),
    challengedTeamId: formData.get('challengedTeamId'),
    leagueId: formData.get('leagueId'),
    scheduledAt: formData.get('scheduledAt') || undefined,
    location: formData.get('location') || undefined,
    description: formData.get('description') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    const match = await IndependentMatchService.createChallenge({ ...parsed.data, organizerId: user.id });

    // Send email to challenged team members
    const challengedTeam = await prisma.team.findUnique({
      where: { id: parsed.data.challengedTeamId },
      include: { members: { include: { user: { select: { email: true, name: true } } } } },
    });
    const organizerTeam = await prisma.team.findUnique({
      where: { id: parsed.data.organizerTeamId },
      select: { name: true },
    });
    const matchUrl = `${env().APP_URL}/jugar/${match.id}`;
    const q = queue();
    await q.start();
    await Promise.all(
      (challengedTeam?.members ?? []).map((m) =>
        q.publish('send-email', {
          template: 'ind-match-challenge',
          to: m.user.email,
          data: {
            organizerTeamName: organizerTeam?.name ?? 'Equipo rival',
            matchName: match.name,
            matchUrl,
            scheduledAt: match.scheduledAt?.toLocaleDateString('es-ES') ?? undefined,
            location: match.location ?? undefined,
          },
          dedupKey: `ind-challenge-${match.id}-${m.user.email}`,
        }),
      ),
    );

    revalidatePath('/jugar');
    return { success: true, matchId: match.id };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
```

- [ ] **Step 2: Create the client form component**

Create `src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx`:

```tsx
'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createOpenMatch, createChallenge } from '../actions';
import type { TeamForChallenge } from '@/modules/independent-matches';

type Props = {
  userTeams: TeamForChallenge[];
};

type ActionResult = { error: string } | { success: true; matchId: string } | null;

export function NuevoPartidoForm({ userTeams }: Props) {
  const [openState, openAction, openPending] = useActionState<ActionResult, FormData>(createOpenMatch, null);
  const [challengeState, challengeAction, challengePending] = useActionState<ActionResult, FormData>(createChallenge, null);
  const router = useRouter();

  useEffect(() => {
    if (openState && 'success' in openState) router.push(`/jugar/${openState.matchId}`);
  }, [openState, router]);

  useEffect(() => {
    if (challengeState && 'success' in challengeState) router.push(`/jugar/${challengeState.matchId}`);
  }, [challengeState, router]);

  const [type, setType] = useEffect !== undefined
    ? // eslint-disable-next-line react-hooks/rules-of-hooks
      (() => {
        const [t, setT] = require('react').useState<'open' | 'challenge'>('open');
        return [t, setT] as const;
      })()
    : (['open', () => {}] as const);
```

**Important:** The above pattern is wrong — `useState` cannot be called conditionally. Rewrite this component correctly:

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createOpenMatch, createChallenge } from '../actions';
import type { TeamForChallenge } from '@/modules/independent-matches';

type ActionResult = { error: string } | { success: true; matchId: string } | null;

export function NuevoPartidoForm({ userTeams }: { userTeams: TeamForChallenge[] }) {
  const [type, setType] = useState<'open' | 'challenge'>('open');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [openState, openAction, openPending] = useActionState<ActionResult, FormData>(createOpenMatch, null);
  const [challengeState, challengeAction, challengePending] = useActionState<ActionResult, FormData>(createChallenge, null);
  const router = useRouter();

  useEffect(() => {
    if (openState && 'success' in openState) router.push(`/jugar/${openState.matchId}`);
  }, [openState, router]);

  useEffect(() => {
    if (challengeState && 'success' in challengeState) router.push(`/jugar/${challengeState.matchId}`);
  }, [challengeState, router]);

  const selectedTeam = userTeams.find((t) => t.id === selectedTeamId);
  const rivalTeams = selectedTeam
    ? userTeams.filter((t) => t.leagueId === (selectedTeam as TeamForChallenge).leagueId && t.id !== selectedTeamId)
    : [];

  return (
    <div className="space-y-6">
      {/* Type selector */}
      {userTeams.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('open')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              type === 'open'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            Partido abierto
          </button>
          <button
            type="button"
            onClick={() => setType('challenge')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              type === 'challenge'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            Retar a un equipo
          </button>
        </div>
      )}

      {type === 'open' ? (
        <form action={openAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del partido *</label>
            <input name="name" required maxLength={100} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jugadores máximos</label>
            <select name="maxPlayers" defaultValue="4" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="2">2 jugadores</option>
              <option value="4">4 jugadores</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y hora (opcional)</label>
            <input name="scheduledAt" type="datetime-local" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lugar (opcional)</label>
            <input name="location" maxLength={200} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
            <textarea name="description" maxLength={500} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          {openState && 'error' in openState && (
            <p className="text-sm text-red-600">{openState.error}</p>
          )}
          <button
            type="submit"
            disabled={openPending}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {openPending ? 'Creando...' : 'Crear partido'}
          </button>
        </form>
      ) : (
        <form action={challengeAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del reto *</label>
            <input name="name" required maxLength={100} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tu equipo *</label>
            <select
              name="organizerTeamId"
              required
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">Selecciona tu equipo...</option>
              {userTeams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {selectedTeam && (
            <>
              <input type="hidden" name="leagueId" value={selectedTeam.leagueId} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Equipo retado *</label>
                <select name="challengedTeamId" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="">Selecciona equipo rival...</option>
                  {rivalTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y hora (opcional)</label>
            <input name="scheduledAt" type="datetime-local" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lugar (opcional)</label>
            <input name="location" maxLength={200} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          {challengeState && 'error' in challengeState && (
            <p className="text-sm text-red-600">{challengeState.error}</p>
          )}
          <button
            type="submit"
            disabled={challengePending || !selectedTeamId}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {challengePending ? 'Enviando...' : 'Enviar reto'}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the page**

Create `src/app/(app)/jugar/nuevo/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService } from '@/modules/independent-matches';
import { NuevoPartidoForm } from './_components/nuevo-partido-form';

export const metadata = { title: 'Crear partido — Padel League' };

export default async function NuevoPartidoPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token).catch(() => redirect('/login' as Route));

  const userTeams = await IndependentMatchService.getTeamsForUser(user.id);

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Crear partido</h1>
      <NuevoPartidoForm userTeams={userTeams} />
    </div>
  );
}
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/jugar/nuevo/
git commit -m "feat(ui): create match form — open match and team challenge"
```

---

## Task 9: /jugar/[id] — detail page + all actions + components

**Files:**
- Create: `src/app/(app)/jugar/[id]/page.tsx`
- Create: `src/app/(app)/jugar/[id]/actions.ts`
- Create: `src/app/(app)/jugar/[id]/_components/join-request-button.tsx`
- Create: `src/app/(app)/jugar/[id]/_components/join-requests-panel.tsx`
- Create: `src/app/(app)/jugar/[id]/_components/invite-form.tsx`
- Create: `src/app/(app)/jugar/[id]/_components/challenge-panel.tsx`

- [ ] **Step 1: Create server actions for the detail page**

Create `src/app/(app)/jugar/[id]/actions.ts`:

```typescript
'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService } from '@/modules/independent-matches';
import { SignedTokenService, SignedTokenPurpose } from '@/shared/auth/signed-tokens';
import { isUserFacingError } from '@/shared/errors';
import { queue } from '@/shared/queue/client';
import { env } from '@/shared/config/env';
import { prisma } from '@/shared/db/client';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

type ActionResult = { error: string } | { success: true };

export async function requestToJoin(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getSession();
  const matchId = formData.get('matchId');
  if (typeof matchId !== 'string') return { error: 'Datos inválidos.' };

  try {
    await IndependentMatchService.requestToJoin(matchId, user.id);
    revalidatePath(`/jugar/${matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function approveJoinRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getSession();
  const requestId = formData.get('requestId');
  const matchId = formData.get('matchId');
  if (typeof requestId !== 'string' || typeof matchId !== 'string') return { error: 'Datos inválidos.' };

  try {
    await IndependentMatchService.approveJoinRequest(requestId, user.id);
    revalidatePath(`/jugar/${matchId}`);
    revalidatePath('/jugar');
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function rejectJoinRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getSession();
  const requestId = formData.get('requestId');
  const matchId = formData.get('matchId');
  if (typeof requestId !== 'string' || typeof matchId !== 'string') return { error: 'Datos inválidos.' };

  try {
    await IndependentMatchService.rejectJoinRequest(requestId, user.id);
    revalidatePath(`/jugar/${matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const inviteSchema = z.object({
  matchId: z.string().cuid(),
  email: z.string().email('Email inválido.').toLowerCase(),
});

export async function inviteByEmail(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getSession();
  const parsed = inviteSchema.safeParse({
    matchId: formData.get('matchId'),
    email: formData.get('email'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    const { invitationId } = await IndependentMatchService.inviteByEmail(
      parsed.data.matchId,
      user.id,
      parsed.data.email,
    );

    // Issue signed token
    const token = await SignedTokenService.issue({
      purpose: SignedTokenPurpose.INDEPENDENT_MATCH_INVITE,
      subjectId: invitationId,
      ttlSeconds: 7 * 24 * 60 * 60,
    });

    const matchUrl = `${env().APP_URL}/jugar/${parsed.data.matchId}?token=${token}`;

    // Get match name and organizer name for email
    const match = await prisma.independentMatch.findUnique({
      where: { id: parsed.data.matchId },
      include: { organizer: { select: { name: true } } },
    });

    const q = queue();
    await q.start();
    await q.publish('send-email', {
      template: 'ind-match-invite',
      to: parsed.data.email,
      data: {
        organizerName: match?.organizer.name ?? 'Organizador',
        matchName: match?.name ?? 'Partido',
        matchUrl,
        scheduledAt: match?.scheduledAt?.toLocaleDateString('es-ES') ?? undefined,
        location: match?.location ?? undefined,
      },
      dedupKey: `ind-invite-${invitationId}`,
    });

    // Also notify if user already exists in platform
    const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existingUser) {
      await prisma.notification.create({
        data: {
          userId: existingUser.id,
          type: 'INDEPENDENT_MATCH_INVITE',
          title: 'Invitación a partido',
          body: `${match?.organizer.name ?? 'Alguien'} te invita a "${match?.name ?? 'un partido'}".`,
          metadata: { matchId: parsed.data.matchId },
        },
      });
    }

    revalidatePath(`/jugar/${parsed.data.matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function respondToChallenge(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const matchId = formData.get('matchId');
  const response = formData.get('response');
  if (typeof matchId !== 'string' || (response !== 'accept' && response !== 'reject'))
    return { error: 'Datos inválidos.' };

  try {
    if (response === 'accept') {
      await IndependentMatchService.acceptChallenge(matchId, user.id);
    } else {
      await IndependentMatchService.rejectChallenge(matchId, user.id);
    }

    // Send email to organizer
    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: {
        organizer: { select: { email: true, name: true } },
        challengedTeam: { select: { name: true } },
      },
    });

    if (match?.organizer) {
      const q = queue();
      await q.start();
      await q.publish('send-email', {
        template: 'ind-match-challenge-response',
        to: match.organizer.email,
        data: {
          challengedTeamName: match.challengedTeam?.name ?? 'Equipo',
          matchName: match.name,
          accepted: response === 'accept',
          matchUrl: `${env().APP_URL}/jugar/${matchId}`,
        },
        dedupKey: `ind-challenge-response-${matchId}-${response}`,
      });
    }

    revalidatePath(`/jugar/${matchId}`);
    revalidatePath('/jugar');
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

// Used as a direct form action (not useActionState), so no _prev param.
export async function cancelMatch(formData: FormData): Promise<void> {
  const user = await getSession();
  const matchId = formData.get('matchId');
  if (typeof matchId !== 'string') return;

  await IndependentMatchService.cancelMatch(matchId, user.id);
  revalidatePath(`/jugar/${matchId}`);
  revalidatePath('/jugar');
  redirect('/jugar' as Route);
}
```

- [ ] **Step 2: Create `JoinRequestButton` client component**

Create `src/app/(app)/jugar/[id]/_components/join-request-button.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { requestToJoin } from '../actions';

type ActionResult = { error: string } | { success: true } | null;

export function JoinRequestButton({ matchId }: { matchId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(requestToJoin, null);

  if (state && 'success' in state) {
    return <p className="text-sm text-green-600 font-medium">Solicitud enviada. Espera a que el organizador la apruebe.</p>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="matchId" value={matchId} />
      {state && 'error' in state && <p className="text-sm text-red-600 mb-2">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy/90 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Enviando...' : 'Unirme a este partido'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create `JoinRequestsPanel` component (organizer view)**

Create `src/app/(app)/jugar/[id]/_components/join-requests-panel.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { approveJoinRequest, rejectJoinRequest } from '../actions';

type Request = { id: string; userId: string; user: { id: string; name: string } };
type ActionResult = { error: string } | { success: true } | null;

export function JoinRequestsPanel({ requests, matchId }: { requests: Request[]; matchId: string }) {
  if (requests.length === 0) return null;

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-yellow-800 mb-3">
        Solicitudes pendientes ({requests.length})
      </h3>
      <ul className="space-y-2">
        {requests.map((req) => (
          <RequestRow key={req.id} request={req} matchId={matchId} />
        ))}
      </ul>
    </div>
  );
}

function RequestRow({ request, matchId }: { request: Request; matchId: string }) {
  const [approveState, approveAction, approvePending] = useActionState<ActionResult, FormData>(approveJoinRequest, null);
  const [rejectState, rejectAction, rejectPending] = useActionState<ActionResult, FormData>(rejectJoinRequest, null);

  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-700">{request.user.name}</span>
      <div className="flex gap-2">
        <form action={approveAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="matchId" value={matchId} />
          <button
            type="submit"
            disabled={approvePending || rejectPending}
            className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Aprobar
          </button>
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="matchId" value={matchId} />
          <button
            type="submit"
            disabled={approvePending || rejectPending}
            className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Rechazar
          </button>
        </form>
      </div>
      {(approveState && 'error' in approveState) && (
        <p className="text-xs text-red-600">{approveState.error}</p>
      )}
      {(rejectState && 'error' in rejectState) && (
        <p className="text-xs text-red-600">{rejectState.error}</p>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Create `InviteForm` component**

Create `src/app/(app)/jugar/[id]/_components/invite-form.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { inviteByEmail } from '../actions';

type ActionResult = { error: string } | { success: true } | null;

export function InviteForm({ matchId }: { matchId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(inviteByEmail, null);

  return (
    <form action={action} className="flex gap-2 items-start">
      <input type="hidden" name="matchId" value={matchId} />
      <div className="flex-1">
        <input
          name="email"
          type="email"
          placeholder="email@ejemplo.com"
          required
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
        />
        {state && 'error' in state && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
        {state && 'success' in state && <p className="text-xs text-green-600 mt-1">Invitación enviada.</p>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors shrink-0"
      >
        {pending ? '...' : 'Invitar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Create `ChallengePanel` component**

Create `src/app/(app)/jugar/[id]/_components/challenge-panel.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { respondToChallenge } from '../actions';

type ActionResult = { error: string } | { success: true } | null;

export function ChallengePanel({ matchId, challengerTeamName }: { matchId: string; challengerTeamName: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(respondToChallenge, null);

  if (state && 'success' in state) {
    return <p className="text-sm text-green-600 font-medium">Respuesta enviada.</p>;
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <p className="text-sm text-blue-800 mb-3">
        <strong>{challengerTeamName}</strong> os reta a un partido amistoso.
      </p>
      {state && 'error' in state && <p className="text-sm text-red-600 mb-2">{state.error}</p>}
      <div className="flex gap-2">
        <form action={action}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="response" value="accept" />
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            Aceptar reto
          </button>
        </form>
        <form action={action}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="response" value="reject" />
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Rechazar
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create the match detail page**

Create `src/app/(app)/jugar/[id]/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService, calculateAvailableSlots } from '@/modules/independent-matches';
import { InvalidTokenError } from '@/shared/errors';
import { JoinRequestButton } from './_components/join-request-button';
import { JoinRequestsPanel } from './_components/join-requests-panel';
import { InviteForm } from './_components/invite-form';
import { ChallengePanel } from './_components/challenge-panel';
import { cancelMatch } from './actions';

export default async function JugarDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    const next = encodeURIComponent(`/jugar/${id}${token ? `?token=${token}` : ''}`);
    redirect(`/login?next=${next}` as Route);
  }
  const user = await getValidatedSession(sessionToken).catch(() => {
    const next = encodeURIComponent(`/jugar/${id}${token ? `?token=${token}` : ''}`);
    redirect(`/login?next=${next}` as Route);
  });

  // Process invitation token if present
  let tokenError: string | null = null;
  if (token) {
    try {
      await IndependentMatchService.acceptInvitation(token, user.id);
      redirect(`/jugar/${id}` as Route);
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        tokenError = 'El enlace de invitación no es válido o ha caducado.';
      } else if ((err as Error).message?.includes('completo')) {
        tokenError = 'Este partido ya está completo.';
      } else if ((err as Error).message?.includes('cancelado')) {
        tokenError = 'Este partido fue cancelado.';
      } else {
        throw err;
      }
    }
  }

  const match = await IndependentMatchService.getById(id).catch(() => notFound());

  const isOrganizer = match.organizerId === user.id;
  const isParticipant = match.participants.some((p) => p.userId === user.id);
  const hasPendingRequest = match.joinRequests.some((r) => r.userId === user.id);
  const availableSlots = calculateAvailableSlots(match.maxPlayers, match.participants.length);

  const isChallengeMember =
    match.type === 'TEAM_CHALLENGE' &&
    match.status === 'PENDING_APPROVAL' &&
    match.challengedTeam != null;

  return (
    <div className="max-w-2xl space-y-6">
      {tokenError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {tokenError}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">{match.name}</h1>
          <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded ${statusStyle(match.status)}`}>
            {statusLabel(match.status)}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {match.type === 'TEAM_CHALLENGE' ? 'Reto de equipo' : 'Partido abierto'} · Organiza{' '}
          <strong>{match.organizer.name}</strong>
        </p>
        {match.scheduledAt && (
          <p className="text-sm text-gray-600 mt-1">
            {match.scheduledAt.toLocaleDateString('es-ES', {
              weekday: 'long', day: 'numeric', month: 'long',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
        {match.location && <p className="text-sm text-gray-600">{match.location}</p>}
        {match.description && <p className="text-sm text-gray-500 mt-2">{match.description}</p>}
      </div>

      {/* Challenge panel: challenged team member can accept/reject */}
      {isChallengeMember && !isOrganizer && (
        <ChallengePanel matchId={id} challengerTeamName={match.organizer.name} />
      )}

      {/* Participants */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          Participantes ({match.participants.length}/{match.maxPlayers})
        </h2>
        {match.participants.length === 0 ? (
          <p className="text-sm text-gray-400">Nadie se ha unido todavía.</p>
        ) : (
          <ul className="space-y-1">
            {match.participants.map((p) => (
              <li key={p.userId} className="text-sm text-gray-700 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium shrink-0">
                  {p.user.name[0]?.toUpperCase()}
                </span>
                {p.user.name}
                {p.userId === match.organizerId && (
                  <span className="text-xs text-gray-400">(organizador)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Join request button: non-participant, non-organizer on open match */}
      {match.type === 'OPEN' && match.status === 'OPEN' && !isOrganizer && !isParticipant && !hasPendingRequest && availableSlots > 0 && (
        <JoinRequestButton matchId={id} />
      )}
      {hasPendingRequest && (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
          Tu solicitud está pendiente de aprobación.
        </p>
      )}

      {/* Organizer controls */}
      {isOrganizer && (
        <section className="space-y-4">
          {/* Join requests for organizer to approve/reject */}
          {match.type === 'OPEN' && (
            <JoinRequestsPanel requests={match.joinRequests} matchId={id} />
          )}

          {/* Invite by email */}
          {['OPEN', 'PENDING_APPROVAL'].includes(match.status) && availableSlots > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Invitar por email</h3>
              <InviteForm matchId={id} />
              {match.invitations.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Invitaciones enviadas:</p>
                  <ul className="space-y-1">
                    {match.invitations.map((inv) => (
                      <li key={inv.id} className="text-xs text-gray-600 flex items-center gap-2">
                        {inv.email}
                        {inv.acceptedAt
                          ? <span className="text-green-600">✓ Aceptada</span>
                          : <span className="text-gray-400">Pendiente</span>
                        }
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Cancel */}
          {match.status !== 'CANCELLED' && match.status !== 'REJECTED' && (
            <form action={cancelMatch}>
              <input type="hidden" name="matchId" value={id} />
              <button
                type="submit"
                className="text-sm text-red-600 hover:text-red-800 transition-colors"
                onClick={(e) => {
                  if (!confirm('¿Seguro que quieres cancelar este partido?')) e.preventDefault();
                }}
              >
                Cancelar partido
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    OPEN: 'Abierto',
    PENDING_APPROVAL: 'Pendiente',
    CONFIRMED: 'Confirmado',
    REJECTED: 'Rechazado',
    CANCELLED: 'Cancelado',
  };
  return map[status] ?? status;
}

function statusStyle(status: string): string {
  const map: Record<string, string> = {
    OPEN: 'bg-green-50 text-green-700',
    PENDING_APPROVAL: 'bg-yellow-50 text-yellow-700',
    CONFIRMED: 'bg-blue-50 text-blue-700',
    REJECTED: 'bg-red-50 text-red-700',
    CANCELLED: 'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-gray-100 text-gray-500';
}
```

- [ ] **Step 7: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors. If there are `cancelMatch` server action binding issues (it's used directly in a form without `useActionState`), wrap it with a form using the action attribute — that pattern is valid in Next.js 15 server actions.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/jugar/\[id\]/
git commit -m "feat(ui): match detail page with join, invite, challenge and cancel flows"
```

---

## Task 10: Integration tests

**Files:**
- Create: `tests/integration/independent-matches.test.ts`

- [ ] **Step 1: Write integration tests**

Create `tests/integration/independent-matches.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { IndependentMatchService } from '@/modules/independent-matches';

const prisma = testPrisma();

async function createUser(name: string, email: string) {
  return prisma.user.create({
    data: { name, email, passwordHash: 'hash', emailVerifiedAt: new Date() },
  });
}

async function createLeagueWithTeams() {
  const admin = await createUser('Admin', `admin-${Date.now()}@test.com`);
  const league = await prisma.league.create({
    data: {
      name: 'Test Liga',
      slug: `test-liga-${Date.now()}`,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000 * 30),
      status: 'ACTIVE',
      createdByUserId: admin.id,
    },
  });

  const userA1 = await createUser('Player A1', `a1-${Date.now()}@test.com`);
  const userA2 = await createUser('Player A2', `a2-${Date.now()}@test.com`);
  const userB1 = await createUser('Player B1', `b1-${Date.now()}@test.com`);
  const userB2 = await createUser('Player B2', `b2-${Date.now()}@test.com`);

  const teamA = await prisma.team.create({
    data: {
      leagueId: league.id,
      name: 'Team A',
      members: {
        create: [{ userId: userA1.id }, { userId: userA2.id }],
      },
    },
  });
  const teamB = await prisma.team.create({
    data: {
      leagueId: league.id,
      name: 'Team B',
      members: {
        create: [{ userId: userB1.id }, { userId: userB2.id }],
      },
    },
  });

  return { league, teamA, teamB, userA1, userA2, userB1, userB2 };
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('IndependentMatchService — OPEN match flow', () => {
  it('creates an OPEN match and organizer is participant', async () => {
    const organizer = await createUser('Organizer', `org-${Date.now()}@test.com`);

    const match = await IndependentMatchService.createOpen({
      organizerId: organizer.id,
      name: 'Partido tarde',
      maxPlayers: 4,
    });

    expect(match.status).toBe('OPEN');
    expect(match.type).toBe('OPEN');

    const participants = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: match.id, status: 'ACCEPTED' },
    });
    expect(participants).toHaveLength(1);
    expect(participants[0]!.userId).toBe(organizer.id);
  });

  it('join request → approve → match CONFIRMED when full (maxPlayers 2)', async () => {
    const organizer = await createUser('Org', `org2-${Date.now()}@test.com`);
    const joiner = await createUser('Joiner', `joiner-${Date.now()}@test.com`);

    const match = await IndependentMatchService.createOpen({
      organizerId: organizer.id,
      name: 'Test 2-player',
      maxPlayers: 2,
    });

    await IndependentMatchService.requestToJoin(match.id, joiner.id);

    const request = await prisma.independentMatchJoinRequest.findFirst({
      where: { independentMatchId: match.id },
    });
    expect(request?.status).toBe('PENDING');

    await IndependentMatchService.approveJoinRequest(request!.id, organizer.id);

    const updated = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(updated?.status).toBe('CONFIRMED');

    const participants = await prisma.independentMatchParticipant.count({
      where: { independentMatchId: match.id, status: 'ACCEPTED' },
    });
    expect(participants).toBe(2);
  });

  it('cannot join a full match', async () => {
    const organizer = await createUser('Org', `org3-${Date.now()}@test.com`);
    const joiner = await createUser('Joiner', `joiner2-${Date.now()}@test.com`);
    const extra = await createUser('Extra', `extra-${Date.now()}@test.com`);

    const match = await IndependentMatchService.createOpen({
      organizerId: organizer.id,
      name: 'Test full',
      maxPlayers: 2,
    });

    await IndependentMatchService.requestToJoin(match.id, joiner.id);
    const req = await prisma.independentMatchJoinRequest.findFirst({ where: { independentMatchId: match.id } });
    await IndependentMatchService.approveJoinRequest(req!.id, organizer.id);

    await expect(IndependentMatchService.requestToJoin(match.id, extra.id)).rejects.toThrow('completo');
  });
});

describe('IndependentMatchService — TEAM_CHALLENGE flow', () => {
  it('creates challenge, transitions to PENDING_APPROVAL', async () => {
    const { league, teamA, teamB, userA1 } = await createLeagueWithTeams();

    const match = await IndependentMatchService.createChallenge({
      organizerId: userA1.id,
      organizerTeamId: teamA.id,
      challengedTeamId: teamB.id,
      leagueId: league.id,
      name: 'Reto amistoso',
    });

    expect(match.status).toBe('PENDING_APPROVAL');
    expect(match.type).toBe('TEAM_CHALLENGE');
    expect(match.challengedTeamId).toBe(teamB.id);
  });

  it('accept challenge → CONFIRMED with 4 participants', async () => {
    const { league, teamA, teamB, userA1, userA2, userB1, userB2 } = await createLeagueWithTeams();

    const match = await IndependentMatchService.createChallenge({
      organizerId: userA1.id,
      organizerTeamId: teamA.id,
      challengedTeamId: teamB.id,
      leagueId: league.id,
      name: 'Reto amistoso',
    });

    await IndependentMatchService.acceptChallenge(match.id, userB1.id);

    const updated = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(updated?.status).toBe('CONFIRMED');

    const participantIds = await prisma.independentMatchParticipant
      .findMany({ where: { independentMatchId: match.id, status: 'ACCEPTED' }, select: { userId: true } })
      .then((ps) => ps.map((p) => p.userId).sort());

    expect(participantIds).toContain(userA1.id);
    expect(participantIds).toContain(userA2.id);
    expect(participantIds).toContain(userB1.id);
    expect(participantIds).toContain(userB2.id);
  });

  it('reject challenge → REJECTED', async () => {
    const { league, teamA, teamB, userA1, userB1 } = await createLeagueWithTeams();

    const match = await IndependentMatchService.createChallenge({
      organizerId: userA1.id,
      organizerTeamId: teamA.id,
      challengedTeamId: teamB.id,
      leagueId: league.id,
      name: 'Reto rechazado',
    });

    await IndependentMatchService.rejectChallenge(match.id, userB1.id);

    const updated = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(updated?.status).toBe('REJECTED');
  });

  it('second member cannot respond to already-resolved challenge', async () => {
    const { league, teamA, teamB, userA1, userB1, userB2 } = await createLeagueWithTeams();

    const match = await IndependentMatchService.createChallenge({
      organizerId: userA1.id,
      organizerTeamId: teamA.id,
      challengedTeamId: teamB.id,
      leagueId: league.id,
      name: 'Race condition test',
    });

    await IndependentMatchService.acceptChallenge(match.id, userB1.id);
    await expect(IndependentMatchService.acceptChallenge(match.id, userB2.id)).rejects.toThrow('respondido');
  });
});
```

- [ ] **Step 2: Run unit tests first to confirm no regression**

```bash
pnpm test:unit
```

Expected: All unit tests passing.

- [ ] **Step 3: Run integration tests**

```bash
pnpm test:integration -- tests/integration/independent-matches.test.ts
```

Expected: All 6 integration tests PASS. (Tests spin up a Postgres container via testcontainers — first run takes ~30s.)

- [ ] **Step 4: Fix any failures**

Common issues:
- Missing `ACTIVE` league status filter in `getTeamsForUser` — verify with `prisma.team.findMany` query.
- `organizerTeam` lookup in `acceptChallenge` might miss teams when there are multiple per league — check the `getById` vs `findFirst` logic.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test:unit && pnpm test:integration
```

Expected: All tests green.

- [ ] **Step 6: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: No errors, no warnings.

- [ ] **Step 7: Commit**

```bash
git add tests/
git commit -m "test(independent-matches): integration tests for OPEN and TEAM_CHALLENGE flows"
```
