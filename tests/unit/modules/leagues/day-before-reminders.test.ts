import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma BEFORE importing the service.
const findManyMock = vi.fn();
const updateMock = vi.fn();
vi.mock('@/shared/db/client', () => ({
  prisma: {
    match: {
      findMany: (...a: unknown[]) => findManyMock(...a),
      update: (...a: unknown[]) => updateMock(...a),
    },
  },
}));

// Stub the notification service so we can capture call shape.
const createManyMock = vi.fn(() => Promise.resolve());
vi.mock('@/modules/notifications', () => ({
  NotificationService: {
    createMany: (...a: unknown[]) => createManyMock(...a),
  },
}));

vi.mock('@/shared/logger', () => ({ logger: () => ({ warn: () => {}, info: () => {}, error: () => {} }) }));

import { runDayBeforeRemindersSweep } from '@/modules/leagues/application/match-reminders';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runDayBeforeRemindersSweep', () => {
  it('sends a notification to all 4 players (2 per team) of each eligible match', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: 'm1',
        scheduledAt: new Date(),
        teamAId: 'tA',
        teamBId: 'tB',
        league: { name: 'Liga Otoño', slug: 'liga-otono' },
        teamA: { name: 'Equipo A', members: [{ userId: 'u1' }, { userId: 'u2' }] },
        teamB: { name: 'Equipo B', members: [{ userId: 'u3' }, { userId: 'u4' }] },
      },
    ]);

    const result = await runDayBeforeRemindersSweep();

    expect(result.matchesProcessed).toBe(1);
    expect(result.sent).toBe(4);
    expect(createManyMock).toHaveBeenCalledTimes(1);
    const arg = createManyMock.mock.calls[0]?.[0] as Array<{ userId: string; type: string; body: string }>;
    expect(arg).toHaveLength(4);
    expect(arg.map((n) => n.userId).sort()).toEqual(['u1', 'u2', 'u3', 'u4']);
    expect(arg[0]?.body).toContain('Equipo A');
    expect(arg[0]?.body).toContain('Equipo B');
  });

  it('marks the match as reminded so subsequent sweeps skip it', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: 'm1',
        scheduledAt: new Date(),
        teamAId: 'tA',
        teamBId: 'tB',
        league: { name: 'L', slug: 'l' },
        teamA: { name: 'A', members: [{ userId: 'u1' }] },
        teamB: { name: 'B', members: [{ userId: 'u2' }] },
      },
    ]);
    await runDayBeforeRemindersSweep();
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: expect.objectContaining({ dayBeforeReminderSentAt: expect.any(Date) }),
    });
  });

  it('does nothing when there are no eligible matches', async () => {
    findManyMock.mockResolvedValueOnce([]);
    const result = await runDayBeforeRemindersSweep();
    expect(result).toEqual({ sent: 0, matchesProcessed: 0 });
    expect(createManyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('uses a deterministic motivational line per matchId (no flapping)', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'fixed-match-id',
        scheduledAt: new Date(),
        teamAId: 'tA',
        teamBId: 'tB',
        league: { name: 'L', slug: 'l' },
        teamA: { name: 'A', members: [{ userId: 'u1' }] },
        teamB: { name: 'B', members: [{ userId: 'u2' }] },
      },
    ]);
    await runDayBeforeRemindersSweep();
    const firstBody = (createManyMock.mock.calls[0]?.[0] as Array<{ body: string }>)[0]?.body;
    createManyMock.mockClear();
    updateMock.mockClear();
    await runDayBeforeRemindersSweep();
    const secondBody = (createManyMock.mock.calls[0]?.[0] as Array<{ body: string }>)[0]?.body;
    expect(secondBody).toBe(firstBody);
  });
});
