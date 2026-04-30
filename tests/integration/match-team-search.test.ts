import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';
import { TeamSearchService } from '@/modules/teams';
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

describe('TeamSearchService.searchInvitableForMatch', () => {
  it('excludes host team and pending invited teams', async () => {
    const cap = await user('Cap', `cap-${Date.now()}`);
    const par = await user('Par', `par-${Date.now()}`);
    const host = await team('Halcones', [{ id: cap.id }, { id: par.id }], cap.id);

    const c1 = await user('C1', `c1-${Date.now()}`);
    const c2 = await user('C2', `c2-${Date.now()}`);
    const candidate = await team('Tigres', [{ id: c1.id }, { id: c2.id }], c1.id);

    const p1 = await user('P1', `p1-${Date.now()}`);
    const p2 = await user('P2', `p2-${Date.now()}`);
    const pending = await team('Lobos', [{ id: p1.id }, { id: p2.id }], p1.id);

    const m = await IndependentMatchService.createOpen({
      organizerId: cap.id,
      name: 'M',
      visibility: 'PRIVATE',
      hostTeamId: host.id,
      maxPlayers: 4,
    });
    await IndependentMatchService.inviteTeam(m.id, cap.id, pending.id);

    const rows = await TeamSearchService.searchInvitableForMatch({
      q: 't',
      matchId: m.id,
      callerId: cap.id,
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(candidate.id);
    expect(ids).not.toContain(host.id);
    expect(ids).not.toContain(pending.id);
  });

  it('returns memberCount and accent-insensitive matching', async () => {
    const cap = await user('Cap', `cap-${Date.now()}`);
    const m1 = await user('M1', `m1-${Date.now()}`);
    const m2 = await user('M2', `m2-${Date.now()}`);
    const t = await team('Águilas Solitarias', [{ id: m1.id }, { id: m2.id }], m1.id);

    const match = await IndependentMatchService.createOpen({
      organizerId: cap.id,
      name: 'M',
      visibility: 'PRIVATE',
      maxPlayers: 4,
    });

    const rows = await TeamSearchService.searchInvitableForMatch({
      q: 'aguilas',
      matchId: match.id,
      callerId: cap.id,
    });
    expect(rows.map((r) => r.id)).toContain(t.id);
    const found = rows.find((r) => r.id === t.id);
    expect(found?.memberCount).toBe(2);
  });
});
