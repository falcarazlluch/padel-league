import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeagueNotificationService } from '@/modules/leagues';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    league: { findUnique: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    league: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    user: { findMany: ReturnType<typeof vi.fn> };
    notification: { createMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

function passThroughTx(prisma: Awaited<ReturnType<typeof getPrisma>>) {
  prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      league: { update: prisma.league.update },
      notification: { createMany: prisma.notification.createMany },
    }),
  );
}

describe('LeagueNotificationService.notifyRegistrationOpen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifies every matching user and marks the league as notified', async () => {
    const prisma = await getPrisma();
    prisma.league.findUnique.mockResolvedValue({
      id: 'l1',
      name: 'Liga Otoño',
      slug: 'liga-otono',
      category: 'INTERMEDIATE',
      registrationOpenNotifiedAt: null,
    });
    prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
    passThroughTx(prisma);

    const result = await LeagueNotificationService.notifyRegistrationOpen('l1');

    expect(result).toEqual({ recipients: 2 });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { category: 'INTERMEDIATE', deletedAt: null },
      select: { id: true },
    });
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany.mock.calls[0]![0].data).toHaveLength(2);
    expect(prisma.league.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { registrationOpenNotifiedAt: expect.any(Date) },
    });
  });

  it('is a no-op when the league already has registrationOpenNotifiedAt set', async () => {
    const prisma = await getPrisma();
    prisma.league.findUnique.mockResolvedValue({
      id: 'l1',
      name: 'Liga Otoño',
      slug: 'liga-otono',
      category: 'INTERMEDIATE',
      registrationOpenNotifiedAt: new Date('2026-04-01'),
    });

    const result = await LeagueNotificationService.notifyRegistrationOpen('l1');

    expect(result).toEqual({ recipients: 0 });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.league.update).not.toHaveBeenCalled();
  });

  it('marks the league notified even when no users match', async () => {
    const prisma = await getPrisma();
    prisma.league.findUnique.mockResolvedValue({
      id: 'l1',
      name: 'Liga Otoño',
      slug: 'liga-otono',
      category: 'ADVANCED',
      registrationOpenNotifiedAt: null,
    });
    prisma.user.findMany.mockResolvedValue([]);
    passThroughTx(prisma);

    const result = await LeagueNotificationService.notifyRegistrationOpen('l1');

    expect(result).toEqual({ recipients: 0 });
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.league.update).toHaveBeenCalledTimes(1);
  });

  it('returns 0 recipients when the league does not exist', async () => {
    const prisma = await getPrisma();
    prisma.league.findUnique.mockResolvedValue(null);

    const result = await LeagueNotificationService.notifyRegistrationOpen('missing');

    expect(result).toEqual({ recipients: 0 });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.league.update).not.toHaveBeenCalled();
  });
});
