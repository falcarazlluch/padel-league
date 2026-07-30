-- Split out from the whitelabel migration on purpose: `ALTER TYPE … ADD VALUE`
-- and the first *use* of the new value must not share a transaction. Keeping
-- the enum additions in their own migration keeps that guarantee regardless of
-- the Postgres version running `migrate deploy`.
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_PARTNER_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_PARTNER_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_PARTNER_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_ENROLLMENT_COMPLETED';
