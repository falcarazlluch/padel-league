# Match multi-invite + visibility + team host — design

**Status:** approved (brainstorming closed 2026-04-30)
**Author:** PadelLeague
**Scope:** independent matches (`/jugar/...`); does not change league matches.

## Goal

Consolidate independent matches into a single mode with explicit `visibility = PUBLIC | PRIVATE`. Replace the join-request approval flow with first-to-accept-wins semantics. Allow inviting both registered users and (later) entire teams via a typeahead. Allow creating a match "as user" (1 host slot) or "as team" (2 host slots, 4-player matches only).

## Non-goals

- Inviting unregistered people stays via the existing email path; the new typeahead is only for registered users / teams.
- Participants leaving a match — out of scope.
- Reminders / RSVP nudges — out of scope.
- Toggling visibility after creation — out of scope.
- Chat / comments on a match — out of scope.
- Geographic filtering of the tablón — out of scope.
- Mobile push notifications — only in-app + email.

## Approved decisions

| # | Question | Answer |
|---|---|---|
| 1 | Single mode vs preserve OPEN/TEAM_CHALLENGE? | Single consolidated mode (eventually). Stage 1 keeps legacy intact; stage 2 removes it. |
| 2 | Approval flow vs direct accept? | Direct accept, no approval. Public matches: anyone joins via tablón button. Private: invitation-only. |
| 3 | "As team" semantics? | Host team occupies 2 slots; only valid for 4-player matches. |
| 4a | Invite a team when fewer than 2 slots are left? | Block at invite time. UI greys out the "Invitar equipo" branch when `slotsAvailable < 2`. |
| 4b | Cap on simultaneous pending invitations? | None — rate limit on the search endpoint is the only throttle. |
| 5 | Implementation strategy? | Two stages, single spec, two implementation plans. |

## Two-stage delivery

**Stage 1** — Multi-invite + visibility + drop join-requests:
- Add `visibility` field to `IndependentMatch` (default `PUBLIC`).
- Drop `IndependentMatchJoinRequest` and the approve/reject flow.
- Multi-invite to **registered users** via a typeahead (one user per invitation row, send many in sequence).
- Public match: tablón shows a direct "Unirme" button. Private: invitation-only, not in tablón.
- TEAM_CHALLENGE flow remains intact in this stage but is hidden from new creations.

**Stage 2** — Team host + invite teams + drop legacy:
- Add `hostTeamId` (rename `organizerTeamId`).
- Multi-invite to **teams** via the same typeahead (mixed user/team results).
- Migrate existing `TEAM_CHALLENGE` matches to the new model and drop the legacy code paths.

Each stage produces a usable end-state and ships independently.

## Architecture

### Data model

**Stage 1 schema changes:**

```prisma
model IndependentMatch {
  // ... existing fields
  visibility MatchVisibility @default(PUBLIC) @map("visibility")
  // type, organizerTeamId, challengedTeamId, leagueId — preserved this stage
}

enum MatchVisibility {
  PUBLIC
  PRIVATE
}

model IndependentMatchInvitation {
  id            String    @id @default(cuid())
  matchId       String    @map("match_id")
  email         String?   @db.Citext         // becomes nullable
  invitedUserId String?   @map("invited_user_id")
  expiresAt     DateTime  @map("expires_at")
  acceptedAt    DateTime? @map("accepted_at")
  createdAt     DateTime  @default(now()) @map("created_at")

  match       IndependentMatch @relation(fields: [matchId], references: [id], onDelete: Cascade)
  invitedUser User?            @relation(fields: [invitedUserId], references: [id], onDelete: SetNull)

  @@unique([matchId, email], map: "imi_match_email_uniq")
  @@unique([matchId, invitedUserId], map: "imi_match_user_uniq")
  @@index([matchId])
}

// IndependentMatchJoinRequest → DROP
// JoinRequestStatus enum → DROP
```

