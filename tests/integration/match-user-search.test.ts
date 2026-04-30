import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { UserSearchService } from '@/modules/users';
import { IndependentMatchService } from '@/modules/independent-matches';

const prisma = testPrisma();

async function user(name: string, suffix: string) {
  return prisma.user.create({
    data: { name, email: `${suffix}@t.com`, passwordHash: 'h', emailVerifiedAt: new Date() },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('UserSearchService.searchCandidatesForMatch', () => {
  it('excludes self, current participants, and pending invitees', async () => {
    const org = await user('Owner', `own-${Date.now()}`);
    const inside = await user('Juan Dentro', `in-${Date.now()}`);
    const pending = await user('Juan Pending', `pen-${Date.now()}`);
    const open = await user('Juan Libre', `ok-${Date.now()}`);
    const noise = await user('Pedro', `pedro-${Date.now()}`);

    const m = await IndependentMatchService.createOpen({
      organizerId: org.id,
      name: 'M',
      visibility: 'PRIVATE',
      maxPlayers: 4,
    });
    await prisma.independentMatchParticipant.create({
      data: { independentMatchId: m.id, userId: inside.id, status: 'ACCEPTED' },
    });
    await IndependentMatchService.inviteUser(m.id, org.id, pending.id);

    const rows = await UserSearchService.searchCandidatesForMatch({
      q: 'jua',
      matchId: m.id,
      callerId: org.id,
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(org.id);
    expect(ids).not.toContain(inside.id);
    expect(ids).not.toContain(pending.id);
    expect(ids).not.toContain(noise.id);
  });
});
