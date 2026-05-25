-- Competitions v2 sub-phase 4: relax team-column constraints so Americana
-- ROTATING_INDIVIDUAL (no fixed teams) can register users and create matches
-- without a Team. Application code validates the per-competition-type invariants.

ALTER TABLE "matches"
  ALTER COLUMN "team_a_id" DROP NOT NULL,
  ALTER COLUMN "team_b_id" DROP NOT NULL;

ALTER TABLE "league_registrations"
  ALTER COLUMN "team_id" DROP NOT NULL;
