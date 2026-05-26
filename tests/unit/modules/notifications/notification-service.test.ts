import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/db/client', () => ({
  prisma: {
    notification: {
      create: vi.fn(() => Promise.resolve()),
      createMany: vi.fn(() => Promise.resolve()),
    },
  },
}));

import { NotificationService } from '@/modules/notifications';
import { prisma } from '@/shared/db/client';

const createMock = prisma.notification.create as unknown as ReturnType<typeof vi.fn>;
const createManyMock = prisma.notification.createMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotificationService.create — excludeActorId', () => {
  it('writes the notification when recipient differs from actor', async () => {
    await NotificationService.create(
      {
        userId: 'recipient-1',
        type: 'RESULT_CONFIRMED',
        title: 't',
        body: 'b',
      },
      { excludeActorId: 'actor-1' },
    );
    expect(createMock).toHaveBeenCalledTimes(1);
    expect((createMock.mock.calls[0]?.[0] as { data: { userId: string } }).data.userId).toBe('recipient-1');
  });

  it('skips the write when recipient equals actor', async () => {
    await NotificationService.create(
      {
        userId: 'same-id',
        type: 'RESULT_CONFIRMED',
        title: 't',
        body: 'b',
      },
      { excludeActorId: 'same-id' },
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it('writes normally when excludeActorId is undefined (back-compat)', async () => {
    await NotificationService.create({
      userId: 'u1',
      type: 'RESULT_CONFIRMED',
      title: 't',
      body: 'b',
    });
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationService.createMany — excludeActorId', () => {
  it('filters out the actor from the batch', async () => {
    await NotificationService.createMany(
      [
        { userId: 'u1', type: 'RESULT_CONFIRMED', title: 't', body: 'b' },
        { userId: 'actor', type: 'RESULT_CONFIRMED', title: 't', body: 'b' },
        { userId: 'u2', type: 'RESULT_CONFIRMED', title: 't', body: 'b' },
      ],
      { excludeActorId: 'actor' },
    );
    expect(createManyMock).toHaveBeenCalledTimes(1);
    const arg = createManyMock.mock.calls[0]?.[0] as { data: Array<{ userId: string }> };
    expect(arg.data.map((d) => d.userId).sort()).toEqual(['u1', 'u2']);
  });

  it('skips the write entirely when all recipients are the actor', async () => {
    await NotificationService.createMany(
      [
        { userId: 'actor', type: 'RESULT_CONFIRMED', title: 't', body: 'b' },
        { userId: 'actor', type: 'RESULT_CONFIRMED', title: 't', body: 'b' },
      ],
      { excludeActorId: 'actor' },
    );
    expect(createManyMock).not.toHaveBeenCalled();
  });

  it('writes the full batch when excludeActorId is undefined (back-compat)', async () => {
    await NotificationService.createMany([
      { userId: 'u1', type: 'RESULT_CONFIRMED', title: 't', body: 'b' },
      { userId: 'u2', type: 'RESULT_CONFIRMED', title: 't', body: 'b' },
    ]);
    expect(createManyMock).toHaveBeenCalledTimes(1);
    const arg = createManyMock.mock.calls[0]?.[0] as { data: Array<{ userId: string }> };
    expect(arg.data).toHaveLength(2);
  });
});
