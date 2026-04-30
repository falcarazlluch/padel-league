ALTER TABLE "independent_matches" DROP CONSTRAINT IF EXISTS "independent_matches_organizer_team_id_fkey";
ALTER TABLE "independent_matches" DROP CONSTRAINT IF EXISTS "independent_matches_challenged_team_id_fkey";

ALTER TABLE "independent_matches" DROP COLUMN "organizer_team_id";
ALTER TABLE "independent_matches" DROP COLUMN "challenged_team_id";
ALTER TABLE "independent_matches" DROP COLUMN "type";

DROP TYPE "IndependentMatchType";
