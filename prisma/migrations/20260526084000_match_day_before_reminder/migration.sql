-- Marker column used by the day-before reminder cron sweep to avoid
-- double-notifying when the heartbeat fires more than once inside the
-- 24h window.
ALTER TABLE "matches"
  ADD COLUMN "day_before_reminder_sent_at" TIMESTAMP(3);
