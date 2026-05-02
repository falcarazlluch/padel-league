-- AlterTable: add User.category with default INTERMEDIATE
ALTER TABLE "users" ADD COLUMN "category" "TeamCategory" NOT NULL DEFAULT 'INTERMEDIATE';

-- AlterTable: add League.registrationOpenNotifiedAt (nullable)
ALTER TABLE "leagues" ADD COLUMN "registration_open_notified_at" TIMESTAMP(3);

-- Backfill: existing leagues whose registration is already open get marked
-- as notified, so the upcoming cron does NOT send retroactive notifications.
UPDATE "leagues"
   SET "registration_open_notified_at" = NOW()
 WHERE "registration_start" <= NOW();
