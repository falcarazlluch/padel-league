import type {
  OrgMemberRole,
  PartnerInviteStatus,
  TournamentEnrollmentStatus,
} from '@prisma/client';

export type { OrgMemberRole, PartnerInviteStatus, TournamentEnrollmentStatus };

export interface OrganizationSummary {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  contactEmail: string | null;
  tagline: string | null;
  isActive: boolean;
  createdAt: Date;
  memberCount: number;
  adminCount: number;
  competitionCount: number;
}

export interface CreateOrganizationInput {
  slug: string;
  name: string;
  logoUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  contactEmail?: string | null;
  tagline?: string | null;
}

export interface OrganizationMemberRow {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: OrgMemberRole;
  joinedAt: Date;
}

export interface InviteLinkOrganization {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  tagline: string | null;
}

/** A competition the holder of an organization link could enrol in. */
export interface OpenCompetitionSummary {
  id: string;
  slug: string;
  name: string;
  type: 'LEAGUE' | 'AMERICANA' | 'TOURNAMENT';
  category: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  registrationEnd: Date;
  startDate: Date;
  endDate: Date;
  registeredCount: number;
  /** The viewer's enrolment state, once we know who they are. */
  alreadyEnrolled: boolean;
}

/**
 * What the invited player is shown before committing to anything.
 *
 * `kind` discriminates the two link shapes:
 *  - `COMPETITION` — straight into one competition's wizard.
 *  - `ORGANIZATION` — join the tenant, then pick from `openCompetitions`.
 *    This is the link an admin hands out once and reuses all season.
 */
export interface InviteLinkPreview {
  kind: 'ORGANIZATION' | 'COMPETITION';
  linkId: string;
  token: string;
  organization: InviteLinkOrganization;
  /** Only set when `kind === 'COMPETITION'`. */
  competition: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    type: 'LEAGUE' | 'AMERICANA' | 'TOURNAMENT';
    category: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
    registrationStart: Date;
    registrationEnd: Date;
    startDate: Date;
    endDate: Date;
    registeredCount: number;
  } | null;
  /** Only populated when `kind === 'ORGANIZATION'`. */
  openCompetitions: OpenCompetitionSummary[];
  /** Non-null when the link cannot currently be used to enrol. */
  blockedReason:
    | null
    | 'REVOKED'
    | 'EXPIRED'
    | 'MAX_USES_REACHED'
    | 'REGISTRATION_NOT_OPEN_YET'
    | 'REGISTRATION_CLOSED'
    | 'COMPETITION_STARTED'
    /** Organization link, but the tenant has nothing open to enrol in. */
    | 'NO_OPEN_COMPETITIONS';
}

/**
 * Everything the wizard and the status page need in one shot. `checklist` is
 * the answer to "¿me falta algo?" — rendered verbatim so the user is never in
 * doubt about whether they are in.
 */
export interface EnrollmentView {
  enrollmentId: string | null;
  status: TournamentEnrollmentStatus | 'NOT_STARTED';
  /** 1-based step the wizard should open on. */
  currentStep: 1 | 2 | 3 | 4;
  profileComplete: boolean;
  missingProfileFields: string[];
  team: { id: string; name: string; memberCount: number } | null;
  partner: {
    userId: string | null;
    name: string;
    email: string | null;
    accepted: boolean;
  } | null;
  pendingInvite: {
    id: string;
    token: string;
    invitedName: string;
    invitedEmail: string | null;
    expiresAt: Date;
    shareUrl: string;
  } | null;
  registrationId: string | null;
  completedAt: Date | null;
  checklist: ChecklistItem[];
}

export interface ChecklistItem {
  key: 'profile' | 'partner' | 'registration';
  label: string;
  state: 'done' | 'pending' | 'blocked';
  detail: string;
}

export interface PartnerInviteView {
  id: string;
  token: string;
  status: PartnerInviteStatus;
  expiresAt: Date;
  invitedName: string;
  invitedEmail: string | null;
  invitedUserId: string | null;
  inviter: { id: string; name: string; avatarUrl: string | null };
  team: { id: string; name: string; memberCount: number };
  competition: {
    id: string;
    slug: string;
    name: string;
    type: 'LEAGUE' | 'AMERICANA' | 'TOURNAMENT';
    startDate: Date;
    endDate: Date;
    registrationEnd: Date;
  };
  organization: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
  } | null;
  /** Non-null when the invite can no longer be accepted. */
  blockedReason:
    | null
    | 'ALREADY_RESOLVED'
    | 'EXPIRED'
    | 'TEAM_FULL'
    | 'REGISTRATION_CLOSED'
    | 'WRONG_ACCOUNT';
}
