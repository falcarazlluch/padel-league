import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { IndependentMatchService } from '@/modules/independent-matches';

const prisma = testPrisma();

async function user(name: string, suffix: string) {
  return prisma.user.create({
    data: { name, email: `${suffix}@t.com`, passwordHash: 'h', emailVerifiedAt: new Date() },
  });
}

async function team(name: string, members: { id: string }[], creatorId: string) {
  return prisma.team.create({
    data: {
      name,
      category: 'INTERMEDIATE',
      createdByUserId: creatorId,
      members: { create: members.map((m) => ({ userId: m.id })) },
    },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('inviteTeam + acceptInvitation team branch', () => {
  it('seeds 2 host members on createOpen with hostTeamId', async () => {
    const captain = await user('Captain', `cap-${Date.now()}`);
    const partner = await user('Partner', `par-${Date.now()}`);
    const t = await team('Halcones', [{ id: captain.id }, { id: partner.id }], captain.id);

    const m = await IndependentMatchService.createOpen({
      organizerId: captain.id,
      name: 'Sábado',
      visibility: 'PUBLIC',
      hostTeamId: t.id,
      maxPlayers: 4,
    });

    const ps = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: m.id, status: 'ACCEPTED' },
    });
    expect(ps.map((p) => p.userId).sort()).toEqual([captain.id, partner.id].sort());
    expect(m.hostTeamId).toBe(t.id);
  });

  it('inviteTeam blocks when fewer than 2 slots remain', async () => {
    const cap = await user('Cap', `cap-${Date.now()}`);
    const inv1 = await user('I1', `i1-${Date.now()}`);
    const inv2 = await user('I2', `i2-${Date.now()}`);
    const otherCap = await user('OC', `oc-${Date.now()}`);
    const otherPartner = await user('OP', `op-${Date.now()}`);
    const otherTeam = await team('Otro', [{ id: otherCap.id }, { id: otherPartner.id }], otherCap.id);

    const m = await IndependentMatchService.createOpen({
      organizerId: cap.id,
      name: 'Match',
      visibility: 'PRIVATE',
      maxPlayers: 4,
    });
    await prisma.independentMatchParticipant.createMany({
      data: [
        { independentMatchId: m.id, userId: inv1.id, status: 'ACCEPTED' },
        { independentMatchId: m.id, userId: inv2.id, status: 'ACCEPTED' },
      ],
    });

    await expect(
      IndependentMatchService.inviteTeam(m.id, cap.id, otherTeam.id),
    ).rejects.toThrow(/dos huecos/i);
  });

  it('team accept fills 2 slots and confirms', async () => {
    const cap = await user('Cap', `cap-${Date.now()}`);
    const inv = await user('Inv', `inv-${Date.now()}`);
    const otherCap = await user('OC', `oc-${Date.now()}`);
    const otherPartner = await user('OP', `op-${Date.now()}`);
    const otherTeam = await team('Otro', [{ id: otherCap.id }, { id: otherPartner.id }], otherCap.id);

    const m = await IndependentMatchService.createOpen({
      organizerId: cap.id,
      name: 'M',
      visibility: 'PRIVATE',
      maxPlayers: 4,
    });
    await prisma.independentMatchParticipant.create({
      data: { independentMatchId: m.id, userId: inv.id, status: 'ACCEPTED' },
    });

    await IndependentMatchService.inviteTeam(m.id, cap.id, otherTeam.id);

    const invitation = await prisma.independentMatchInvitation.findFirstOrThrow({
      where: { matchId: m.id, invitedTeamId: otherTeam.id },
    });
    const { SignedTokenService, SignedTokenPurpose } = await import('@/shared/auth/signed-tokens');
    const token = await SignedTokenService.issue({
      purpose: SignedTokenPurpose.INDEPENDENT_MATCH_INVITE,
      subjectId: invitation.id,
      ttlSeconds: 60,
    });

    await IndependentMatchService.acceptInvitation(token, otherCap.id);

    const ps = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: m.id, status: 'ACCEPTED' },
    });
    expect(ps).toHaveLength(4);
    expect(ps.map((p) => p.userId).sort()).toEqual([cap.id, inv.id, otherCap.id, otherPartner.id].sort());

    const updated = await prisma.independentMatch.findUniqueOrThrow({ where: { id: m.id } });
    expect(updated.status).toBe('CONFIRMED');
  });
});
