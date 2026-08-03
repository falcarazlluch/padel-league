-- An invite link can now belong to the ORGANIZATION rather than to one
-- competition: `league_id` becomes nullable.
--
--   league_id NOT NULL -> link to that competition (enrol straight into it)
--   league_id NULL     -> link to the organization (join it, then pick from
--                         whichever of its competitions are open)
--
-- The organization link is the one an admin hands out once and reuses all
-- season; the per-competition link stays for "apúntate a este torneo".
--
-- Widening a column from NOT NULL to NULL rewrites no rows and never fails, so
-- this is safe to run against a live table.

ALTER TABLE "tournament_invite_links" ALTER COLUMN "league_id" DROP NOT NULL;

-- Listing an organization's links (the admin panel) previously had no useful
-- index because every query started from league_id.
CREATE INDEX "tournament_invite_links_organization_id_revoked_at_idx"
  ON "tournament_invite_links"("organization_id", "revoked_at");
