-- Independent teams + LeagueRegistration + TeamInvitation + league registration period.
-- Per design doc 2026-04-29: existing league/team data is wiped (no migration of old rows).

-- ─── Wipe existing league/team data ────────────────────────────────────────
-- Notifications, audit logs, signed tokens and users are preserved.
TRUNCATE TABLE
  "leagues",
  "teams"
CASCADE;

-- ─── New enum: TeamInvitationStatus ─────────────────────────────────────────
CREATE TYPE "TeamInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- ─── NotificationType: 5 new values ─────────────────────────────────────────
ALTER TYPE "NotificationType" ADD VALUE 'TEAM_INVITATION';
ALTER TYPE "NotificationType" ADD VALUE 'TEAM_INVITATION_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'TEAM_INVITATION_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'LEAGUE_REGISTRATION_ADDED';
ALTER TYPE "NotificationType" ADD VALUE 'LEAGUE_REGISTRATION_REMOVED';

-- ─── League: registration period ────────────────────────────────────────────
ALTER TABLE "leagues"
  ADD COLUMN "registration_start" TIMESTAMP(3) NOT NULL,
  ADD COLUMN "registration_end"   TIMESTAMP(3) NOT NULL;

-- ─── Team: drop leagueId, add createdByUserId ───────────────────────────────
-- Drop the FK + unique that depend on league_id first.
ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_league_id_fkey";
ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_league_id_name_key";
DROP INDEX IF EXISTS "teams_league_id_name_key";
ALTER TABLE "teams" DROP COLUMN "league_id";

-- created_by_user_id is required: since teams was just truncated, no rows to backfill.
ALTER TABLE "teams"
  ADD COLUMN "created_by_user_id" TEXT NOT NULL;

ALTER TABLE "teams"
  ADD CONSTRAINT "teams_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "teams"
  ADD CONSTRAINT "teams_created_by_user_id_name_key"
  UNIQUE ("created_by_user_id", "name");

-- ─── New table: team_invitations ────────────────────────────────────────────
CREATE TABLE "team_invitations" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "invited_user_id" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "status" "TeamInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "team_invitations_invited_user_id_status_idx"
  ON "team_invitations"("invited_user_id", "status");

CREATE INDEX "team_invitations_team_id_status_idx"
  ON "team_invitations"("team_id", "status");

ALTER TABLE "team_invitations"
  ADD CONSTRAINT "team_invitations_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_invitations"
  ADD CONSTRAINT "team_invitations_invited_user_id_fkey"
  FOREIGN KEY ("invited_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_invitations"
  ADD CONSTRAINT "team_invitations_invited_by_user_id_fkey"
  FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── New table: league_registrations ────────────────────────────────────────
CREATE TABLE "league_registrations" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "registered_by_user_id" TEXT NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_user_id" TEXT,

    CONSTRAINT "league_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "league_registrations_league_id_team_id_key"
  ON "league_registrations"("league_id", "team_id");

CREATE INDEX "league_registrations_league_id_idx"
  ON "league_registrations"("league_id");

CREATE INDEX "league_registrations_team_id_idx"
  ON "league_registrations"("team_id");

ALTER TABLE "league_registrations"
  ADD CONSTRAINT "league_registrations_league_id_fkey"
  FOREIGN KEY ("league_id") REFERENCES "leagues"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "league_registrations"
  ADD CONSTRAINT "league_registrations_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "league_registrations"
  ADD CONSTRAINT "league_registrations_registered_by_user_id_fkey"
  FOREIGN KEY ("registered_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "league_registrations"
  ADD CONSTRAINT "league_registrations_withdrawn_by_user_id_fkey"
  FOREIGN KEY ("withdrawn_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
