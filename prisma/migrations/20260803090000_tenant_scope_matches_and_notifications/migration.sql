-- Extends the whitelabel isolation boundary to the two aggregates that were
-- still platform-wide: pick-up matches ("partidos sueltos") and notifications.
--
-- Same convention as `leagues.organization_id` / `teams.organization_id`:
--   NULL  = the public platform (mypadelleague.es)
--   <id>  = that tenant, and only that tenant, ever sees the row.
--
-- Additive and backfill-free: every existing row stays NULL, i.e. keeps
-- belonging to the public platform, which is where it was created.
--
-- Notifications get their own column rather than deriving the tenant from
-- `metadata->>'leagueId'` at read time. The unread *badge* is a COUNT over
-- potentially thousands of rows: resolving each one through a JSON lookup and a
-- join would make the cheapest query in the app one of the most expensive.

ALTER TABLE "independent_matches" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "notifications"       ADD COLUMN "organization_id" TEXT;

CREATE INDEX "independent_matches_organization_id_status_idx"
  ON "independent_matches"("organization_id", "status");

-- Mirrors the existing (user_id, read_at, created_at) index with the tenant
-- prefix, so both the unread count and the unread list stay index-only per
-- tenant instead of scanning a user's whole notification history.
CREATE INDEX "notifications_organization_id_user_id_read_at_idx"
  ON "notifications"("organization_id", "user_id", "read_at");

ALTER TABLE "independent_matches"
  ADD CONSTRAINT "independent_matches_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
