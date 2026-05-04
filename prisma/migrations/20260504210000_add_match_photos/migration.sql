-- New notification types for the photos feature.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_PHOTO_UPLOADED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_PHOTO_MENTION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_PHOTO_COMMENT';

-- Photos: a single table covers both league and independent matches via two
-- nullable foreign keys; exactly one is populated per row (enforced by the
-- application layer, not the DB — Postgres CHECK constraints with
-- subqueries aren't allowed).
CREATE TABLE "match_photos" (
  "id"                    TEXT PRIMARY KEY,
  "match_id"              TEXT,
  "independent_match_id"  TEXT,
  "uploaded_by_user_id"   TEXT NOT NULL,
  "blob_url"              TEXT NOT NULL,
  "width"                 INTEGER,
  "height"                INTEGER,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "match_photos_match_id_fkey"
    FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "match_photos_independent_match_id_fkey"
    FOREIGN KEY ("independent_match_id") REFERENCES "independent_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "match_photos_uploaded_by_user_id_fkey"
    FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "match_photos_one_match_only_chk"
    CHECK (
      ("match_id" IS NOT NULL AND "independent_match_id" IS NULL) OR
      ("match_id" IS NULL AND "independent_match_id" IS NOT NULL)
    )
);

CREATE INDEX "match_photos_match_id_created_at_idx" ON "match_photos" ("match_id", "created_at");
CREATE INDEX "match_photos_independent_match_id_created_at_idx" ON "match_photos" ("independent_match_id", "created_at");

CREATE TABLE "match_photo_comments" (
  "id"          TEXT PRIMARY KEY,
  "photo_id"    TEXT NOT NULL,
  "user_id"     TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "match_photo_comments_photo_id_fkey"
    FOREIGN KEY ("photo_id") REFERENCES "match_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "match_photo_comments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "match_photo_comments_photo_id_created_at_idx"
  ON "match_photo_comments" ("photo_id", "created_at");

CREATE TABLE "match_photo_likes" (
  "photo_id"    TEXT NOT NULL,
  "user_id"     TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY ("photo_id", "user_id"),

  CONSTRAINT "match_photo_likes_photo_id_fkey"
    FOREIGN KEY ("photo_id") REFERENCES "match_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "match_photo_likes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "match_photo_likes_photo_id_idx" ON "match_photo_likes" ("photo_id");
