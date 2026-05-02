# User category + league registration-open notification — design

**Status:** approved (brainstorming closed 2026-04-30)
**Author:** PadelLeague
**Scope:** Add a `User.category` (padel level) field, sync it from team category-change proposals, and notify users when a league of their level opens registration.

## Goal

Give every user a "padel level" (Principiante / Intermedio / Avanzado) tracked on their profile. When an existing team's category changes through the established proposal flow, propagate the new level to its members. When a league enters its registration period, notify in-app every user whose level matches.

## Non-goals

- Email notifications (in-app only — explicit user requirement).
- Mute / preferences per user.
- Re-notify if the league's `registrationStart` is edited after the first notification.
- Show another user's level publicly (badge on their avatar / tile).
- Reverse sync (user changes their level → does NOT update their teams).
- Sync at team join/leave (only the formal "team category change accepted" event triggers sync).
- Notify admins to a different cadence — admins receive notifications like everyone else if their level matches the league's.

## Approved decisions

| # | Question | Answer |
|---|---|---|
| 1 | Source of truth for `User.category` | Independent column with push-sync from team. Editable in `/perfil`. Last write wins for users in multiple teams. |
| 2 | Initial value for existing users | All set to `INTERMEDIATE` on migration. Users adjust manually if they want. |
| 3 | When to fire the registration-open notification | Daily cron over leagues with `registrationStart <= now() AND registrationOpenNotifiedAt IS NULL`. |
| 3.i | Existing leagues already in registration at deploy time | Marked as already notified during the same migration (`UPDATE ... SET registration_open_notified_at = now() WHERE registration_start <= now()`). No retroactive spam. |
| 4 | Who receives the notification | All users where `category = league.category AND deletedAt IS NULL`. No exclusion of admins. |

## Architecture

### Data model

**`prisma/schema.prisma` changes:**

```prisma
model User {
  // existing fields …
  category TeamCategory @default(INTERMEDIATE) @map("category")
}

model League {
  // existing fields …
  registrationOpenNotifiedAt DateTime? @map("registration_open_notified_at")
}

enum NotificationType {
  // existing values …
  LEAGUE_REGISTRATION_OPEN
}
```

The existing `TeamCategory` enum (`BEGINNER | INTERMEDIATE | ADVANCED`) is reused for `User.category`. Renaming it to a more neutral name like `PadelCategory` would require a Postgres recreate-and-cast and adds no value.

### Migrations (3)

1. **`add_user_category`** — adds the column with default INTERMEDIATE. Existing rows pick up the default.
2. **`add_league_registration_open_notified_at`** — adds the column (nullable) and includes a one-shot DML:

   ```sql
   ALTER TABLE "leagues" ADD COLUMN "registration_open_notified_at" TIMESTAMP;

   -- Mark already-open leagues as notified to suppress retroactive spam.
   UPDATE "leagues"
     SET "registration_open_notified_at" = NOW()
     WHERE "registration_start" <= NOW();
   ```

3. **`add_league_registration_open_notification_type`** — `ALTER TYPE "NotificationType" ADD VALUE 'LEAGUE_REGISTRATION_OPEN';`. Postgres restriction: cannot run `ADD VALUE` inside a transaction in older versions; Prisma handles this for migrations.

### Service layer

#### Sync hook in `CategoryProposalService._resolve`

File: `src/modules/leagues/application/category-proposal-service.ts`. Inside the existing `tx.team.update(...)` for the `ACCEPTED` decision, append a `tx.user.updateMany(...)` over the team's members with the same target category.

Pseudocode (real code in the plan):

```ts
if (decision === 'ACCEPTED') {
  await tx.team.update({ where: { id: proposal.teamId }, data: { category: proposal.toCategory } });
  const memberIds = proposal.team.members.map((m) => m.userId);
  await tx.user.updateMany({
    where: { id: { in: memberIds } },
    data: { category: proposal.toCategory },
  });
}
```

This is the **only** sync hook. Joining/leaving a team does not modify `User.category`.

#### New `LeagueNotificationService.notifyRegistrationOpen`

File: `src/modules/leagues/application/league-notification-service.ts` (new).

