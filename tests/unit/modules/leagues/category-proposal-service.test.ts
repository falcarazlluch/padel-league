import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoryProposalService } from '@/modules/leagues/application/category-proposal-service';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    teamCategoryChangeProposal: { findUnique: vi.fn(), update: vi.fn() },
    team: { update: vi.fn() },
    user: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    teamCategoryChangeProposal: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    team: { update: ReturnType<typeof vi.fn> };
    user: { updateMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

describe('CategoryProposalService — accept syncs members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the team and pushes the new category to every member when accepted', async () => {
    const prisma = await getPrisma();
    prisma.teamCategoryChangeProposal.findUnique.mockResolvedValue({
      id: 'p1',
      teamId: 't1',
      status: 'PROPOSED',
      toCategory: 'ADVANCED',
      team: { id: 't1', members: [{ userId: 'u1' }, { userId: 'u2' }] },
    });
    // $transaction passes a tx object that exposes the same prisma surface used inside.
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        teamCategoryChangeProposal: { update: prisma.teamCategoryChangeProposal.update },
        team: { update: prisma.team.update },
        user: { updateMany: prisma.user.updateMany },
      }),
    );

    await CategoryProposalService.accept('p1', 'u1');

    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { category: 'ADVANCED' },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1', 'u2'] } },
      data: { category: 'ADVANCED' },
    });
  });

  it('does NOT touch team or users when the proposal is rejected', async () => {
    const prisma = await getPrisma();
    prisma.teamCategoryChangeProposal.findUnique.mockResolvedValue({
      id: 'p1',
      teamId: 't1',
      status: 'PROPOSED',
      toCategory: 'ADVANCED',
      team: { id: 't1', members: [{ userId: 'u1' }] },
    });
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        teamCategoryChangeProposal: { update: prisma.teamCategoryChangeProposal.update },
        team: { update: prisma.team.update },
        user: { updateMany: prisma.user.updateMany },
      }),
    );

    await CategoryProposalService.reject('p1', 'u1');

    expect(prisma.team.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
