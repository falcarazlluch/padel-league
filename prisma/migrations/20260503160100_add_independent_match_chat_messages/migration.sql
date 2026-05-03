CREATE TABLE "independent_match_chat_messages" (
  "id" TEXT NOT NULL,
  "match_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "content" VARCHAR(2000) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "independent_match_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "independent_match_chat_messages_match_id_created_at_idx"
  ON "independent_match_chat_messages" ("match_id", "created_at");

ALTER TABLE "independent_match_chat_messages"
  ADD CONSTRAINT "independent_match_chat_messages_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "independent_matches" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "independent_match_chat_messages"
  ADD CONSTRAINT "independent_match_chat_messages_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
