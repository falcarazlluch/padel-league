import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { UserSearchService } from '@/modules/users';

const prisma = testPrisma();

async function createUser(name: string, suffix: string) {
  return prisma.user.create({
    data: { name, email: `${suffix}@t.com`, passwordHash: 'hash', emailVerifiedAt: new Date() },
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('UserSearchService.searchCandidates', () => {
  it('excludes self, current members and pending invitees', async () => {
    const owner = await createUser('Owner', `own-${Date.now()}`);
    const member = await createUser('Other Member', `mem-${Date.now()}`);
    const pending = await createUser('Juan Pendiente', `pen-${Date.now()}`);
    const candidate = await createUser('Juan Candidato', `cand-${Date.now()}`);
    const noise = await createUser('Pedro', `pedro-${Date.now()}`);

    const team = await prisma.team.create({
      data: {
        name: 'T1',
        category: 'INTERMEDIATE',
        createdByUserId: owner.id,
        members: { create: [{ userId: owner.id }, { userId: member.id }] },
      },
    });
    await prisma.teamInvitation.create({
      data: {
        teamId: team.id,
        invitedUserId: pending.id,
        invitedByUserId: owner.id,
        status: 'PENDING',
      },
    });

    const rows = await UserSearchService.searchCandidates({
      q: 'jua',
      teamId: team.id,
      callerId: owner.id,
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(candidate.id);
    expect(ids).not.toContain(owner.id);
    expect(ids).not.toContain(member.id);
    expect(ids).not.toContain(pending.id);
    expect(ids).not.toContain(noise.id);
  });

  it('matches accent- and case-insensitively', async () => {
    const owner = await createUser('Owner', `own-${Date.now()}`);
    const cand = await createUser('José Marín', `jose-${Date.now()}`);
    const team = await prisma.team.create({
      data: {
        name: 'T2',
        category: 'INTERMEDIATE',
        createdByUserId: owner.id,
        members: { create: { userId: owner.id } },
      },
    });

    const rows = await UserSearchService.searchCandidates({
      q: 'jose',
      teamId: team.id,
      callerId: owner.id,
    });
    expect(rows.map((r) => r.id)).toContain(cand.id);
  });

  it('caps at 10 results', async () => {
    const owner = await createUser('Owner', `own-${Date.now()}`);
    for (let i = 0; i < 15; i++) await createUser(`Test User ${i}`, `t${i}-${Date.now()}`);
    const team = await prisma.team.create({
      data: {
        name: 'T3',
        category: 'INTERMEDIATE',
        createdByUserId: owner.id,
        members: { create: { userId: owner.id } },
      },
    });

    const rows = await UserSearchService.searchCandidates({
      q: 'test',
      teamId: team.id,
      callerId: owner.id,
    });
    expect(rows).toHaveLength(10);
  });

  it('returns only id, name, avatarUrl', async () => {
    const owner = await createUser('Owner', `own-${Date.now()}`);
    await createUser('Juana', `juana-${Date.now()}`);
    const team = await prisma.team.create({
      data: {
        name: 'T4',
        category: 'INTERMEDIATE',
        createdByUserId: owner.id,
        members: { create: { userId: owner.id } },
      },
    });

    const rows = await UserSearchService.searchCandidates({
      q: 'juan',
      teamId: team.id,
      callerId: owner.id,
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['avatarUrl', 'id', 'name']);
    }
  });

  it('excludes soft-deleted users', async () => {
    const owner = await createUser('Owner', `own-${Date.now()}`);
    const deleted = await createUser('Juan Borrado', `del-${Date.now()}`);
    await prisma.user.update({
      where: { id: deleted.id },
      data: { deletedAt: new Date() },
    });
    const team = await prisma.team.create({
      data: {
        name: 'T5',
        category: 'INTERMEDIATE',
        createdByUserId: owner.id,
        members: { create: { userId: owner.id } },
      },
    });

    const rows = await UserSearchService.searchCandidates({
      q: 'jua',
      teamId: team.id,
      callerId: owner.id,
    });
    expect(rows.map((r) => r.id)).not.toContain(deleted.id);
  });
});
