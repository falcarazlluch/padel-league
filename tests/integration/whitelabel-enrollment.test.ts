import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { OrganizationService, InviteLinkService, EnrollmentService } from '@/modules/organizations';
import { LeagueService } from '@/modules/leagues';
import { TeamService, LeagueRegistrationService } from '@/modules/teams';
import { UserSearchService } from '@/modules/users';

// The partner-invite email is fire-and-forget through pg-boss; the queue is not
// part of what these tests assert, so stub the publish to keep them hermetic.
vi.mock('@/shared/queue/client', () => ({
  queue: () => ({ publish: vi.fn().mockResolvedValue('job-1') }),
}));

const prisma = testPrisma();

async function makeUser(email: string, name: string, role: 'SUPER_ADMIN' | 'PLAYER' = 'PLAYER') {
  return prisma.user.create({
    data: {
      email,
      name,
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
      role,
    },
  });
}

/** Registration window open now, competition starting next month. */
function competitionDates() {
  const now = Date.now();
  return {
    registrationStart: new Date(now - 7 * 86_400_000),
    registrationEnd: new Date(now + 14 * 86_400_000),
    startDate: new Date(now + 21 * 86_400_000),
    endDate: new Date(now + 50 * 86_400_000),
  };
}

async function seedTenantTournament() {
  const superAdmin = await makeUser('super@x.es', 'Super Admin', 'SUPER_ADMIN');
  const org = await OrganizationService.create(
    { slug: 'racc', name: 'RACC', tagline: 'Pádel para socios' },
    superAdmin.id,
  );
  const orgAdmin = await makeUser('admin@racc.es', 'Admin RACC');
  await OrganizationService.setMemberRole(org.id, orgAdmin.id, 'ORG_ADMIN', superAdmin.id);

  const league = await LeagueService.create({
    name: 'Torneo Socios',
    organizationId: org.id,
    createdByUserId: orgAdmin.id,
    type: 'TOURNAMENT',
    tournament: { hasGroupPhase: false, bracketSeedingMode: 'AUTO' },
    ...competitionDates(),
  });

  const link = await InviteLinkService.create({ leagueId: league.id }, orgAdmin.id);
  return { superAdmin, org, orgAdmin, league, link };
}

describe('whitelabel tenant isolation', () => {
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('scopes competitions and teams to their organization', async () => {
    const { org, orgAdmin, superAdmin } = await seedTenantTournament();

    // A public-platform competition created by the same super admin.
    await LeagueService.create({
      name: 'Liga Pública',
      createdByUserId: superAdmin.id,
      ...competitionDates(),
    });

    const tenantLeagues = await LeagueService.list(org.id);
    const publicLeagues = await LeagueService.list(null);
    expect(tenantLeagues.map((l) => l.name)).toEqual(['Torneo Socios']);
    expect(publicLeagues.map((l) => l.name)).toEqual(['Liga Pública']);

    // Slugs are globally unique, so getBySlug must refuse a cross-tenant read.
    const tenantSlug = tenantLeagues[0]!.slug;
    await expect(LeagueService.getBySlug(tenantSlug, null)).rejects.toThrow(/no encontrada/i);
    await expect(LeagueService.getBySlug(tenantSlug, org.id)).resolves.toBeTruthy();

    await TeamService.create({
      name: 'Pareja RACC',
      category: 'INTERMEDIATE',
      createdByUserId: orgAdmin.id,
      organizationId: org.id,
    });
    await TeamService.create({
      name: 'Pareja Pública',
      category: 'INTERMEDIATE',
      createdByUserId: orgAdmin.id,
      organizationId: null,
    });
    expect((await TeamService.listForUser(orgAdmin.id, org.id)).map((t) => t.name)).toEqual([
      'Pareja RACC',
    ]);
    expect((await TeamService.listForUser(orgAdmin.id, null)).map((t) => t.name)).toEqual([
      'Pareja Pública',
    ]);
  });

  it('restricts the partner search to organization members', async () => {
    const { org, league, link } = await seedTenantTournament();
    const inside = await makeUser('inside@x.es', 'Ana Interior');
    const outside = await makeUser('outside@x.es', 'Ana Exterior');
    await EnrollmentService.start(link.token, inside.id);

    const scoped = await UserSearchService.searchOrgPartners({
      q: 'Ana',
      callerId: inside.id,
      organizationId: org.id,
      excludeRegisteredInLeagueId: league.id,
    });
    expect(scoped.map((u) => u.id)).not.toContain(outside.id);

    // Same query on the public platform does see them.
    const unscoped = await UserSearchService.searchOrgPartners({
      q: 'Ana',
      callerId: inside.id,
      organizationId: null,
    });
    expect(unscoped.map((u) => u.id)).toContain(outside.id);
  });

  it('refuses a competition created in a tenant by a non-admin of that tenant', async () => {
    const { org } = await seedTenantTournament();
    const player = await makeUser('player@x.es', 'Jugador');
    await OrganizationService.ensureMember(org.id, player.id);

    await expect(
      LeagueService.create({
        name: 'Torneo Pirata',
        organizationId: org.id,
        createdByUserId: player.id,
        ...competitionDates(),
      }),
    ).rejects.toThrow(/administradores de la organización/i);
  });
});

