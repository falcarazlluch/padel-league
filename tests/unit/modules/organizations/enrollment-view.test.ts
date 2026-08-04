import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnrollmentService } from '@/modules/organizations';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    tournamentEnrollment: { findUnique: vi.fn() },
    tournamentPartnerInvite: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    league: { findUnique: vi.fn() },
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    tournamentEnrollment: { findUnique: ReturnType<typeof vi.fn> };
    tournamentPartnerInvite: { findUnique: ReturnType<typeof vi.fn> };
    user: { findUnique: ReturnType<typeof vi.fn> };
    league: { findUnique: ReturnType<typeof vi.fn> };
  };
}

const ORG_LEAGUE = { organization: { slug: 'racc' } };

function checklistOf(items: { key: string; state: string }[], key: string) {
  return items.find((i) => i.key === key)?.state;
}

describe('EnrollmentService.getView — the "¿me falta algo?" contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports NOT_STARTED and points straight at the partner step', async () => {
    const prisma = await getPrisma();
    prisma.tournamentEnrollment.findUnique.mockResolvedValue(null);
    prisma.league.findUnique.mockResolvedValue(ORG_LEAGUE);

    const view = await EnrollmentService.getView('l1', 'u1');
    expect(view.status).toBe('NOT_STARTED');
    expect(view.currentStep).toBe(3);
    expect(checklistOf(view.checklist, 'partner')).toBe('blocked');
    expect(checklistOf(view.checklist, 'registration')).toBe('blocked');
  });

  it('never asks for profile data: the checklist is only partner + registration', async () => {
    const prisma = await getPrisma();
    prisma.tournamentEnrollment.findUnique.mockResolvedValue(null);
    prisma.league.findUnique.mockResolvedValue(ORG_LEAGUE);

    const view = await EnrollmentService.getView('l1', 'u1');
    // Name and level are collected at sign-up, so an enrolment can never be
    // blocked on "completa tu perfil" — and nothing reads the user row for it.
    expect(view.checklist.map((i) => i.key)).toEqual(['partner', 'registration']);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('marks the partner as pending — never as done — while an invite is unanswered', async () => {
    const prisma = await getPrisma();
    prisma.tournamentEnrollment.findUnique.mockResolvedValue({
      id: 'e1',
      status: 'AWAITING_PARTNER_ACCEPT',
      registrationId: null,
      completedAt: null,
      inviteLinkId: 'link1',
      team: { id: 't1', name: 'Los Cracks', members: [{ userId: 'u1', user: { id: 'u1', name: 'Juan', email: 'j@x.es' } }] },
      invites: [
        {
          id: 'i1',
          token: 'ptok',
          status: 'PENDING',
          invitedUserId: null,
          invitedName: 'Marta Ruiz',
          invitedEmail: 'marta@x.es',
          expiresAt: new Date('2026-08-15T00:00:00Z'),
        },
      ],
    });
    prisma.league.findUnique.mockResolvedValue(ORG_LEAGUE);

    const view = await EnrollmentService.getView('l1', 'u1');
    expect(view.status).toBe('AWAITING_PARTNER_ACCEPT');
    expect(view.currentStep).toBe(3);
    expect(checklistOf(view.checklist, 'partner')).toBe('pending');
    // The crux: registration is NOT done just because an invite went out.
    expect(checklistOf(view.checklist, 'registration')).toBe('pending');
    expect(view.registrationId).toBeNull();
    expect(view.partner).toEqual({
      userId: null,
      name: 'Marta Ruiz',
      email: 'marta@x.es',
      accepted: false,
    });
    expect(view.pendingInvite?.shareUrl).toContain('/pareja/ptok');
  });

  it('marks everything done once the registration exists', async () => {
    const prisma = await getPrisma();
    prisma.tournamentEnrollment.findUnique.mockResolvedValue({
      id: 'e1',
      status: 'COMPLETED',
      registrationId: 'reg1',
      completedAt: new Date('2026-08-02T00:00:00Z'),
      inviteLinkId: 'link1',
      team: {
        id: 't1',
        name: 'Los Cracks',
        members: [
          { userId: 'u1', user: { id: 'u1', name: 'Juan', email: 'j@x.es' } },
          { userId: 'u2', user: { id: 'u2', name: 'Marta', email: 'm@x.es' } },
        ],
      },
      invites: [],
    });
    prisma.league.findUnique.mockResolvedValue(ORG_LEAGUE);

    const view = await EnrollmentService.getView('l1', 'u1');
    expect(view.currentStep).toBe(4);
    expect(view.partner).toEqual({
      userId: 'u2',
      name: 'Marta',
      email: 'm@x.es',
      accepted: true,
    });
    expect(view.checklist.every((i) => i.state === 'done')).toBe(true);
    expect(view.pendingInvite).toBeNull();
  });

  it('a cancelled enrollment reads as "nothing done" rather than half-done', async () => {
    const prisma = await getPrisma();
    prisma.tournamentEnrollment.findUnique.mockResolvedValue({
      id: 'e1',
      status: 'CANCELLED',
      registrationId: null,
      completedAt: null,
      inviteLinkId: 'link1',
      team: { id: 't1', name: 'X', members: [] },
      invites: [],
    });
    prisma.league.findUnique.mockResolvedValue(ORG_LEAGUE);

    const view = await EnrollmentService.getView('l1', 'u1');
    expect(view.status).toBe('CANCELLED');
    expect(view.registrationId).toBeNull();
    expect(view.team).toBeNull();
    expect(checklistOf(view.checklist, 'registration')).toBe('blocked');
  });
});

