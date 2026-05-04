ALTER TABLE "users"
  ADD COLUMN "blocked_at" TIMESTAMP(3),
  ADD COLUMN "block_reason" TEXT,
  ADD COLUMN "prompt_injection_strikes" INTEGER NOT NULL DEFAULT 0;