describe('guided enrolment — invite existing partner', () => {
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('only registers the pair once the partner accepts, and does so atomically', async () => {
    const { org, league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    const marta = await makeUser('marta@x.es', 'Marta Ruiz');

    // Opening the link joins the tenant and creates the enrolment.
    const started = await EnrollmentService.start(link.token, juan.id);
    expect(started.resumed).toBe(false);
    expect(await OrganizationService.getMembership(org.id, juan.id)).toBe('ORG_PLAYER');

    // Re-opening is idempotent and does not double-count the link.
    const again = await EnrollmentService.start(link.token, juan.id);
    expect(again.resumed).toBe(true);
    expect(again.enrollmentId).toBe(started.enrollmentId);
    const linkRow = await prisma.tournamentInviteLink.findUniqueOrThrow({
      where: { id: link.id },
    });
    expect(linkRow.useCount).toBe(1);

    const invite = await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: juan.id,
      partnerUserId: marta.id,
    });
    expect(invite.notifiedInApp).toBe(true);
    expect(invite.shareUrl).toContain('/pareja/');

    // Crucially: NOT registered yet.
    let view = await EnrollmentService.getView(league.id, juan.id);
    expect(view.status).toBe('AWAITING_PARTNER_ACCEPT');
    expect(view.registrationId).toBeNull();
    expect(await prisma.leagueRegistration.count({ where: { leagueId: league.id } })).toBe(0);

    // Marta gets an in-app notification pointing at her accept page.
    const notif = await prisma.notification.findFirstOrThrow({
      where: { userId: marta.id, type: 'TOURNAMENT_PARTNER_INVITE' },
    });
    const token = (notif.metadata as { partnerInviteToken: string }).partnerInviteToken;

    const accepted = await EnrollmentService.acceptPartnerInvite(token, marta.id);
    expect(accepted.leagueId).toBe(league.id);

    // Team, registration and BOTH enrolments moved together.
    const members = await prisma.teamMember.findMany({ where: { teamId: invite.teamId } });
    expect(members.map((m) => m.userId).sort()).toEqual([juan.id, marta.id].sort());

    const registrations = await prisma.leagueRegistration.findMany({
      where: { leagueId: league.id, withdrawnAt: null },
    });
    expect(registrations).toHaveLength(1);

    view = await EnrollmentService.getView(league.id, juan.id);
    expect(view.status).toBe('COMPLETED');
    expect(view.checklist.every((i) => i.state === 'done')).toBe(true);

    const martaView = await EnrollmentService.getView(league.id, marta.id);
    expect(martaView.status).toBe('COMPLETED');
    expect(martaView.registrationId).toBe(registrations[0]!.id);

    // Marta is now a member of the tenant too.
    expect(await OrganizationService.getMembership(org.id, marta.id)).toBe('ORG_PLAYER');

    // Juan is told, in his notifications, that it closed.
    await expect(
      prisma.notification.findFirst({
        where: { userId: juan.id, type: 'TOURNAMENT_PARTNER_ACCEPTED' },
      }),
    ).resolves.toBeTruthy();
  });

  it('declining frees the enrolment to invite someone else', async () => {
    const { league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    const marta = await makeUser('marta@x.es', 'Marta Ruiz');
    const luis = await makeUser('luis@x.es', 'Luis Soto');

    await EnrollmentService.start(link.token, juan.id);
    await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: juan.id,
      partnerUserId: marta.id,
    });
    const firstInvite = await prisma.tournamentPartnerInvite.findFirstOrThrow({
      where: { invitedUserId: marta.id },
    });

    await EnrollmentService.declinePartnerInvite(firstInvite.token, marta.id);

    let view = await EnrollmentService.getView(league.id, juan.id);
    expect(view.status).toBe('AWAITING_PARTNER');
    expect(view.pendingInvite).toBeNull();
    await expect(
      prisma.notification.findFirst({
        where: { userId: juan.id, type: 'TOURNAMENT_PARTNER_DECLINED' },
      }),
    ).resolves.toBeTruthy();

    // Second invite reuses the same team rather than orphaning the first.
    const second = await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: juan.id,
      partnerUserId: luis.id,
    });
    const teams = await prisma.team.findMany({ where: { createdByUserId: juan.id } });
    expect(teams).toHaveLength(1);
    expect(second.teamId).toBe(teams[0]!.id);

    await EnrollmentService.acceptPartnerInvite(
      (await prisma.tournamentPartnerInvite.findFirstOrThrow({ where: { invitedUserId: luis.id } }))
        .token,
      luis.id,
    );
    view = await EnrollmentService.getView(league.id, juan.id);
    expect(view.status).toBe('COMPLETED');
  });

  it('supersedes the previous invite when the player changes partner mid-flight', async () => {
    const { league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    const marta = await makeUser('marta@x.es', 'Marta Ruiz');
    const luis = await makeUser('luis@x.es', 'Luis Soto');

    await EnrollmentService.start(link.token, juan.id);
    await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: juan.id,
      partnerUserId: marta.id,
    });
    await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: juan.id,
      partnerUserId: luis.id,
    });

    const martaInvite = await prisma.tournamentPartnerInvite.findFirstOrThrow({
      where: { invitedUserId: marta.id },
    });
    expect(martaInvite.status).toBe('CANCELLED');

    // The stale link must no longer work.
    await expect(
      EnrollmentService.acceptPartnerInvite(martaInvite.token, marta.id),
    ).rejects.toThrow(/aceptado, rechazado o cancelado/i);
  });

  it('rejects a partner who is already registered with somebody else', async () => {
    const { league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    const marta = await makeUser('marta@x.es', 'Marta Ruiz');
    const luis = await makeUser('luis@x.es', 'Luis Soto');
    const eva = await makeUser('eva@x.es', 'Eva Díaz');

    // Marta + Luis get in first.
    await EnrollmentService.start(link.token, marta.id);
    await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: marta.id,
      partnerUserId: luis.id,
    });
    await EnrollmentService.acceptPartnerInvite(
      (await prisma.tournamentPartnerInvite.findFirstOrThrow({ where: { invitedUserId: luis.id } }))
        .token,
      luis.id,
    );

    await EnrollmentService.start(link.token, juan.id);
    await expect(
      EnrollmentService.invitePartner({
        leagueId: league.id,
        userId: juan.id,
        partnerUserId: marta.id,
      }),
    ).rejects.toThrow(/ya está apuntado/i);

    // Someone else holding a link addressed to a specific account is turned
    // away by the account check — which fires before any other guard.
    await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: juan.id,
      partnerUserId: eva.id,
    });
    const evaInvite = await prisma.tournamentPartnerInvite.findFirstOrThrow({
      where: { invitedUserId: eva.id },
    });
    await expect(EnrollmentService.acceptPartnerInvite(evaInvite.token, juan.id)).rejects.toThrow(
      /para otra cuenta/i,
    );
    await expect(EnrollmentService.acceptPartnerInvite(evaInvite.token, marta.id)).rejects.toThrow(
      /para otra cuenta/i,
    );

    // Eva can still accept: nothing above consumed her invite.
    await EnrollmentService.acceptPartnerInvite(evaInvite.token, eva.id);
    expect((await EnrollmentService.getView(league.id, juan.id)).status).toBe('COMPLETED');
  });

  it('stops the inviter from accepting their own open (email) invite', async () => {
    const { league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');

    await EnrollmentService.start(link.token, juan.id);
    const invite = await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: juan.id,
      partnerEmail: 'sin-cuenta@x.es',
      partnerName: 'Sin Cuenta',
    });
    const row = await prisma.tournamentPartnerInvite.findFirstOrThrow({
      where: { id: invite.inviteId },
    });
    // No `invitedUserId`, so the WRONG_ACCOUNT check cannot help here — the
    // explicit self-accept guard is what stops a one-person "pair".
    await expect(EnrollmentService.acceptPartnerInvite(row.token, juan.id)).rejects.toThrow(
      /tu propia invitación/i,
    );
    expect(
      await prisma.leagueRegistration.count({ where: { leagueId: league.id, withdrawnAt: null } }),
    ).toBe(0);
  });

  it('rejects a partner who is already registered with somebody else on accept', async () => {
    const { league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    const marta = await makeUser('marta@x.es', 'Marta Ruiz');
    const luis = await makeUser('luis@x.es', 'Luis Soto');

    // Juan invites Marta but she does not answer yet.
    await EnrollmentService.start(link.token, juan.id);
    await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: juan.id,
      partnerUserId: marta.id,
    });
    const martaInvite = await prisma.tournamentPartnerInvite.findFirstOrThrow({
      where: { invitedUserId: marta.id },
    });

    // Meanwhile Marta gets in with Luis.
    await EnrollmentService.start(link.token, marta.id);
    await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: marta.id,
      partnerUserId: luis.id,
    });
    await EnrollmentService.acceptPartnerInvite(
      (await prisma.tournamentPartnerInvite.findFirstOrThrow({ where: { invitedUserId: luis.id } }))
        .token,
      luis.id,
    );

    // Her stale invite from Juan must not double-register her.
    await expect(
      EnrollmentService.acceptPartnerInvite(martaInvite.token, marta.id),
    ).rejects.toThrow(/con otra pareja/i);
    expect(
      await prisma.leagueRegistration.count({ where: { leagueId: league.id, withdrawnAt: null } }),
    ).toBe(1);
  });

  it('invites a partner who has no account yet, by email', async () => {
    const { league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');

    await EnrollmentService.start(link.token, juan.id);
    const invite = await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: juan.id,
      partnerEmail: 'nueva@pareja.es',
      partnerName: 'Nueva Pareja',
    });
    expect(invite.notifiedInApp).toBe(false);

    const row = await prisma.tournamentPartnerInvite.findFirstOrThrow({
      where: { id: invite.inviteId },
    });
    expect(row.invitedUserId).toBeNull();
    expect(row.invitedEmail).toBe('nueva@pareja.es');

    // Whoever holds the emailed link can accept it once they have an account.
    const nueva = await makeUser('nueva@pareja.es', 'Nueva Pareja');
    await EnrollmentService.acceptPartnerInvite(row.token, nueva.id);
    expect(
      await prisma.leagueRegistration.count({ where: { leagueId: league.id, withdrawnAt: null } }),
    ).toBe(1);
  });

  it('refuses to invite yourself', async () => {
    const { league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    await EnrollmentService.start(link.token, juan.id);

    await expect(
      EnrollmentService.invitePartner({
        leagueId: league.id,
        userId: juan.id,
        partnerUserId: juan.id,
      }),
    ).rejects.toThrow(/a ti mismo/i);
    await expect(
      EnrollmentService.invitePartner({
        leagueId: league.id,
        userId: juan.id,
        partnerEmail: 'juan@x.es',
      }),
    ).rejects.toThrow(/tu propio email/i);
  });
});