```ts
async notifyRegistrationOpen(leagueId: string): Promise<{ recipients: number }> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, name: true, slug: true, category: true, registrationOpenNotifiedAt: true },
  });
  if (!league || league.registrationOpenNotifiedAt !== null) return { recipients: 0 };

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
}
```

Race-safe and idempotent through the `registrationOpenNotifiedAt` guard.

### Cron

Extend `src/app/api/cron/heartbeat/route.ts`. After the existing heartbeat work, append:

```ts
const dueLeagues = await prisma.league.findMany({
  where: {
    registrationStart: { lte: new Date() },
    registrationOpenNotifiedAt: null,
  },
  select: { id: true },
});

for (const l of dueLeagues) {
  await LeagueNotificationService.notifyRegistrationOpen(l.id);
}
```

The schedule for `/api/cron/heartbeat` is configured via the Vercel dashboard (no `vercel.json` in the repo). The new logic piggybacks on whatever cadence is already set; no code change needed for scheduling. The notification gate (`registrationOpenNotifiedAt`) makes the logic safe even if the cron runs multiple times per day.

### Frontend

`/perfil/page.tsx` and `/perfil/actions.ts`:

- Add a `<select name="category">` to the existing "Datos personales" form, populated from `CATEGORY_VALUES` and `CATEGORY_LABEL`. `defaultValue={user.category}`.
- Extend `updateProfileAction` to read `formData.get('category')`, validate via Zod against `z.enum(CATEGORY_VALUES)`, and persist it alongside the name.
- Page server component fetches `category` from prisma (already has the user's record).
- Helper text under the select: "Recibirás notificaciones de ligas de tu nivel."

## Notifications

The new `INDEPENDENT_MATCH` and other notification types coexist; only `LEAGUE_REGISTRATION_OPEN` is added. Existing widget at `notifications-badge.tsx` consumes `/api/notifications/unread` which doesn't filter by type, so the new ones surface automatically.

## Privacy and security

- `User.category` is private. Not exposed in any user-facing search response (`/api/users/search` returns `{ id, name, avatarUrl }` only — no change).
- Notifications target only the user matching the league's level — no cross-talk.
- Admin pages (`/admin/usuarios/...`) optionally surface `category` in their detail view (out of scope for this iteration).

## Testing

### Unit (`tests/unit/`)

- `tests/unit/modules/leagues/league-notification-service.test.ts` (new):
  - Filters recipients by league category.
  - Idempotent: second invocation returns 0 recipients.
  - Excludes soft-deleted users (`deletedAt != null`).
  - Marks `registrationOpenNotifiedAt` even when recipients is empty.

- Extend or create `tests/unit/modules/leagues/category-proposal-service.test.ts`:
  - Accepting a proposal updates `User.category` for all team members.
  - Rejecting a proposal does NOT touch users.

### Integration (`tests/integration/`)

- `tests/integration/league-registration-open-notification.test.ts` (new):
  - Set up 5 users across different categories, one soft-deleted.
  - Create a league of `INTERMEDIATE` with `registrationStart = now()`.
  - Call `LeagueNotificationService.notifyRegistrationOpen`.
  - Assert: only the alive `INTERMEDIATE` users got a `LEAGUE_REGISTRATION_OPEN` notification.
  - Assert: `League.registrationOpenNotifiedAt` is set.
  - Second call: no new notifications.

## Risks and open issues

- **Multi-team conflicts**: a user in two teams of different levels has their `User.category` overwritten by the most recent accepted proposal. Documented and accepted.
- **Time zone**: cron schedule and "today" boundaries use UTC; for league registration open dates set "today" in Madrid, the notification arrives the same day. Edge case: a league with `registrationStart` set to midnight UTC on day X may notify on day X-1 in Madrid. Acceptable — the next-day cron picks up anything missed.
- **Enum value addition**: `ADD VALUE` to a Postgres enum cannot run inside a transaction in some older Postgres versions. Prisma's `migrate deploy` handles this; if Vercel's Postgres flavour balks, the migration needs `-- prisma-no-transaction` or similar marker (handled at implementation time).
- **Cron cadence**: the existing `/api/cron/heartbeat` cadence (configured via Vercel dashboard) is reused. If it runs multiple times per day the gate (`registrationOpenNotifiedAt`) keeps the notification idempotent.