A SQL CHECK is added in the migration: exactly one of `{email, invited_user_id}` is non-null.

**Stage 2 schema changes (on top of Stage 1):**

```prisma
model IndependentMatch {
  // type → DROP
  // organizerTeamId → renamed to hostTeamId
  // challengedTeamId → DROP
  status IndependentMatchStatus  // enum becomes OPEN | CONFIRMED | CANCELLED
}

// IndependentMatchType enum → DROP

model IndependentMatchInvitation {
  invitedTeamId String? @map("invited_team_id")
  invitedTeam   Team?   @relation(fields: [invitedTeamId], references: [id], onDelete: Cascade)

  @@unique([matchId, invitedTeamId], map: "imi_match_team_uniq")
}
```

CHECK extended to 3 branches: exactly one of `{email, invited_user_id, invited_team_id}` non-null.

### Service layer

**Stage 1 — `IndependentMatchService` changes:**

| Method | Change |
|---|---|
| `createOpen(input)` | Accepts `visibility: 'PUBLIC' \| 'PRIVATE'`; defaults to `PUBLIC`. |
| `inviteByEmail(matchId, organizerId, email)` | Unchanged. |
| **NEW** `inviteUser(matchId, organizerId, invitedUserId)` | Validates organizer, slots, target is not self/participant/already-invited. Creates `IndependentMatchInvitation` with `invitedUserId`. Issues signed token, enqueues email if invitee has verified email, creates in-app notification. |
| `acceptInvitation(token, userId)` | Generalised: branches on `email vs invitedUserId`. For user invites, requires `userId === invitation.invitedUserId`. Race-safe slot count inside transaction. |
| **NEW** `joinPublicMatch(matchId, userId)` | Refuses non-public or full matches. Race-safe slot count + insert in transaction. Idempotent if user is already a participant. |
| `cancelInvitation(matchId, invitationId, organizerId)` | Existing implementation works for both email and user invitations. |
| `requestToJoin / approveJoinRequest / rejectJoinRequest` | DROP. |
| Challenge methods (`createChallenge / acceptChallenge / rejectChallenge`) | Unchanged this stage; will be removed in Stage 2. |

**Stage 2 — additional changes:**

| Method | Change |
|---|---|
| `createOpen(input)` | Accepts `hostTeamId?`. If set: validates membership, seeds 2 participants from the host team in the creation transaction, forces `maxPlayers = 4`. |
| **NEW** `inviteTeam(matchId, organizerId, invitedTeamId)` | Validates `slotsAvailable >= 2`, target team is not the host, target team has no pending invitation. |
| `acceptInvitation(token, userId)` | Detects team invites; if target is a team, requires `userId` is a member; fills 2 slots atomically with both team members. |
| Challenge methods | DROP. |

### Search

| Endpoint | Stage | Purpose |
|---|---|---|
| `GET /api/users/search?q=&matchId=` | 1 | Returns up to 10 candidates. Excludes caller, current participants, users already invited (pending), soft-deleted. Reuses the pattern of `/api/users/search?q=&teamId=` from Feature 1. |
| `GET /api/teams/search?q=&matchId=` | 2 | Returns up to 10 teams. Excludes the host team and teams already invited (pending). Returns `{id, name, logoUrl, memberCount}`. |

Auth: session required. The search route validates the caller is the match organizer (only organizers see the invite UI, and search is scoped by match).

### Frontend

**`/jugar/nuevo`:**
- Stage 1: add a `visibility` selector (PUBLIC / PRIVATE pills, default PUBLIC).
- Stage 2: add a `hostKind` selector (USER / TEAM); selecting TEAM forces `maxPlayers = 4` and shows a select of the user's teams. Disabled if user has zero teams.

**`/jugar` (tablón):**
- Stage 1: filter to `visibility = PUBLIC AND status = 'OPEN' AND slotsAvailable > 0`. Each card has a direct "Unirme" button driving `joinPublicMatch`. Private matches never appear.