describe('guided enrolment — pair that already exists', () => {
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('registers immediately and notifies the partner', async () => {
    const { org, league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    const marta = await makeUser('marta@x.es', 'Marta Ruiz');
    await OrganizationService.ensureMember(org.id, marta.id);

    const team = await TeamService.create({
      name: 'Los Cracks',
      category: 'INTERMEDIATE',
      createdByUserId: juan.id,
      organizationId: org.id,
    });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: marta.id } });

    await EnrollmentService.start(link.token, juan.id);
    const res = await EnrollmentService.registerWithExistingTeam({
      leagueId: league.id,
      teamId: team.id,
      userId: juan.id,
    });
    expect(res.partnerUserId).toBe(marta.id);

    const view = await EnrollmentService.getView(league.id, juan.id);
    expect(view.status).toBe('COMPLETED');
    expect(view.registrationId).toBe(res.registrationId);

    // Marta learns about it without having to do anything.
    await expect(
      prisma.notification.findFirst({
        where: { userId: marta.id, type: 'TOURNAMENT_ENROLLMENT_COMPLETED' },
      }),
    ).resolves.toBeTruthy();
    const martaView = await EnrollmentService.getView(league.id, marta.id);
    expect(martaView.status).toBe('COMPLETED');
  });

  it('refuses an incomplete pair and a pair from another tenant', async () => {
    const { org, league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    await EnrollmentService.start(link.token, juan.id);

    const solo = await TeamService.create({
      name: 'Solo',
      category: 'INTERMEDIATE',
      createdByUserId: juan.id,
      organizationId: org.id,
    });
    await expect(
      EnrollmentService.registerWithExistingTeam({
        leagueId: league.id,
        teamId: solo.id,
        userId: juan.id,
      }),
    ).rejects.toThrow(/incompleta/i);

    const marta = await makeUser('marta@x.es', 'Marta Ruiz');
    const foreign = await TeamService.create({
      name: 'Pareja Pública',
      category: 'INTERMEDIATE',
      createdByUserId: juan.id,
      organizationId: null,
    });
    await prisma.teamMember.create({ data: { teamId: foreign.id, userId: marta.id } });
    await expect(
      EnrollmentService.registerWithExistingTeam({
        leagueId: league.id,
        teamId: foreign.id,
        userId: juan.id,
      }),
    ).rejects.toThrow(/otro entorno/i);
  });

  it('asks for no profile data: registering needs nothing beyond the account', async () => {
    const { org, league, link } = await seedTenantTournament();
    // Name and level came from the sign-up form; there is deliberately no phone.
    const juan = await prisma.user.create({
      data: {
        email: 'juan@x.es',
        name: 'Juan García',
        passwordHash: 'x',
        emailVerifiedAt: new Date(),
        category: 'ADVANCED',
      },
    });
    await EnrollmentService.start(link.token, juan.id);

    const team = await TeamService.create({
      name: 'Los Cracks',
      category: 'INTERMEDIATE',
      createdByUserId: juan.id,
      organizationId: org.id,
    });
    const marta = await makeUser('marta@x.es', 'Marta Ruiz');
    await prisma.teamMember.create({ data: { teamId: team.id, userId: marta.id } });

    await expect(
      EnrollmentService.registerWithExistingTeam({
        leagueId: league.id,
        teamId: team.id,
        userId: juan.id,
      }),
    ).resolves.toBeTruthy();

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: juan.id } });
    expect(stored.phone).toBeNull();
  });
});

