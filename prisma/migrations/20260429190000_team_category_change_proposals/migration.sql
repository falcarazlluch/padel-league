-- CreateEnum
CREATE TYPE "CategoryProposalStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CategoryProposalReason" AS ENUM ('PROMOTION', 'DEMOTION');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CATEGORY_CHANGE_PROPOSED';

-- CreateTable
CREATE TABLE "team_category_change_proposals" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "from_category" "TeamCategory" NOT NULL,
    "to_category" "TeamCategory" NOT NULL,
    "reason" "CategoryProposalReason" NOT NULL,
    "status" "CategoryProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "resolved_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_category_change_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_category_change_proposals_team_id_status_idx" ON "team_category_change_proposals"("team_id", "status");

-- CreateIndex
CREATE INDEX "team_category_change_proposals_league_id_idx" ON "team_category_change_proposals"("league_id");

-- AddForeignKey
ALTER TABLE "team_category_change_proposals" ADD CONSTRAINT "team_category_change_proposals_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_category_change_proposals" ADD CONSTRAINT "team_category_change_proposals_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_category_change_proposals" ADD CONSTRAINT "team_category_change_proposals_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
