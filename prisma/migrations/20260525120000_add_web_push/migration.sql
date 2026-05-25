-- Web Push: outbox marker on notifications + per-device subscriptions + per-user channel preferences.

-- 1. Outbox marker on existing notifications table.
ALTER TABLE "notifications"
  ADD COLUMN "push_dispatched_at" TIMESTAMP(3);

-- Partial index would be ideal (WHERE push_dispatched_at IS NULL) but Prisma
-- does not declare partial indexes in this codebase; full index is fine and
-- the outbox sweep filters by createdAt window anyway.
CREATE INDEX "notifications_push_dispatched_at_created_at_idx"
  ON "notifications" ("push_dispatched_at", "created_at");

-- 2. Push subscriptions (per device).
CREATE TABLE "push_subscriptions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error_at" TIMESTAMP(3),
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key"
  ON "push_subscriptions" ("endpoint");

CREATE INDEX "push_subscriptions_user_id_idx"
  ON "push_subscriptions" ("user_id");

ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Notification preferences (per user, channel = push only for now).
CREATE TABLE "notification_preferences" (
  "user_id" TEXT NOT NULL,
  "push_invitations" BOOLEAN NOT NULL DEFAULT true,
  "push_match_dates" BOOLEAN NOT NULL DEFAULT true,
  "push_results" BOOLEAN NOT NULL DEFAULT true,
  "push_photos" BOOLEAN NOT NULL DEFAULT true,
  "push_chat" BOOLEAN NOT NULL DEFAULT false,
  "push_league_events" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
