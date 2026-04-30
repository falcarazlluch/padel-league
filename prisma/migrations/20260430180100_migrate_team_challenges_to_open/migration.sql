-- 1) Backfill host_team_id from organizer_team_id for legacy TEAM_CHALLENGE rows.
UPDATE "independent_matches"
SET "host_team_id" = "organizer_team_id",
    "visibility" = 'PRIVATE'
WHERE "type" = 'TEAM_CHALLENGE'
  AND "host_team_id" IS NULL;

-- 2) For PENDING_APPROVAL challenges, create a team invitation pointing at the
--    challenged team so the invitee can still accept after migration.
--    NOTE: avoid ON CONFLICT here. The (match_id, invited_team_id) unique
--    index is partial (WHERE invited_team_id IS NOT NULL) and Postgres won't
--    infer a partial index from a bare conflict_target. NOT EXISTS keeps it
--    idempotent without depending on that quirk.
INSERT INTO "independent_match_invitations" (id, match_id, invited_team_id, expires_at, created_at)
SELECT
  'cmgr' || substring(md5(random()::text || im.id), 1, 21),
  im.id,
  im.challenged_team_id,
  now() + interval '7 days',
  now()
FROM "independent_matches" im
WHERE im."type" = 'TEAM_CHALLENGE'
  AND im."status" = 'PENDING_APPROVAL'
  AND im."challenged_team_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "independent_match_invitations" imi
    WHERE imi."match_id" = im."id"
      AND imi."invited_team_id" = im."challenged_team_id"
  );

-- 3) Map status: PENDING_APPROVAL -> OPEN; REJECTED -> CANCELLED.
UPDATE "independent_matches"
SET "status" = 'OPEN'
WHERE "type" = 'TEAM_CHALLENGE'
  AND "status" = 'PENDING_APPROVAL';

UPDATE "independent_matches"
SET "status" = 'CANCELLED'
WHERE "type" = 'TEAM_CHALLENGE'
  AND "status" = 'REJECTED';

-- 4) Switch the type. After this, no rows have type = 'TEAM_CHALLENGE'.
UPDATE "independent_matches"
SET "type" = 'OPEN'
WHERE "type" = 'TEAM_CHALLENGE';