**`/jugar/[id]`:**
- Stage 1:
  - Replace the existing free-text email input in the invite section with a `MatchUserPicker` typeahead (user-only).
  - Drop `JoinRequestsPanel` (no more approval).
  - Replace `JoinRequestButton` (request to join) with a direct "Unirme" button when match is public, has slot, and the viewer is neither organizer nor participant.
  - Cancel-invitation button keeps working.
- Stage 2:
  - Drop `ChallengePanel` (no more challenge accept/reject).
  - Generalise the picker to `MatchEntityPicker` mixing users and teams in the same dropdown, labelled with `👤` / `🏆` and member count for teams.

### Notifications + emails

| Event | Recipient | Type | Stage |
|---|---|---|---|
| You're invited to a match | Invited user | `INDEPENDENT_MATCH_INVITE` | 1 |
| Your team is invited | Each team member | `INDEPENDENT_MATCH_INVITE` | 2 |
| Someone joined your match | Organizer | `INDEPENDENT_MATCH_CONFIRMED` (existing) | 1 |
| Match filled up | All participants | `INDEPENDENT_MATCH_CONFIRMED` (existing) | 1 |
| Match closed before you accepted | Pending invitees who didn't act | `INDEPENDENT_MATCH_FULL` (NEW) | 1 |
| Organizer cancelled the match | Participants + pending invitees | `INDEPENDENT_MATCH_CANCELLED` (existing) | 1 |

`INDEPENDENT_MATCH_JOIN_REQUEST` is removed alongside `JoinRequest`.

Emails reuse the `pg-boss` queue, the `EmailService`, and the `ind-match-invite` template. The template grows three internal branches (email-only / registered user / team — Stage 2). Email is skipped if `RESEND_API_KEY` / `RESEND_FROM_EMAIL` are missing (consistent with current resilience).

### Race conditions

All slot-bound operations (`joinPublicMatch`, `acceptInvitation`, team accept) follow the same pattern:

```ts
await prisma.$transaction(async (tx) => {
  const count = await tx.independentMatchParticipant.count({
    where: { independentMatchId, status: 'ACCEPTED' },
  });
  if (count >= match.maxPlayers) throw new DomainError('MATCH_FULL', '…');
  if (count + slotsToAdd > match.maxPlayers) throw new DomainError('MATCH_FULL', '…');

  // ... insert participant(s)
  if (count + slotsToAdd >= match.maxPlayers) {
    await tx.independentMatch.update({
      where: { id: independentMatchId },
      data: { status: 'CONFIRMED' },
    });
  }
});
```

This ensures only the first transaction to commit wins when two users accept simultaneously for the last slot.

### Migration plan

**Stage 1 migrations:**

| Name | What it does |
|---|---|
| `enable_match_visibility` | `ALTER TABLE independent_matches ADD COLUMN visibility MatchVisibility DEFAULT 'PUBLIC' NOT NULL;` |
| `independent_match_invitations_polymorphic` | `email` becomes nullable; add `invited_user_id`; add FK + partial unique index; add CHECK constraint. |
| `drop_independent_match_join_requests` | Drop table + drop `JoinRequestStatus` enum. |

**Stage 2 migrations:**

| Name | What it does |
|---|---|
| `independent_match_invitations_team_branch` | Add `invited_team_id`; extend CHECK constraint to 3 branches; partial unique index. |
| `migrate_team_challenges_to_open` | For each existing `IndependentMatch` where `type = 'TEAM_CHALLENGE'`:<br>• `PENDING_APPROVAL` → set `type = 'OPEN'`, `visibility = 'PRIVATE'`, `host_team_id = organizer_team_id`; insert one `IndependentMatchInvitation` with `invited_team_id = challenged_team_id`, `expires_at = now() + 7 days`.<br>• `CONFIRMED` → set `type = 'OPEN'`, `visibility = 'PRIVATE'`, `host_team_id = organizer_team_id`; participants stay.<br>• `REJECTED` / `CANCELLED` → set `type = 'OPEN'`, `visibility = 'PRIVATE'`, `host_team_id = organizer_team_id`, `status = 'CANCELLED'`. |
| `independent_match_drop_legacy_columns` | Rename `organizer_team_id` → `host_team_id`. Drop `challenged_team_id`. Drop the `TEAM_CHALLENGE` value from `IndependentMatchType`, then drop the enum entirely once nothing references it. Drop `PENDING_APPROVAL` and `REJECTED` from `IndependentMatchStatus`. |

