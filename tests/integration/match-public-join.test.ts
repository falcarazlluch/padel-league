import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
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

describe('joinPublicMatch', () => {
  it('lets a user join a public match with free slot', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    const joiner = await user('Joiner', `j-${Date.now()}`);
    const m = await IndependentMatchService.createOpen({
      organizerId: org.id,
      name: 'P',
      visibility: 'PUBLIC',
      maxPlayers: 2,
    });

    await IndependentMatchService.joinPublicMatch(m.id, joiner.id);

    const ps = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: m.id, status: 'ACCEPTED' },
    });
    expect(ps.map((p) => p.userId).sort()).toEqual([org.id, joiner.id].sort());

    const updated = await prisma.independentMatch.findUniqueOrThrow({ where: { id: m.id } });
    expect(updated.status).toBe('CONFIRMED');
  });

  it('rejects join on a private match', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    const joiner = await user('Joiner', `j-${Date.now()}`);
    const m = await IndependentMatchService.createOpen({
      organizerId: org.id,
      name: 'P',
      visibility: 'PRIVATE',
      maxPlayers: 4,
    });

    await expect(
      IndependentMatchService.joinPublicMatch(m.id, joiner.id),
    ).rejects.toThrow(/no es público/i);
  });

  it('only one of two concurrent joins for the last slot succeeds', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    const a = await user('A', `a-${Date.now()}`);
    const b = await user('B', `b-${Date.now()}`);
    const m = await IndependentMatchService.createOpen({
      organizerId: org.id,
      name: 'Race',
      visibility: 'PUBLIC',
      maxPlayers: 2,
    });

    const results = await Promise.allSettled([
      IndependentMatchService.joinPublicMatch(m.id, a.id),
      IndependentMatchService.joinPublicMatch(m.id, b.id),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const fail = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);

    const ps = await prisma.independentMatchParticipant.findMany({
      where: { independentMatchId: m.id, status: 'ACCEPTED' },
    });
    expect(ps).toHaveLength(2);
  });
});

describe('listOpen visibility filter', () => {
  it('omits private matches', async () => {
    const org = await user('Org', `org-${Date.now()}`);
    await IndependentMatchService.createOpen({ organizerId: org.id, name: 'Pub', visibility: 'PUBLIC', maxPlayers: 4 });
    await IndependentMatchService.createOpen({ organizerId: org.id, name: 'Priv', visibility: 'PRIVATE', maxPlayers: 4 });
    const list = await IndependentMatchService.listOpen();
    expect(list.map((m) => m.name)).toEqual(['Pub']);
  });
});
