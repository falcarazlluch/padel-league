-- DropForeignKey
ALTER TABLE "independent_match_join_requests" DROP CONSTRAINT IF EXISTS "independent_match_join_requests_independent_match_id_fkey";
ALTER TABLE "independent_match_join_requests" DROP CONSTRAINT IF EXISTS "independent_match_join_requests_user_id_fkey";
ALTER TABLE "independent_match_join_requests" DROP CONSTRAINT IF EXISTS "independent_match_join_requests_responded_by_user_id_fkey";

-- DropTable
DROP TABLE "independent_match_join_requests";

-- DropEnum
DROP TYPE "JoinRequestStatus";
