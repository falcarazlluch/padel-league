-- Manual bracket seeding for TOURNAMENT: stores the admin-defined seeding
-- order on each registration (0 = top seed). NULL means "not assigned"; the
-- activation falls back to registration order when MANUAL but unset.
ALTER TABLE "league_registrations" ADD COLUMN "seed_order" INTEGER;

CREATE INDEX "league_registrations_league_id_seed_order_idx"
  ON "league_registrations" ("league_id", "seed_order");