describe('guided enrolment — cancelling', () => {
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('withdraws the registration and clears BOTH mirrored enrolments', async () => {
    const { org, league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    const marta = await makeUser('marta@x.es', 'Marta Ruiz');
    await OrganizationService.ensureMember(org.id, marta.id);

    const team = await TeamService.create({
      name: 'Los Cracks',
      category: 'INTERMEDIATE',
      createdByUserId: juan.id,
      organizationId: org.id,
    });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: marta.id } });
    await EnrollmentService.start(link.token, juan.id);
    await EnrollmentService.registerWithExistingTeam({
      leagueId: league.id,
      teamId: team.id,
      userId: juan.id,
    });

    await EnrollmentService.cancel({ leagueId: league.id, userId: juan.id });

    const reg = await prisma.leagueRegistration.findFirstOrThrow({
      where: { leagueId: league.id },
    });
    expect(reg.withdrawnAt).not.toBeNull();

    const juanView = await EnrollmentService.getView(league.id, juan.id);
    const martaView = await EnrollmentService.getView(league.id, marta.id);
    expect(juanView.status).toBe('CANCELLED');
    expect(martaView.status).toBe('CANCELLED');
    expect(martaView.registrationId).toBeNull();

    // Marta is told her plaza is gone.
    await expect(
      prisma.notification.findFirst({
        where: { userId: marta.id, type: 'LEAGUE_REGISTRATION_REMOVED' },
      }),
    ).resolves.toBeTruthy();

    // Re-opening the link starts a fresh enrolment on the same row.
    const restarted = await EnrollmentService.start(link.token, juan.id);
    expect(restarted.resumed).toBe(false);
    expect((await EnrollmentService.getView(league.id, juan.id)).status).toBe('AWAITING_PARTNER');
  });
});

