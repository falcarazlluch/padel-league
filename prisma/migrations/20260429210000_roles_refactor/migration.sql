-- Roles refactor: LEAGUE_ADMIN moves from a per-league role on LeagueMember
-- to a global UserRole. League admin = league.created_by_user_id.

-- 1. Add LEAGUE_ADMIN to the existing UserRole enum.
ALTER TYPE "UserRole" ADD VALUE 'LEAGUE_ADMIN';

-- 2. Drop the league_members table and its FKs.
DROP TABLE IF EXISTS "league_members";

-- 3. Drop the now-unused LeagueMemberRole enum.
DROP TYPE IF EXISTS "LeagueMemberRole";