The pre-flight script (in code, not in the migration) prints counts of TEAM_CHALLENGE rows in each status and the total invitations created — a checkpoint for the Vercel deploy log.

## Privacy and security

- Search endpoints are scoped by `matchId`. The caller must be the match organizer; otherwise 403.
- Search response shape: only `{id, name, avatarUrl}` for users, `{id, name, logoUrl, memberCount}` for teams. No email, role, or other user attributes leaked.
- Rate limit: reuse `checkRateLimit` with key `match.users.search:user:<userId>` and `match.teams.search:user:<userId>`, both at 60 hits per 15-minute window.
- A signed token is issued for invitation links so accept can be reached without first visiting the app.

## Testing

### Unit
- `tests/unit/modules/independent-matches/` (extend existing folder):
  - `joinPublicMatch` — happy path, full match, private match, idempotent on existing participant, organizer is already in.
  - `inviteUser` (Stage 1) — happy path, self, existing participant, existing pending, full match.
  - `inviteTeam` (Stage 2) — happy path, less-than-2-slots, host team, already-invited team.
  - `acceptInvitation` — distinguishes email / user / team branches; race-safe through mocked transaction.

### Integration (`tests/integration/`)
- Rewrite `independent-matches.test.ts` for the new flow:
  - Drop tests on `requestToJoin / approve / reject`.
  - Drop TEAM_CHALLENGE-specific tests in Stage 2.
  - Add: two concurrent `joinPublicMatch` calls on the last slot — exactly one succeeds, the other gets `MATCH_FULL`.
  - Add: two concurrent `acceptInvitation` calls — only one wins.
  - Add (Stage 2): two members of the invited team accept concurrently — exactly one transaction commits, both end up as participants.
- New: `users-search-match.test.ts` and (Stage 2) `teams-search-match.test.ts` — exclusion logic, response shape, 401/403.

### Manual smoke after each stage
1. Stage 1 deploy — create public 2-player match, invite registered user, accept from another session, confirm full state.
2. Stage 1 deploy — create private match, confirm not in tablón, invite, accept.
3. Stage 2 deploy — create 4-player match as team, invite another team, accept from any team member, confirm 4 participants.
4. Stage 2 deploy — confirm migrated TEAM_CHALLENGE matches still render correctly in `/jugar` and `/jugar/[id]`.

## Risks and open issues

- **CHECK constraint on `IndependentMatchInvitation`**: Prisma doesn't generate it natively; migrations include a raw SQL `ALTER TABLE … ADD CONSTRAINT … CHECK (...)`. Care is needed if a future schema change adds another branch.
- **Email branch grows**: the `ind-match-invite` template gains complexity; we keep it as one file with conditional sections to avoid template drift.
- **Migration idempotency**: the data migration in Stage 2 is one-shot. If it fails halfway, restoring from backup is required. We add an idempotency guard: only convert rows where `type = 'TEAM_CHALLENGE'`.
- **First-to-accept emotional UX**: "Sorry, full" is dismissive. We soften with a follow-up notification suggesting other open matches in the tablón. Out of scope for this iteration but flagged.
- **Public matches get spammy**: with no approval gate, a malicious user could keep joining and leaving (when "leave" lands later). For now, "leave" is out of scope and joining is one-way; revisit when leave is added.
