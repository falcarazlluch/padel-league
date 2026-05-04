import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { IndependentMatchService } from '@/modules/independent-matches';

const prisma = testPrisma();

let counter = 0;
function uniq(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

async function createUser(name: string, emailSeed: string) {
  return prisma.user.create({
    data: {
      name,
      email: `${uniq(emailSeed)}@test.com`,
      passwordHash: 'hash',
      emailVerifiedAt: new Date(),
    },
  });
}

async function createOpenMatch(
  organizerId: string,
  overrides: Partial<{
    name: string;
    visibility: 'PUBLIC' | 'PRIVATE';
    maxPlayers: 2 | 4;
    scheduledAt: Date | undefined;
  }> = {},
) {
  return IndependentMatchService.createOpen({
    organizerId,
    name: overrides.name ?? 'Test partido',
    visibility: overrides.visibility ?? 'PUBLIC',
    maxPlayers: overrides.maxPlayers ?? 4,
    scheduledAt: overrides.scheduledAt,
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('IndependentMatchService — create + join', () => {
  it('creates an OPEN match and seeds the organizer as a participant', async () => {
    const organizer = await createUser('Organizer', 'org');
    const match = await createOpenMatch(organizer.id);

    expect(match.status).toBe('OPEN');

    const participants = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: match.id, status: 'ACCEPTED' },
    });
    expect(participants).toHaveLength(1);
    expect(participants[0]!.userId).toBe(organizer.id);
  });

  it('joinPublicMatch confirms the match when the last slot is filled', async () => {
    const organizer = await createUser('Org', 'org');
    const match = await createOpenMatch(organizer.id, { maxPlayers: 2 });

    const joiner = await createUser('Joiner', 'joiner');
    await IndependentMatchService.joinPublicMatch(match.id, joiner.id);

    const updated = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(updated?.status).toBe('CONFIRMED');
  });

  it('joinPublicMatch rejects a non-public match', async () => {
    const organizer = await createUser('Org', 'org');
    const match = await createOpenMatch(organizer.id, { visibility: 'PRIVATE' });

    const joiner = await createUser('Joiner', 'joiner');
    await expect(
      IndependentMatchService.joinPublicMatch(match.id, joiner.id),
    ).rejects.toThrow(/no es público/i);
  });

  it('joinPublicMatch rejects a past match', async () => {
    const organizer = await createUser('Org', 'org');
    const past = new Date(Date.now() - 86_400_000);
    const match = await createOpenMatch(organizer.id, { scheduledAt: past });

    const joiner = await createUser('Joiner', 'joiner');
    await expect(
      IndependentMatchService.joinPublicMatch(match.id, joiner.id),
    ).rejects.toThrow(/ya ha pasado/i);
  });
});

describe('IndependentMatchService — invite-and-accept flow', () => {
  it('inviteUser + acceptPendingInvitationByMatchId adds the user as participant', async () => {
    const organizer = await createUser('Org', 'org');
    const invitee = await createUser('Invitee', 'inv');
    const match = await createOpenMatch(organizer.id, { maxPlayers: 4 });

    await IndependentMatchService.inviteUser(match.id, organizer.id, invitee.id);
    await IndependentMatchService.acceptPendingInvitationByMatchId(match.id, invitee.id);

    const participants = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: match.id, status: 'ACCEPTED' },
    });
    expect(participants.map((p) => p.userId).sort()).toEqual([organizer.id, invitee.id].sort());
  });

  it('rejectPendingInvitationByMatchId removes the invitation', async () => {
    const organizer = await createUser('Org', 'org');
    const invitee = await createUser('Invitee', 'inv');
    const match = await createOpenMatch(organizer.id);

    await IndependentMatchService.inviteUser(match.id, organizer.id, invitee.id);
    await IndependentMatchService.rejectPendingInvitationByMatchId(match.id, invitee.id);

    const remaining = await prisma.independentMatchInvitation.findMany({
      where: { matchId: match.id },
    });
    expect(remaining).toHaveLength(0);
  });

  it('inviteTeam refuses a past match (regression: assertMatchNotPast was missing)', async () => {
    const organizer = await createUser('Org', 'org');
    const past = new Date(Date.now() - 86_400_000);
    const match = await createOpenMatch(organizer.id, { scheduledAt: past, maxPlayers: 4 });

    const teamMate1 = await createUser('TM1', 'tm1');
    const teamMate2 = await createUser('TM2', 'tm2');
    const team = await prisma.team.create({
      data: {
        name: uniq('Equipo'),
        createdByUserId: teamMate1.id,
        members: { create: [{ userId: teamMate1.id }, { userId: teamMate2.id }] },
      },
    });

    await expect(
      IndependentMatchService.inviteTeam(match.id, organizer.id, team.id),
    ).rejects.toThrow(/ya ha pasado/i);
  });

  it('accept on a CONFIRMED match throws MATCH_CONFIRMED (regression guard)', async () => {
    const organizer = await createUser('Org', 'org');
    const filler1 = await createUser('F1', 'f1');
    const filler2 = await createUser('F2', 'f2');
    const filler3 = await createUser('F3', 'f3');
    const match = await createOpenMatch(organizer.id, { maxPlayers: 4 });

    // Fill the match.
    await IndependentMatchService.joinPublicMatch(match.id, filler1.id);
    await IndependentMatchService.joinPublicMatch(match.id, filler2.id);
    await IndependentMatchService.joinPublicMatch(match.id, filler3.id);

    const updated = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(updated?.status).toBe('CONFIRMED');

    // Issue an invitation BEFORE the match was full would normally have been
    // accept-able, but an invitation for a now-CONFIRMED match must fail with
    // a clear MATCH_CONFIRMED error instead of falling through to MATCH_FULL.
    const tooLate = await createUser('Late', 'late');
    // Simulate a stale invitation by inserting one directly (the service
    // would normally have prevented this via inviteUser's status check).
    await prisma.independentMatchInvitation.create({
      data: {
        matchId: match.id,
        invitedUserId: tooLate.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await expect(
      IndependentMatchService.acceptPendingInvitationByMatchId(match.id, tooLate.id),
    ).rejects.toThrow(/confirmado/i);
  });
});

describe('IndependentMatchService — leaveMatch + cancelMatch + updateScheduledAt', () => {
  it('leaveMatch reverts a CONFIRMED match back to OPEN', async () => {
    const organizer = await createUser('Org', 'org');
    const second = await createUser('Second', 'second');
    const match = await createOpenMatch(organizer.id, { maxPlayers: 2 });
    await IndependentMatchService.joinPublicMatch(match.id, second.id);

    const beforeLeave = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(beforeLeave?.status).toBe('CONFIRMED');

    await IndependentMatchService.leaveMatch(match.id, second.id);

    const after = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(after?.status).toBe('OPEN');
    const remaining = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: match.id, status: 'ACCEPTED' },
    });
    expect(remaining.map((p) => p.userId)).toEqual([organizer.id]);
  });

  it('leaveMatch rejects the organizer (must cancel instead)', async () => {
    const organizer = await createUser('Org', 'org');
    const match = await createOpenMatch(organizer.id);

    await expect(
      IndependentMatchService.leaveMatch(match.id, organizer.id),
    ).rejects.toThrow(/cancelar/i);
  });

  it('cancelMatch flips status to CANCELLED', async () => {
    const organizer = await createUser('Org', 'org');
    const match = await createOpenMatch(organizer.id);

    await IndependentMatchService.cancelMatch(match.id, organizer.id);

    const after = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(after?.status).toBe('CANCELLED');
  });

  it('cancelMatch rejects a non-organizer caller', async () => {
    const organizer = await createUser('Org', 'org');
    const stranger = await createUser('Stranger', 'str');
    const match = await createOpenMatch(organizer.id);

    await expect(
      IndependentMatchService.cancelMatch(match.id, stranger.id),
    ).rejects.toThrow(/organizador/i);
  });

  it('updateScheduledAt updates the value and is idempotent on equal values', async () => {
    const organizer = await createUser('Org', 'org');
    const match = await createOpenMatch(organizer.id);

    const future = new Date(Date.now() + 86_400_000);
    await IndependentMatchService.updateScheduledAt(match.id, organizer.id, future);

    const after = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(after?.scheduledAt?.getTime()).toBe(future.getTime());

    // No-op when called with the same value.
    await IndependentMatchService.updateScheduledAt(match.id, organizer.id, future);
    const after2 = await prisma.independentMatch.findUnique({ where: { id: match.id } });
    expect(after2?.updatedAt.getTime()).toBe(after?.updatedAt.getTime());
  });

  it('updateScheduledAt rejects a date in the past', async () => {
    const organizer = await createUser('Org', 'org');
    const match = await createOpenMatch(organizer.id);

    await expect(
      IndependentMatchService.updateScheduledAt(match.id, organizer.id, new Date(Date.now() - 1000)),
    ).rejects.toThrow(/pasado/i);
  });
});

