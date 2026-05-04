-- Snapshot the submitter's team at submission time so canValidate / confirm
-- logic doesn't depend on the live roster and cannot deadlock when the
-- submitter leaves their team.
ALTER TABLE "match_results"
  ADD COLUMN "submitter_team_id" TEXT;

-- Backfill: derive the side from the submitter's CURRENT team membership
-- against this match's teamA/teamB. Best-effort — if the submitter has
-- since left both teams, the column stays NULL and the app code falls
-- back to its in-memory derivation. Only PENDING rows are critical
-- (validation hasn't fired yet); historical rows are mostly cosmetic.
UPDATE "match_results" mr
SET "submitter_team_id" = m."team_a_id"
FROM "matches" m
WHERE mr."match_id" = m."id"
  AND EXISTS (
    SELECT 1 FROM "team_members" tm
    WHERE tm."team_id" = m."team_a_id"
      AND tm."user_id" = mr."submitted_by_user_id"
  );

UPDATE "match_results" mr
SET "submitter_team_id" = m."team_b_id"
FROM "matches" m
WHERE mr."match_id" = m."id"
  AND mr."submitter_team_id" IS NULL
  AND EXISTS (
    SELECT 1 FROM "team_members" tm
    WHERE tm."team_id" = m."team_b_id"
      AND tm."user_id" = mr."submitted_by_user_id"
  );

-- Foreign key: SET NULL on team delete is safe because resolveSubmitterSide()
-- already falls back to the live-roster derivation when the snapshot is null.
-- This prevents a dangling team-id reference if a team is ever hard-deleted
-- while a result row still points at it.
ALTER TABLE "match_results"
  ADD CONSTRAINT "match_results_submitter_team_id_fkey"
  FOREIGN KEY ("submitter_team_id") REFERENCES "teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
