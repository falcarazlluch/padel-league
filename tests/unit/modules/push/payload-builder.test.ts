import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma BEFORE importing the module under test so the dynamic import in
// resolveHref picks up the stub.
const findMatchMock = vi.fn();
const findLeagueMock = vi.fn();
vi.mock('@/shared/db/client', () => ({
  prisma: {
    match: { findUnique: (...a: unknown[]) => findMatchMock(...a) },
    league: { findUnique: (...a: unknown[]) => findLeagueMock(...a) },
  },
}));

import { buildPushPayload } from '@/modules/push';

describe('buildPushPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMatchMock.mockResolvedValue({ league: { slug: 'liga-otoño' } });
    findLeagueMock.mockResolvedValue({ slug: 'liga-otoño' });
  });

  it('uses generic body for chat to avoid leaking message text on lockscreen', async () => {
    const payload = await buildPushPayload({
      id: 'n1',
      type: 'INDEPENDENT_MATCH_CHAT',
      title: 'Juan ha escrito',
      body: 'Quedamos a las 19h en la pista 3',
      metadata: { matchId: 'm1' },
    });
    expect(payload.body).not.toContain('19h');
    expect(payload.body).toBe('Tienes un mensaje nuevo');
  });

  it('keeps the original body for non-chat types', async () => {
    const payload = await buildPushPayload({
      id: 'n1',
      type: 'INDEPENDENT_MATCH_INVITE',
      title: 'Te han invitado a un partido',
      body: 'Domingo 19h en Real Padel',
      metadata: { matchId: 'm1' },
    });
    expect(payload.body).toBe('Domingo 19h en Real Padel');
  });

  it('builds /jugar URL for independent match types', async () => {
    const payload = await buildPushPayload({
      id: 'n1',
      type: 'INDEPENDENT_MATCH_CONFIRMED',
      title: 'Confirmado',
      body: '',
      metadata: { matchId: 'm-123' },
    });
    expect(payload.url).toBe('/jugar/m-123');
  });

  it('uses notification id as the tag for cross-device coalescing', async () => {
    const payload = await buildPushPayload({
      id: 'notif-xyz',
      type: 'RESULT_CONFIRMED',
      title: 'Resultado',
      body: '',
      metadata: { matchId: 'm1' },
    });
    expect(payload.tag).toBe('notif-xyz');
  });

  it('falls back to /dashboard when href cannot be resolved', async () => {
    const payload = await buildPushPayload({
      id: 'n1',
      type: 'CATEGORY_CHANGE_PROPOSED',
      title: 'Categoría',
      body: '',
      metadata: null,
    });
    expect(payload.url).toBe('/dashboard');
  });

  it('looks up league slug for photo notifications when not in metadata', async () => {
    findMatchMock.mockResolvedValue({ league: { slug: 'mi-liga' } });
    const payload = await buildPushPayload({
      id: 'n1',
      type: 'MATCH_PHOTO_MENTION',
      title: 'Te han mencionado',
      body: '',
      metadata: { matchId: 'm1', matchKind: 'league' },
    });
    expect(payload.url).toBe('/ligas/mi-liga/partidos/m1');
  });
});
