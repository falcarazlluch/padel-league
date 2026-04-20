-- CreateEnum
CREATE TYPE "IndependentMatchType" AS ENUM ('OPEN', 'TEAM_CHALLENGE');

-- AlterTable: make scheduledAt nullable, add name/type/challengedTeamId/leagueId
ALTER TABLE "independent_matches"
  ALTER COLUMN "scheduled_at" DROP NOT NULL,
  ADD COLUMN "name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "type" "IndependentMatchType" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "challenged_team_id" TEXT,
  ADD COLUMN "league_id" TEXT;

-- Remove default from name (only needed for existing rows, future rows must provide it)
ALTER TABLE "independent_matches" ALTER COLUMN "name" DROP DEFAULT;

-- CreateTable: independent_match_invitations
CREATE TABLE "independent_match_invitations" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "independent_match_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "independent_match_invitations_match_id_idx" ON "independent_match_invitations"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "independent_match_invitations_match_id_email_key" ON "independent_match_invitations"("match_id", "email");

-- AddForeignKey: challenged_team_id -> teams
ALTER TABLE "independent_matches" ADD CONSTRAINT "independent_matches_challenged_team_id_fkey"
  FOREIGN KEY ("challenged_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: league_id -> leagues
ALTER TABLE "independent_matches" ADD CONSTRAINT "independent_matches_league_id_fkey"
  FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: match_id -> independent_matches
ALTER TABLE "independent_match_invitations" ADD CONSTRAINT "independent_match_invitations_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "independent_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
