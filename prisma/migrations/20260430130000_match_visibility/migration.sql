-- CreateEnum
CREATE TYPE "MatchVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "independent_matches" ADD COLUMN "visibility" "MatchVisibility" NOT NULL DEFAULT 'PUBLIC';
