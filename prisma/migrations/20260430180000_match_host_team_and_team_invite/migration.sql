ALTER TABLE "independent_matches" ADD COLUMN "host_team_id" TEXT;
ALTER TABLE "independent_matches"
  ADD CONSTRAINT "independent_matches_host_team_id_fkey"
  FOREIGN KEY ("host_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "independent_match_invitations" ADD COLUMN "invited_team_id" TEXT;
ALTER TABLE "independent_match_invitations"
  ADD CONSTRAINT "independent_match_invitations_invited_team_id_fkey"
  FOREIGN KEY ("invited_team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "imi_match_team_uniq"
  ON "independent_match_invitations"("match_id", "invited_team_id")
  WHERE "invited_team_id" IS NOT NULL;

ALTER TABLE "independent_match_invitations" DROP CONSTRAINT IF EXISTS "imi_one_target";
ALTER TABLE "independent_match_invitations"
  ADD CONSTRAINT "imi_one_target" CHECK (
    (CASE WHEN "email" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "invited_user_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "invited_team_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
