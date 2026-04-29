-- CreateEnum
CREATE TYPE "TeamCategory" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- AlterTable: leagues
ALTER TABLE "leagues" ADD COLUMN "category" "TeamCategory" NOT NULL DEFAULT 'INTERMEDIATE';

-- AlterTable: teams
ALTER TABLE "teams" ADD COLUMN "category" "TeamCategory" NOT NULL DEFAULT 'INTERMEDIATE';