describe('IndependentMatchService — chat', () => {
  it('postChatMessage stores a message + listChatMessages returns it for participants', async () => {
    const organizer = await createUser('Org', 'org');
    const second = await createUser('Second', 'second');
    const match = await createOpenMatch(organizer.id, { maxPlayers: 2 });
    await IndependentMatchService.joinPublicMatch(match.id, second.id);

    await IndependentMatchService.postChatMessage(match.id, organizer.id, 'Hola equipo');
    const messages = await IndependentMatchService.listChatMessages(match.id, second.id);

    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toBe('Hola equipo');
    expect(messages[0]!.userId).toBe(organizer.id);
  });

  it('listChatMessages rejects non-participants', async () => {
    const organizer = await createUser('Org', 'org');
    const match = await createOpenMatch(organizer.id);
    const outsider = await createUser('Outsider', 'out');

    await expect(
      IndependentMatchService.listChatMessages(match.id, outsider.id),
    ).rejects.toThrow(/acceso/i);
  });

  it('postChatMessage rejects empty / oversize content', async () => {
    const organizer = await createUser('Org', 'org');
    const match = await createOpenMatch(organizer.id);

    await expect(
      IndependentMatchService.postChatMessage(match.id, organizer.id, '   '),
    ).rejects.toThrow(/vacío/i);
    await expect(
      IndependentMatchService.postChatMessage(match.id, organizer.id, 'x'.repeat(2001)),
    ).rejects.toThrow(/Máximo 2000/);
  });
});
