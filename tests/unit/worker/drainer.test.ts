import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma so the drainer's JobDeadLetter writes don't hit a real DB.
vi.mock('@/shared/db/client', () => ({
  prisma: {
    jobDeadLetter: { create: vi.fn().mockResolvedValue({}) },
  },
}));

// Mock the noop handler so we can control success / failure per test.
const noopHandlerMock = vi.fn();
vi.mock('@/worker/handlers/noop', () => ({
  noopHandler: (data: unknown) => noopHandlerMock(data),
}));

// Stub out the rest with handlers that always succeed (return undefined).
vi.mock('@/worker/handlers/send-email', () => ({ sendEmailHandler: vi.fn() }));
vi.mock('@/worker/handlers/session-cleanup', () => ({ sessionCleanupHandler: vi.fn() }));
vi.mock('@/worker/handlers/anonymize-user', () => ({ anonymizeUserHandler: vi.fn() }));
vi.mock('@/worker/handlers/match-auto-approve-result', () => ({ matchAutoApproveResultHandler: vi.fn() }));
vi.mock('@/worker/handlers/generate-match-commentary', () => ({ generateMatchCommentaryHandler: vi.fn() }));
vi.mock('@/worker/handlers/league-finalize', () => ({ leagueFinalizeHandler: vi.fn() }));

import { drainPendingJobs } from '@/worker/drainer';

interface FakeJob {
  id: string;
  name: string;
  data: Record<string, unknown>;
  retryCount?: number;
  retryLimit?: number;
}

function makeFakeBoss(queues: Record<string, FakeJob[]>) {
  const completed: string[] = [];
  const failed: Array<{ name: string; id: string; error: string }> = [];

  return {
    async fetch(name: string, _opts?: unknown): Promise<FakeJob[]> {
      const jobs = queues[name] ?? [];
      // Pop everything on each fetch so we don't loop forever.
      queues[name] = [];
      return jobs;
    },
    async complete(name: string, id: string): Promise<void> {
      completed.push(`${name}:${id}`);
    },
    async fail(name: string, id: string, payload: unknown): Promise<void> {
      const error = (payload as { error?: string })?.error ?? '';
      failed.push({ name, id, error });
    },
    _completed: completed,
    _failed: failed,
  };
}

describe('drainPendingJobs', () => {
  beforeEach(() => {
    noopHandlerMock.mockReset();
  });

  it('processes a queued noop job and marks it complete', async () => {
    const boss = makeFakeBoss({
      noop: [{ id: 'j1', name: 'noop', data: { ping: 'hello' }, retryCount: 0, retryLimit: 3 }],
    });
    noopHandlerMock.mockResolvedValue(undefined);

    const stats = await drainPendingJobs(boss as unknown as never, { deadlineMs: 100 });

    expect(noopHandlerMock).toHaveBeenCalledWith({ ping: 'hello' });
    expect(boss._completed).toContain('noop:j1');
    expect(stats.processed).toBe(1);
    expect(stats.failed).toBe(0);
  });

  it('records a failure to JobDeadLetter and calls boss.fail', async () => {
    const boss = makeFakeBoss({
      noop: [{ id: 'j2', name: 'noop', data: { ping: 'fail' }, retryCount: 2, retryLimit: 3 }],
    });
    noopHandlerMock.mockRejectedValue(new Error('boom'));

    const stats = await drainPendingJobs(boss as unknown as never, { deadlineMs: 100 });

    expect(stats.processed).toBe(0);
    expect(stats.failed).toBe(1);
    expect(stats.deadLettered).toBe(1); // willRetry === false (retryCount + 1 >= retryLimit)
    expect(boss._failed).toEqual([
      expect.objectContaining({ name: 'noop', id: 'j2', error: 'boom' }),
    ]);
  });

  it('strips __requestId from the payload before calling the handler', async () => {
    const boss = makeFakeBoss({
      noop: [
        {
          id: 'j3',
          name: 'noop',
          data: { ping: 'with-ctx', __requestId: 'req-1' },
          retryCount: 0,
          retryLimit: 3,
        },
      ],
    });
    noopHandlerMock.mockResolvedValue(undefined);

    await drainPendingJobs(boss as unknown as never, { deadlineMs: 100 });

    expect(noopHandlerMock).toHaveBeenCalledWith({ ping: 'with-ctx' });
    const [call] = noopHandlerMock.mock.calls;
    expect((call?.[0] as Record<string, unknown> | undefined)?.__requestId).toBeUndefined();
  });

  it('honours the deadline and exits early when no work is left', async () => {
    const boss = makeFakeBoss({});
    const stats = await drainPendingJobs(boss as unknown as never, { deadlineMs: 100 });
    expect(stats.processed).toBe(0);
    expect(stats.failed).toBe(0);
  });
});
