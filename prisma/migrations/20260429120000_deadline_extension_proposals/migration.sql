-- CreateEnum
CREATE TYPE "ExtensionProposalStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "deadline_extension_proposals" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "proposed_by_user_id" TEXT NOT NULL,
    "proposed_deadline_at" TIMESTAMP(3) NOT NULL,
    "status" "ExtensionProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "responded_by_user_id" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deadline_extension_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deadline_extension_proposals_match_id_status_idx" ON "deadline_extension_proposals"("match_id", "status");

-- AddForeignKey
ALTER TABLE "deadline_extension_proposals" ADD CONSTRAINT "deadline_extension_proposals_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_extension_proposals" ADD CONSTRAINT "deadline_extension_proposals_proposed_by_user_id_fkey"
  FOREIGN KEY ("proposed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_extension_proposals" ADD CONSTRAINT "deadline_extension_proposals_responded_by_user_id_fkey"
  FOREIGN KEY ("responded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterEnum: NotificationType
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXTENSION_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXTENSION_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXTENSION_REJECTED';