describe('invite links', () => {
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('defaults its expiry to the registration deadline', async () => {
    const { league, link } = await seedTenantTournament();
    expect(link.expiresAt?.getTime()).toBe(league.registrationEnd.getTime());
  });

  it('stops working once revoked', async () => {
    const { orgAdmin, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');

    await InviteLinkService.revoke(link.id, orgAdmin.id);
    await expect(EnrollmentService.start(link.token, juan.id)).rejects.toThrow(/desactivado/i);
    const preview = await InviteLinkService.preview(link.token);
    expect(preview?.blockedReason).toBe('REVOKED');
  });

  it('cannot be created by someone who is not an admin of the org', async () => {
    const { league } = await seedTenantTournament();
    const outsider = await makeUser('out@x.es', 'Fuera');
    await expect(InviteLinkService.create({ leagueId: league.id }, outsider.id)).rejects.toThrow(
      /permisos de administración/i,
    );
  });

  it('is refused for a public-platform competition', async () => {
    const { superAdmin } = await seedTenantTournament();
    const publicLeague = await LeagueService.create({
      name: 'Liga Pública',
      createdByUserId: superAdmin.id,
      ...competitionDates(),
    });
    await expect(
      InviteLinkService.create({ leagueId: publicLeague.id }, superAdmin.id),
    ).rejects.toThrow(/de una organización/i);
  });
});

describe('interoperability with the classic registration path', () => {
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('a wizard-registered pair is visible to the existing registration service', async () => {
    const { org, league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    const marta = await makeUser('marta@x.es', 'Marta Ruiz');

    await EnrollmentService.start(link.token, juan.id);
    const invite = await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: juan.id,
      partnerUserId: marta.id,
    });
    await EnrollmentService.acceptPartnerInvite(
      (await prisma.tournamentPartnerInvite.findFirstOrThrow({ where: { id: invite.inviteId } }))
        .token,
      marta.id,
    );

    const active = await LeagueRegistrationService.listActiveTeamsForLeague(league.id);
    expect(active).toHaveLength(1);
    expect(active[0]!.team?.members.map((m) => m.userId).sort()).toEqual(
      [juan.id, marta.id].sort(),
    );

    // The team really belongs to the tenant.
    const team = await prisma.team.findUniqueOrThrow({ where: { id: invite.teamId } });
    expect(team.organizationId).toBe(org.id);
  });
});

