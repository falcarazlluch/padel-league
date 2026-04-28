-- Add organizer_team_id to independent_matches
ALTER TABLE "independent_matches"
  ADD COLUMN "organizer_team_id" TEXT;

-- AddForeignKey: organizer_team_id -> teams
ALTER TABLE "independent_matches" ADD CONSTRAINT "independent_matches_organizer_team_id_fkey"
  FOREIGN KEY ("organizer_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
