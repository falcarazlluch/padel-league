# Team invitation typeahead — design

**Status:** approved (brainstorming closed 2026-04-30)
**Author:** PadelLeague
**Scope:** invitations to teams (not match invitations — see future Feature 4 spec)

## Goal

Replace the free-text "Email o nombre del jugador" input on the team detail page with a typeahead that searches existing users by name and never exposes their email. Hide email in the rest of the team flow for visual consistency with the new privacy bar.

## Non-goals

- Inviting users that aren't registered yet (no auto-registration via email link).
- Searching by email, by initials, by handle, or with fuzzy spelling tolerance.
- Searching with "online status" or "last seen" hints.
- Multi-invite (a team has 2 slots; one pending invitation at a time stays).
- Match invitations (`/jugar/[id]`) — covered by a separate spec.
- Admin user list (`/admin/usuarios`) — keeps showing emails because super-admin needs them.

## Approved decisions

| # | Question | Answer |
|---|---|---|
| 1 | How to disambiguate two users with the same name? | Show name + avatar / initials. If still ambiguous, accept the limitation. |
| 2 | Keep email-based invitation as fallback? | No. Replace entirely. Email never appears in the typeahead or its result rows. |
| 3 | Hide email everywhere in the team flow? | Yes (option B). Keep visible only in own profile, admin pages and auth forms. |
| 4 | Search behaviour | Min 2 chars; 250 ms debounce; max 10 results; forced selection; case- and accent-insensitive; exclude self / current members / pending invitees. |
| 5 | Implementation approach | Custom typeahead client component + API route returning JSON. No new dependencies. |

## Architecture

### New files

| Path | Purpose |
|---|---|
| `src/app/api/users/search/route.ts` | `GET ?q=&teamId=` — returns up to 10 user candidates as `[{ id, name, avatarUrl }]`. Auth required, caller must be member of `teamId`. Server-side filters: excludes caller, current members, users with a pending invitation in that team, soft-deleted users (`deletedAt != null`). |
| `src/app/(app)/equipos/[id]/_components/user-search-picker.tsx` | Reusable client component. Wraps `<input>` + dropdown + keyboard nav + a hidden field `invitedUserId`. Self-contained, no external deps. |

### Modified files

| Path | Change |
|---|---|
| `src/app/(app)/equipos/[id]/invite-form.tsx` | Replace plain text input with `<UserSearchPicker teamId={teamId} />`. Submit posts `invitedUserId`. |
| `src/app/(app)/equipos/actions.ts` | `inviteToTeamAction` validates `invitedUserId` (CUID) instead of `invitedUserIdentifier`. |
| `src/modules/teams/application/team-service.ts` | `invite(...)` accepts `invitedUserId: string`. Drops the `resolveUserByIdentifier` helper. |
| `src/app/(app)/equipos/[id]/page.tsx` | Remove the email `<span>` next to each member (≈ line 79) and next to each pending invitation (≈ line 92). |

### Deleted

- `resolveUserByIdentifier` helper in `team-service.ts` (no consumer left).
- The branch in `inviteSchema` that accepted email as identifier.

### Database migration

- `prisma/migrations/<timestamp>_enable_unaccent_extension/migration.sql` containing `CREATE EXTENSION IF NOT EXISTS unaccent;`. Idempotent. Already a precedent in the repo with `citext`.

## Data flow

1. User opens `/equipos/[id]` as a member. Page server-renders without emails.
2. User types in the typeahead input. After 2 characters, debounced 250 ms.
3. Client requests `GET /api/users/search?q=jua&teamId=abc`.
4. Endpoint:
   - Validates session → 401.
   - Validates the caller is a member of `teamId` → 403.
   - Queries `User` with: name matches `q` (case- and accent-insensitive), not the caller, not already a member, no pending invitation in this team, `deletedAt = null`.
   - Returns up to 10 rows of `{ id, name, avatarUrl }`.
5. Client renders dropdown. User picks via ↓/↑/Enter or click.
6. Hidden field `invitedUserId` populated. Submit button enables.
7. On submit, `inviteToTeamAction` → `TeamService.invite({ teamId, invitedByUserId, invitedUserId })`.
8. Service creates `TeamInvitation` + in-app notification, then `revalidatePath('/equipos/${teamId}')`.
9. Form clears; page re-renders showing the new pending invitation.

