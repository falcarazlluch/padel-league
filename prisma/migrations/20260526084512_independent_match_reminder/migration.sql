-- Same dedupe marker as the league/tournament Match table, applied to
-- IndependentMatch so the day-before reminder cron can also notify
-- participants of one-off matches.
ALTER TABLE "independent_matches"
  ADD COLUMN "day_before_reminder_sent_at" TIMESTAMP(3);
