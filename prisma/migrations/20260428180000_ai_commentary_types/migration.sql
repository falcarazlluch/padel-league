-- CreateEnum
CREATE TYPE "CommentaryType" AS ENUM ('PREVIEW', 'RECAP');

-- AlterTable: drop unique on match_id, add new columns, then add composite unique
-- Table is empty (feature never implemented), no data backfill needed.
ALTER TABLE "match_commentaries" DROP CONSTRAINT IF EXISTS "match_commentaries_match_id_key";

ALTER TABLE "match_commentaries"
  ADD COLUMN "type" "CommentaryType" NOT NULL DEFAULT 'RECAP',
  ADD COLUMN "edited_at" TIMESTAMP(3),
  ADD COLUMN "edited_by_user_id" TEXT;

-- Drop default after the ADD (table empty so default never used; future inserts must provide type)
ALTER TABLE "match_commentaries" ALTER COLUMN "type" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "match_commentaries_match_id_idx" ON "match_commentaries"("match_id");

-- AddUniqueConstraint
ALTER TABLE "match_commentaries"
  ADD CONSTRAINT "match_commentaries_match_id_type_key" UNIQUE ("match_id", "type");

-- AddForeignKey: edited_by_user_id -> users
ALTER TABLE "match_commentaries" ADD CONSTRAINT "match_commentaries_edited_by_user_id_fkey"
  FOREIGN KEY ("edited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