## Privacy and security

| Concern | Mitigation |
|---|---|
| Enumeration of full user base | Endpoint scoped to teams the caller is a member of. The unauthenticated and out-of-team cases are 401/403. |
| Email leakage | Endpoint response body has no `email`, `role` or `createdAt`. Only `id`, `name`, `avatarUrl`. |
| Input abuse | `q` capped at 60 chars, `teamId` must be CUID. Zod-validated. |
| Scraping via debounce bypass | Use the existing `checkRateLimit` helper from `src/shared/auth/rate-limit.ts` with key `users.search:user:<userId>`; cap at 60 hits per 15-minute window. |
| Search by deleted user | Filter `deletedAt = null` server-side. |
| Logging sensitive info | Don't log results. Log only on failure with `userId`, `q`, `error`. |

## UI behaviour

### Component states

- **Empty** (input < 2 chars): dropdown closed.
- **Loading**: dropdown shows "Buscando…".
- **With results**: list of rows = avatar + name. Hover and keyboard-highlighted rows have a different background.
- **No results**: dropdown shows "Sin resultados. Comprueba el nombre."
- **Selected**: input becomes a "chip" with avatar + name + small "✕" to clear. Hidden `invitedUserId` populated.
- **Network error**: small red note under the input "No se pudo cargar la búsqueda". Component remains usable.

### Keyboard

- ↓ / ↑ navigate.
- Enter selects highlighted row (or first row if none highlighted).
- Esc closes without selecting.
- Tab moves focus forward.

### Accessibility

- `<input role="combobox" aria-expanded aria-controls=...>`.
- `<li role="option" aria-selected>` per row.
- `aria-live="polite"` region announcing "N resultados" / "Sin resultados".
- Click outside closes the dropdown.

### Submit

- Button disabled until selection exists.
- Success: chip clears, "Invitación enviada" green note for 3 s.
- Error (server-side validation failed, ie. someone joined in between): red note under form; chip preserved.

## Email visibility removal

| File | Change |
|---|---|
| `src/app/(app)/equipos/[id]/page.tsx` | Drop email span next to each member and each pending invitee. |
| `src/app/(app)/equipos/page.tsx` | Run `grep -n email` over the file and remove any `.email` rendered to the page. Today the cards don't render email, so this is expected to be a no-op confirmation. |
| `src/app/(app)/dashboard/**` | Same audit. Today rankings don't render email either; if any sneaks in, remove it in the same change. |
| `src/app/(app)/perfil/...` | Keep — own profile. |
| `src/app/(app)/admin/...` | Keep — super-admin tooling. |

## Testing

### Unit

- `tests/unit/modules/teams/team-service.test.ts` (new file or extension):
  - `invite` with valid `invitedUserId` succeeds.
  - rejects self-invite.
  - rejects when invitee is already a member.
  - rejects when there's already a pending invitation for that user in that team.
  - rejects when team is full.
  - rejects when team doesn't exist.

### Integration

- `tests/integration/users-search.test.ts` (new file):
  - 401 without session.
  - 403 when caller isn't a member of `teamId`.
  - Returns only valid candidates (excludes self, members, pending invitees, anonymised).
  - Case- and accent-insensitive ("jose" finds "José", "marin" finds "Marín").
  - Caps at 10 results.
  - Response shape contains only `id`, `name`, `avatarUrl`.

- End-to-end smoke (manual or via Playwright if present): create team → search candidate → invite → see pending invitation → cancel.

## Risks and open issues

- **Postgres `unaccent` extension** has to be installed by the DBA. The migration uses `IF NOT EXISTS` so it's safe; on Vercel Postgres / Supabase the extension is usually available.
- **No data migration needed for existing invitations.** `TeamInvitation` always stores `invitedUserId` as a foreign key — the email-or-name input was resolved to a user id before persisting. The current pending invitations carry over without any change.
- **i18n of accent-insensitive search**: the current solution covers Spanish (latin diacritics). If non-latin characters appear in user names, `unaccent` may not normalise them as expected. Out of scope for this iteration.