describe('organization-level invite link', () => {
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('joins the tenant and then enrols into a competition the player chooses', async () => {
    const { org, orgAdmin, league } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    const marta = await makeUser('marta@x.es', 'Marta Ruiz');

    // The organisation link carries no competition.
    const orgLink = await InviteLinkService.create({ organizationId: org.id }, orgAdmin.id);
    const preview = await InviteLinkService.preview(orgLink.token);
    expect(preview?.kind).toBe('ORGANIZATION');
    expect(preview?.competition).toBeNull();
    expect(preview?.openCompetitions.map((c) => c.id)).toEqual([league.id]);
    expect(preview?.blockedReason).toBeNull();

    // It has no window of its own, so it does not inherit the competition's.
    expect(orgLink.expiresAt).toBeNull();

    // Joining is idempotent and only counts the first alta.
    await InviteLinkService.joinOrganization(orgLink.token, juan.id);
    await InviteLinkService.joinOrganization(orgLink.token, juan.id);
    expect(await OrganizationService.getMembership(org.id, juan.id)).toBe('ORG_PLAYER');
    expect(
      (await prisma.tournamentInviteLink.findUniqueOrThrow({ where: { id: orgLink.id } })).useCount,
    ).toBe(1);

    // The same token now enrols into the chosen competition.
    const started = await EnrollmentService.start(orgLink.token, juan.id, league.id);
    expect(started.leagueId).toBe(league.id);

    await EnrollmentService.invitePartner({
      leagueId: league.id,
      userId: juan.id,
      partnerUserId: marta.id,
    });
    await EnrollmentService.acceptPartnerInvite(
      (await prisma.tournamentPartnerInvite.findFirstOrThrow({ where: { invitedUserId: marta.id } }))
        .token,
      marta.id,
    );
    expect((await EnrollmentService.getView(league.id, juan.id)).status).toBe('COMPLETED');
  });

  it('refuses to enrol without naming a competition', async () => {
    const { org, orgAdmin } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    const orgLink = await InviteLinkService.create({ organizationId: org.id }, orgAdmin.id);

    await expect(EnrollmentService.start(orgLink.token, juan.id)).rejects.toThrow(
      /elige la competición/i,
    );
  });

  it('refuses a competition that belongs to another environment', async () => {
    const { org, orgAdmin, superAdmin } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');
    const orgLink = await InviteLinkService.create({ organizationId: org.id }, orgAdmin.id);

    // A public-platform competition: not reachable through RACC's link even if
    // its id is hand-edited into the URL.
    const outsider = await LeagueService.create({
      name: 'Liga Pública',
      createdByUserId: superAdmin.id,
      ...competitionDates(),
    });

    await expect(
      EnrollmentService.start(orgLink.token, juan.id, outsider.id),
    ).rejects.toThrow(/no encontrada/i);
  });

  it('a competition link still pins its own competition, ignoring any choice', async () => {
    const { league, link } = await seedTenantTournament();
    const juan = await makeUser('juan@x.es', 'Juan García');

    // Passing a different id must not override a competition-scoped link.
    const started = await EnrollmentService.start(link.token, juan.id, 'some-other-id');
    expect(started.leagueId).toBe(league.id);
  });

  it('lists organization links separately from competition links', async () => {
    const { org, orgAdmin, league } = await seedTenantTournament();
    const orgLink = await InviteLinkService.create({ organizationId: org.id }, orgAdmin.id);

    const orgOnly = await InviteLinkService.listForOrganization(org.id, orgAdmin.id);
    expect(orgOnly.map((l) => l.id)).toEqual([orgLink.id]);

    const perLeague = await InviteLinkService.listForLeague(league.id, orgAdmin.id);
    expect(perLeague.map((l) => l.id)).not.toContain(orgLink.id);
  });

  it('cannot be created by someone who does not administer the org', async () => {
    const { org } = await seedTenantTournament();
    const outsider = await makeUser('out@x.es', 'Fuera');
    await expect(
      InviteLinkService.create({ organizationId: org.id }, outsider.id),
    ).rejects.toThrow(/permisos de administración/i);
  });
});