describe('EnrollmentService.getPartnerInvite — blockedReason', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const NOW = new Date('2026-08-01T12:00:00Z');

  function invite(overrides: Record<string, unknown> = {}) {
    return {
      id: 'i1',
      token: 'ptok',
      status: 'PENDING',
      expiresAt: new Date('2026-08-15T00:00:00Z'),
      invitedName: 'Marta',
      invitedEmail: 'marta@x.es',
      invitedUserId: 'u2',
      invitedBy: { id: 'u1', name: 'Juan García', avatarUrl: null },
      team: { id: 't1', name: 'Los Cracks', members: [{ userId: 'u1' }] },
      league: {
        id: 'l1',
        slug: 'torneo',
        name: 'Torneo',
        type: 'TOURNAMENT',
        status: 'DRAFT',
        startDate: new Date('2026-09-01T00:00:00Z'),
        endDate: new Date('2026-09-30T00:00:00Z'),
        registrationStart: new Date('2026-07-01T00:00:00Z'),
        registrationEnd: new Date('2026-08-20T00:00:00Z'),
        organization: { id: 'org1', slug: 'racc', name: 'RACC', logoUrl: null, isActive: true },
      },
      ...overrides,
    };
  }

  it('is acceptable by the invited account', async () => {
    const prisma = await getPrisma();
    prisma.tournamentPartnerInvite.findUnique.mockResolvedValue(invite());
    const view = await EnrollmentService.getPartnerInvite('ptok', 'u2', NOW);
    expect(view?.blockedReason).toBeNull();
    expect(view?.organization?.slug).toBe('racc');
  });

  it('renders for an anonymous visitor without claiming WRONG_ACCOUNT', async () => {
    const prisma = await getPrisma();
    prisma.tournamentPartnerInvite.findUnique.mockResolvedValue(invite());
    const view = await EnrollmentService.getPartnerInvite('ptok', null, NOW);
    expect(view?.blockedReason).toBeNull();
  });

  it('reports WRONG_ACCOUNT when a different user is signed in', async () => {
    const prisma = await getPrisma();
    prisma.tournamentPartnerInvite.findUnique.mockResolvedValue(invite());
    const view = await EnrollmentService.getPartnerInvite('ptok', 'u9', NOW);
    expect(view?.blockedReason).toBe('WRONG_ACCOUNT');
  });

  it('accepts any holder when the invite was addressed only by email', async () => {
    const prisma = await getPrisma();
    prisma.tournamentPartnerInvite.findUnique.mockResolvedValue(invite({ invitedUserId: null }));
    const view = await EnrollmentService.getPartnerInvite('ptok', 'u9', NOW);
    expect(view?.blockedReason).toBeNull();
  });

  it('reports ALREADY_RESOLVED, EXPIRED, TEAM_FULL and REGISTRATION_CLOSED', async () => {
    const prisma = await getPrisma();

    prisma.tournamentPartnerInvite.findUnique.mockResolvedValue(invite({ status: 'DECLINED' }));
    expect((await EnrollmentService.getPartnerInvite('ptok', 'u2', NOW))?.blockedReason).toBe(
      'ALREADY_RESOLVED',
    );

    prisma.tournamentPartnerInvite.findUnique.mockResolvedValue(
      invite({ expiresAt: new Date('2026-07-20T00:00:00Z') }),
    );
    expect((await EnrollmentService.getPartnerInvite('ptok', 'u2', NOW))?.blockedReason).toBe(
      'EXPIRED',
    );

    prisma.tournamentPartnerInvite.findUnique.mockResolvedValue(
      invite({ team: { id: 't1', name: 'X', members: [{ userId: 'u1' }, { userId: 'u3' }] } }),
    );
    expect((await EnrollmentService.getPartnerInvite('ptok', 'u2', NOW))?.blockedReason).toBe(
      'TEAM_FULL',
    );

    prisma.tournamentPartnerInvite.findUnique.mockResolvedValue(
      invite({ league: { ...invite().league, status: 'ACTIVE' } }),
    );
    expect((await EnrollmentService.getPartnerInvite('ptok', 'u2', NOW))?.blockedReason).toBe(
      'REGISTRATION_CLOSED',
    );
  });

  it('returns null for an unknown token', async () => {
    const prisma = await getPrisma();
    prisma.tournamentPartnerInvite.findUnique.mockResolvedValue(null);
    await expect(EnrollmentService.getPartnerInvite('nope', 'u2', NOW)).resolves.toBeNull();
  });
});
