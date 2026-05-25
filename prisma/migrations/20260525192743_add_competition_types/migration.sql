-- Competitions v2: introduces CompetitionType discriminator on League and the
-- ancillary tables/columns needed for AMERICANA and TOURNAMENT formats. This
-- migration is purely additive — every existing row keeps working as a LEAGUE.

-- ─── Enums ──────────────────────────────────────────────────────────────
CREATE TYPE "CompetitionType" AS ENUM ('LEAGUE', 'AMERICANA', 'TOURNAMENT');
CREATE TYPE "AmericanaVariant" AS ENUM ('ROTATING_INDIVIDUAL', 'FIXED_PAIRS');
CREATE TYPE "AmericanaRoundFormat" AS ENUM ('FIRST_TO_GAMES', 'BY_TIME');
CREATE TYPE "BracketSide" AS ENUM ('GOLD', 'SILVER');
CREATE TYPE "BracketSeeding" AS ENUM ('AUTO', 'MANUAL');

-- ─── League: discriminator + per-type config columns ───────────────────
ALTER TABLE "leagues"
  ADD COLUMN "type" "CompetitionType" NOT NULL DEFAULT 'LEAGUE',
  ADD COLUMN "americana_variant" "AmericanaVariant",
  ADD COLUMN "americana_round_format" "AmericanaRoundFormat",
  ADD COLUMN "americana_target_games" INTEGER,
  ADD COLUMN "americana_round_minutes" INTEGER,
  ADD COLUMN "americana_courts" INTEGER,
  ADD COLUMN "has_group_phase" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "group_count" INTEGER,
  ADD COLUMN "teams_per_group" INTEGER,
  ADD COLUMN "qualifiers_per_group" INTEGER,
  ADD COLUMN "bracket_seeding_mode" "BracketSeeding";

-- Defensive backfill: the column default already sets new rows to LEAGUE, but
-- run an explicit UPDATE so any future column change does not leave nulls in
-- old rows. No-op for fresh databases.
UPDATE "leagues" SET "type" = 'LEAGUE' WHERE "type" IS NULL;

CREATE INDEX "leagues_type_status_idx" ON "leagues" ("type", "status");

-- ─── CompetitionGroup ──────────────────────────────────────────────────
CREATE TABLE "competition_groups" (
  "id"         TEXT NOT NULL,
  "league_id"  TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "index"      INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competition_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "competition_groups_league_id_index_key"
  ON "competition_groups" ("league_id", "index");

CREATE INDEX "competition_groups_league_id_idx"
  ON "competition_groups" ("league_id");

ALTER TABLE "competition_groups"
  ADD CONSTRAINT "competition_groups_league_id_fkey"
  FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── LeagueRegistration: optional user-level + per-group assignment ────
-- team_id stays NOT NULL (deferred to sub-phase 4 when Americana actually
-- uses it). Only adding userId and competitionGroupId as nullable columns.
ALTER TABLE "league_registrations"
  ADD COLUMN "user_id" TEXT,
  ADD COLUMN "competition_group_id" TEXT;

CREATE UNIQUE INDEX "league_registrations_league_id_user_id_key"
  ON "league_registrations" ("league_id", "user_id");

CREATE INDEX "league_registrations_user_id_idx"
  ON "league_registrations" ("user_id");

CREATE INDEX "league_registrations_competition_group_id_idx"
  ON "league_registrations" ("competition_group_id");

ALTER TABLE "league_registrations"
  ADD CONSTRAINT "league_registrations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "league_registrations"
  ADD CONSTRAINT "league_registrations_competition_group_id_fkey"
  FOREIGN KEY ("competition_group_id") REFERENCES "competition_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Match: per-format fields (all nullable, no breaking change) ───────
ALTER TABLE "matches"
  ADD COLUMN "americana_round"      INTEGER,
  ADD COLUMN "americana_court"      INTEGER,
  ADD COLUMN "competition_group_id" TEXT,
  ADD COLUMN "bracket_side"         "BracketSide",
  ADD COLUMN "bracket_round"        INTEGER,
  ADD COLUMN "bracket_position"     INTEGER,
  ADD COLUMN "source_match_a_id"    TEXT,
  ADD COLUMN "source_match_b_id"    TEXT;

CREATE INDEX "matches_competition_group_id_idx"
  ON "matches" ("competition_group_id");

CREATE INDEX "matches_league_id_bracket_side_bracket_round_idx"
  ON "matches" ("league_id", "bracket_side", "bracket_round");

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_competition_group_id_fkey"
  FOREIGN KEY ("competition_group_id") REFERENCES "competition_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_source_match_a_id_fkey"
  FOREIGN KEY ("source_match_a_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_source_match_b_id_fkey"
  FOREIGN KEY ("source_match_b_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── MatchParticipant ─────────────────────────────────────────────────
CREATE TABLE "match_participants" (
  "match_id"      TEXT NOT NULL,
  "user_id"       TEXT NOT NULL,
  "side"          TEXT NOT NULL,
  "partner_index" INTEGER NOT NULL,
  CONSTRAINT "match_participants_pkey" PRIMARY KEY ("match_id", "user_id")
);

CREATE UNIQUE INDEX "match_participants_match_id_side_partner_index_key"
  ON "match_participants" ("match_id", "side", "partner_index");

CREATE INDEX "match_participants_user_id_idx"
  ON "match_participants" ("user_id");

ALTER TABLE "match_participants"
  ADD CONSTRAINT "match_participants_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "match_participants"
  ADD CONSTRAINT "match_participants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