describe('organization branding — who may change it', () => {
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('lets the org admin change name, logo, colours, tagline and contact', async () => {
    const { org, orgAdmin } = await seedTenantTournament();

    await OrganizationService.update(org.id, orgAdmin.id, {
      name: 'RACC Pádel',
      logoUrl: 'https://cdn.example.com/racc.png',
      tagline: 'Competiciones para socios',
      contactEmail: 'padel@racc.es',
      primaryColor: '#000000',
      secondaryColor: '#1F4E9C',
      accentColor: '#FFCF00',
    });

    const row = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(row.name).toBe('RACC Pádel');
    expect(row.logoUrl).toBe('https://cdn.example.com/racc.png');
    expect(row.accentColor).toBe('#FFCF00');
    // The subdomain is untouched: renaming it would break every link handed out.
    expect(row.slug).toBe('racc');
  });

  it('refuses a non-admin of the org, and an admin of a different org', async () => {
    const { org, superAdmin } = await seedTenantTournament();

    const player = await makeUser('player@x.es', 'Jugador');
    await OrganizationService.ensureMember(org.id, player.id);
    await expect(
      OrganizationService.update(org.id, player.id, { name: 'Secuestrado' }),
    ).rejects.toThrow(/permisos de administración/i);

    // Admin of another club must not be able to repaint this one.
    const other = await OrganizationService.create({ slug: 'otro', name: 'Otro Club' }, superAdmin.id);
    const otherAdmin = await makeUser('admin@otro.es', 'Admin Otro');
    await OrganizationService.setMemberRole(other.id, otherAdmin.id, 'ORG_ADMIN', superAdmin.id);
    await expect(
      OrganizationService.update(org.id, otherAdmin.id, { name: 'Secuestrado' }),
    ).rejects.toThrow(/permisos de administración/i);

    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).name).toBe('RACC');
  });

  it('rejects colours that are not 6-digit hex, since they end up inside a <style>', async () => {
    const { org, orgAdmin } = await seedTenantTournament();
    for (const bad of ['red', '#FFF', 'url(evil)', '#12345g']) {
      await expect(
        OrganizationService.update(org.id, orgAdmin.id, { primaryColor: bad }),
      ).rejects.toThrow(/color hex/i);
    }
  });

  it('keeps activation as a platform decision, not the org admin’s', async () => {
    const { org, orgAdmin, superAdmin } = await seedTenantTournament();

    await expect(
      OrganizationService.update(org.id, orgAdmin.id, { isActive: false }),
    ).rejects.toThrow(/super admin/i);

    await OrganizationService.update(org.id, superAdmin.id, { isActive: false });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).isActive).toBe(
      false,
    );
  });
});
