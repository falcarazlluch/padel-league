-- Whitelabel multi-tenant: introduce `organizations` as an isolation boundary
-- and the guided tournament-enrollment flow (invite link → wizard → partner
-- invite → registration).
--
-- Purely additive. Every existing league/team keeps `organization_id = NULL`,
-- which is the "public platform" tenant (mypadelleague.es). A tenant such as
-- RACC is served at racc.mypadelleague.es and only ever sees its own rows.

-- ─── Enums ──────────────────────────────────────────────────────────────
CREATE TYPE "OrgMemberRole" AS ENUM ('ORG_ADMIN', 'ORG_PLAYER');
CREATE TYPE "TournamentEnrollmentStatus" AS ENUM ('AWAITING_PARTNER', 'AWAITING_PARTNER_ACCEPT', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PartnerInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');
-- The four new NotificationType values land in the preceding migration
-- (20260730085900) so their ADD VALUE never shares a transaction with a
-- statement that uses them.

-- ─── organizations ──────────────────────────────────────────────────────
CREATE TABLE "organizations" (
  "id"              TEXT NOT NULL,
  "slug"            TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "logo_url"        TEXT,
  "primary_color"   TEXT NOT NULL DEFAULT '#0D1E45',
  "secondary_color" TEXT NOT NULL DEFAULT '#5BB8D4',
  "accent_color"    TEXT NOT NULL DEFAULT '#F9C920',
  "contact_email"   TEXT,
  "tagline"         TEXT,
  "is_active"       BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organizations_is_active_idx" ON "organizations"("is_active");

-- ─── organization_members ───────────────────────────────────────────────
CREATE TABLE "organization_members" (
  "id"              TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id"         TEXT NOT NULL,
  "role"            "OrgMemberRole" NOT NULL DEFAULT 'ORG_PLAYER',
  "joined_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");
CREATE INDEX "organization_members_organization_id_role_idx" ON "organization_members"("organization_id", "role");

ALTER TABLE "organization_members"
  ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Tenant column on the two owned aggregates ──────────────────────────
ALTER TABLE "leagues" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "teams"   ADD COLUMN "organization_id" TEXT;

CREATE INDEX "leagues_organization_id_status_idx" ON "leagues"("organization_id", "status");
CREATE INDEX "teams_organization_id_idx" ON "teams"("organization_id");

ALTER TABLE "leagues"
  ADD CONSTRAINT "leagues_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teams"
  ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── tournament_invite_links ────────────────────────────────────────────
CREATE TABLE "tournament_invite_links" (
  "id"                 TEXT NOT NULL,
  "token"              TEXT NOT NULL,
  "league_id"          TEXT NOT NULL,
  "organization_id"    TEXT NOT NULL,
  "label"              TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "expires_at"         TIMESTAMP(3),
  "max_uses"           INTEGER,
  "use_count"          INTEGER NOT NULL DEFAULT 0,
  "revoked_at"         TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tournament_invite_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tournament_invite_links_token_key" ON "tournament_invite_links"("token");
CREATE INDEX "tournament_invite_links_league_id_revoked_at_idx" ON "tournament_invite_links"("league_id", "revoked_at");
CREATE INDEX "tournament_invite_links_organization_id_idx" ON "tournament_invite_links"("organization_id");

ALTER TABLE "tournament_invite_links"
  ADD CONSTRAINT "tournament_invite_links_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "tournament_invite_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "tournament_invite_links_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── tournament_enrollments ─────────────────────────────────────────────
CREATE TABLE "tournament_enrollments" (
  "id"              TEXT NOT NULL,
  "league_id"       TEXT NOT NULL,
  "user_id"         TEXT NOT NULL,
  "invite_link_id"  TEXT,
  "team_id"         TEXT,
  "registration_id" TEXT,
  "status"          "TournamentEnrollmentStatus" NOT NULL DEFAULT 'AWAITING_PARTNER',
  "completed_at"    TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tournament_enrollments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tournament_enrollments_league_id_user_id_key" ON "tournament_enrollments"("league_id", "user_id");
CREATE INDEX "tournament_enrollments_user_id_status_idx" ON "tournament_enrollments"("user_id", "status");
CREATE INDEX "tournament_enrollments_league_id_status_idx" ON "tournament_enrollments"("league_id", "status");

ALTER TABLE "tournament_enrollments"
  ADD CONSTRAINT "tournament_enrollments_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "tournament_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "tournament_enrollments_invite_link_id_fkey" FOREIGN KEY ("invite_link_id") REFERENCES "tournament_invite_links"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tournament_enrollments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── tournament_partner_invites ─────────────────────────────────────────
CREATE TABLE "tournament_partner_invites" (
  "id"                 TEXT NOT NULL,
  "token"              TEXT NOT NULL,
  "enrollment_id"      TEXT NOT NULL,
  "league_id"          TEXT NOT NULL,
  "team_id"            TEXT NOT NULL,
  "invited_by_user_id" TEXT NOT NULL,
  "invited_user_id"    TEXT,
  "invited_email"      CITEXT,
  "invited_name"       TEXT,
  "status"             "PartnerInviteStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at"         TIMESTAMP(3) NOT NULL,
  "responded_at"       TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tournament_partner_invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tournament_partner_invites_token_key" ON "tournament_partner_invites"("token");
CREATE INDEX "tournament_partner_invites_enrollment_id_status_idx" ON "tournament_partner_invites"("enrollment_id", "status");
CREATE INDEX "tournament_partner_invites_invited_user_id_status_idx" ON "tournament_partner_invites"("invited_user_id", "status");
CREATE INDEX "tournament_partner_invites_invited_email_status_idx" ON "tournament_partner_invites"("invited_email", "status");

ALTER TABLE "tournament_partner_invites"
  ADD CONSTRAINT "tournament_partner_invites_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "tournament_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "tournament_partner_invites_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "tournament_partner_invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "tournament_partner_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "tournament_partner_invites_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
