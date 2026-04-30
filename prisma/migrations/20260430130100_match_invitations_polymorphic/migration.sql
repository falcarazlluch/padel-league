-- DropIndex on the old (matchId, email) unique constraint.
-- The original unique index name is likely "independent_match_invitations_match_id_email_key".
ALTER TABLE "independent_match_invitations" DROP CONSTRAINT IF EXISTS "independent_match_invitations_match_id_email_key";
DROP INDEX IF EXISTS "independent_match_invitations_match_id_email_key";

-- AlterTable
ALTER TABLE "independent_match_invitations"
  ALTER COLUMN "email" DROP NOT NULL,
  ADD COLUMN "invited_user_id" TEXT;

-- AddForeignKey
ALTER TABLE "independent_match_invitations"
  ADD CONSTRAINT "independent_match_invitations_invited_user_id_fkey"
  FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (partial unique indexes)
CREATE UNIQUE INDEX "imi_match_email_uniq" ON "independent_match_invitations"("match_id", "email") WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX "imi_match_user_uniq" ON "independent_match_invitations"("match_id", "invited_user_id") WHERE "invited_user_id" IS NOT NULL;

-- Polymorphic guard: exactly one of {email, invited_user_id} is non-null.
ALTER TABLE "independent_match_invitations"
  ADD CONSTRAINT "imi_one_target" CHECK (
    (CASE WHEN "email" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "invited_user_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
