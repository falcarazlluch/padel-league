import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchPhotoService } from '@/modules/match-photos';

vi.mock('@vercel/blob', () => ({
  del: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/db/client', () => ({
  prisma: {
    match: { findUnique: vi.fn() },
    independentMatch: { findUnique: vi.fn() },
    matchPhoto: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    matchPhotoComment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    matchPhotoLike: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    notification: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

async function getPrisma() {
  const { prisma } = await import('@/shared/db/client');
  return prisma as unknown as {
    match: { findUnique: ReturnType<typeof vi.fn> };
    independentMatch: { findUnique: ReturnType<typeof vi.fn> };
    matchPhoto: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    matchPhotoComment: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    matchPhotoLike: {
      deleteMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    user: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    notification: { createMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

const leagueMatchWithU1 = {
  teamA: { members: [{ userId: 'u1' }] },
  teamB: { members: [{ userId: 'u2' }] },
};

describe('MatchPhotoService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when caller is not a participant', async () => {
    const prisma = await getPrisma();
    prisma.match.findUnique.mockResolvedValue(leagueMatchWithU1);

    await expect(
      MatchPhotoService.create({
        matchId: 'm1',
        kind: 'league',
        uploaderUserId: 'u-stranger',
        blobUrl: 'https://blob/x.jpg',
      }),
    ).rejects.toThrow(/participantes/i);
  });

  it('rejects when match does not exist', async () => {
    const prisma = await getPrisma();
    prisma.match.findUnique.mockResolvedValue(null);

    await expect(
      MatchPhotoService.create({
        matchId: 'm1',
        kind: 'league',
        uploaderUserId: 'u1',
        blobUrl: 'https://blob/x.jpg',
      }),
    ).rejects.toThrow(/Partido no encontrado/i);
  });

  it('caps photos per match (PHOTO_LIMIT_REACHED) — count + create run inside a serializable transaction', async () => {
    const prisma = await getPrisma();
    prisma.match.findUnique.mockResolvedValue(leagueMatchWithU1);
    // The cap check happens inside the TX now, so we provide a tx with a
    // `count` mock that returns the cap.
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      const fn = cb as (tx: typeof prisma) => Promise<unknown>;
      const tx = {
        matchPhoto: {
          count: vi.fn().mockResolvedValue(30),
          create: vi.fn(),
        },
      } as unknown as typeof prisma;
      return fn(tx);
    });

    await expect(
      MatchPhotoService.create({
        matchId: 'm1',
        kind: 'league',
        uploaderUserId: 'u1',
        blobUrl: 'https://blob/x.jpg',
      }),
    ).rejects.toThrow(/máximo de 30/i);
  });

  it('creates the row and notifies the OTHER participants only', async () => {
    const prisma = await getPrisma();
    prisma.match.findUnique.mockResolvedValue(leagueMatchWithU1);
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      const fn = cb as (tx: typeof prisma) => Promise<unknown>;
      const tx = {
        matchPhoto: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({ id: 'p1' }),
        },
      } as unknown as typeof prisma;
      return fn(tx);
    });
    prisma.user.findUnique.mockResolvedValue({ name: 'Alice' });
    prisma.notification.createMany.mockResolvedValue({ count: 1 });

    const result = await MatchPhotoService.create({
      matchId: 'm1',
      kind: 'league',
      uploaderUserId: 'u1',
      blobUrl: 'https://blob/x.jpg',
    });

    expect(result).toEqual({ id: 'p1' });
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'u2',
          type: 'MATCH_PHOTO_UPLOADED',
          metadata: expect.objectContaining({ photoId: 'p1', matchKind: 'league', matchId: 'm1' }),
        }),
      ],
    });
  });
});

describe('MatchPhotoService.toggleLike', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a like when none exists; returns liked=true with count read inside the TX', async () => {
    const prisma = await getPrisma();
    prisma.matchPhoto.findUnique.mockResolvedValue({
      id: 'p1',
      matchId: 'm1',
      independentMatchId: null,
    });
    prisma.match.findUnique.mockResolvedValue(leagueMatchWithU1);
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      const fn = cb as (tx: typeof prisma) => Promise<unknown>;
      const tx = {
        matchPhotoLike: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn(),
          count: vi.fn().mockResolvedValue(1),
        },
      } as unknown as typeof prisma;
      return fn(tx);
    });

    const result = await MatchPhotoService.toggleLike('p1', 'u1');
    expect(result).toEqual({ liked: true, likeCount: 1 });
  });

  it('removes a like when one exists; returns liked=false', async () => {
    const prisma = await getPrisma();
    prisma.matchPhoto.findUnique.mockResolvedValue({
      id: 'p1',
      matchId: 'm1',
      independentMatchId: null,
    });
    prisma.match.findUnique.mockResolvedValue(leagueMatchWithU1);
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      const fn = cb as (tx: typeof prisma) => Promise<unknown>;
      const tx = {
        matchPhotoLike: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: vi.fn(),
          count: vi.fn().mockResolvedValue(0),
        },
      } as unknown as typeof prisma;
      return fn(tx);
    });

    const result = await MatchPhotoService.toggleLike('p1', 'u1');
    expect(result).toEqual({ liked: false, likeCount: 0 });
  });

  it('rejects toggle from a non-participant', async () => {
    const prisma = await getPrisma();
    prisma.matchPhoto.findUnique.mockResolvedValue({
      id: 'p1',
      matchId: 'm1',
      independentMatchId: null,
    });
    prisma.match.findUnique.mockResolvedValue(leagueMatchWithU1);

    await expect(MatchPhotoService.toggleLike('p1', 'u-stranger')).rejects.toThrow(/participantes/i);
  });
});

describe('MatchPhotoService.addComment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty body', async () => {
    await expect(MatchPhotoService.addComment('p1', 'u1', '   ')).rejects.toThrow(/vacío/i);
  });

  it('rejects body over the max length', async () => {
    const tooLong = 'a'.repeat(501);
    await expect(MatchPhotoService.addComment('p1', 'u1', tooLong)).rejects.toThrow(/500/i);
  });

  it('notifies the photo uploader (not the author) when no @mention is used', async () => {
    const prisma = await getPrisma();
    prisma.matchPhoto.findUnique.mockResolvedValue({
      id: 'p1',
      uploadedByUserId: 'u-uploader',
      matchId: 'm1',
      independentMatchId: null,
    });
    prisma.match.findUnique.mockResolvedValue({
      teamA: { members: [{ userId: 'u-uploader' }] },
      teamB: { members: [{ userId: 'u-author' }] },
    });
    prisma.matchPhotoComment.create.mockResolvedValue({ id: 'c1' });
    prisma.user.findUnique.mockResolvedValue({ name: 'Bob' });
    prisma.notification.createMany.mockResolvedValue({ count: 1 });

    await MatchPhotoService.addComment('p1', 'u-author', 'great photo');

    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'u-uploader',
          type: 'MATCH_PHOTO_COMMENT',
        }),
      ],
    });
  });

  it('emits MATCH_PHOTO_MENTION for resolved @mentions and skips MATCH_PHOTO_COMMENT when uploader is mentioned', async () => {
    const prisma = await getPrisma();
    prisma.matchPhoto.findUnique.mockResolvedValue({
      id: 'p1',
      uploadedByUserId: 'u-uploader',
      matchId: 'm1',
      independentMatchId: null,
    });
    prisma.match.findUnique.mockResolvedValue({
      teamA: { members: [{ userId: 'u-uploader' }] },
      teamB: { members: [{ userId: 'u-author' }] },
    });
    prisma.matchPhotoComment.create.mockResolvedValue({ id: 'c1' });
    // First findUnique: comment author. Then findMany: participant roster.
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-uploader', name: 'Bob' },
      { id: 'u-author', name: 'Alice' },
    ]);
    prisma.user.findUnique.mockResolvedValue({ name: 'Alice' });
    prisma.notification.createMany.mockResolvedValue({ count: 1 });

    await MatchPhotoService.addComment('p1', 'u-author', 'great shot @Bob');

    // Uploader gets a MENTION (not a COMMENT) because they were @-tagged.
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'u-uploader',
          type: 'MATCH_PHOTO_MENTION',
        }),
      ],
    });
  });

  it('skips notifying the author when they comment on their OWN photo and mention nobody', async () => {
    const prisma = await getPrisma();
    prisma.matchPhoto.findUnique.mockResolvedValue({
      id: 'p1',
      uploadedByUserId: 'u-author',
      matchId: 'm1',
      independentMatchId: null,
    });
    prisma.match.findUnique.mockResolvedValue({
      teamA: { members: [{ userId: 'u-author' }] },
      teamB: { members: [{ userId: 'u-other' }] },
    });
    prisma.matchPhotoComment.create.mockResolvedValue({ id: 'c1' });
    prisma.user.findUnique.mockResolvedValue({ name: 'Alice' });
    prisma.notification.createMany.mockResolvedValue({ count: 0 });

    await MatchPhotoService.addComment('p1', 'u-author', 'first!');

    expect(prisma.notification.createMany).toHaveBeenCalledWith({ data: [] });
  });
});

describe('MatchPhotoService.delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects deletion by a non-owner non-admin', async () => {
    const prisma = await getPrisma();
    prisma.matchPhoto.findUnique.mockResolvedValue({
      id: 'p1',
      uploadedByUserId: 'u-uploader',
      blobUrl: 'https://x.public.blob.vercel-storage.com/p1.jpg',
      matchId: 'm1',
      independentMatchId: null,
    });
    prisma.user.findUnique.mockResolvedValue({ role: 'PLAYER' });

    await expect(MatchPhotoService.delete('p1', 'u-other')).rejects.toThrow(/autor o un administrador/i);
  });

  it('allows the owner to delete and removes the underlying blob', async () => {
    const { del } = await import('@vercel/blob');
    const prisma = await getPrisma();
    prisma.matchPhoto.findUnique.mockResolvedValue({
      id: 'p1',
      uploadedByUserId: 'u1',
      blobUrl: 'https://x.public.blob.vercel-storage.com/p1.jpg',
      matchId: 'm1',
      independentMatchId: null,
    });
    prisma.user.findUnique.mockResolvedValue({ role: 'PLAYER' });
    prisma.matchPhoto.delete.mockResolvedValue({});

    await MatchPhotoService.delete('p1', 'u1');
    expect(prisma.matchPhoto.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(del).toHaveBeenCalledWith('https://x.public.blob.vercel-storage.com/p1.jpg');
  });

  it('allows a SUPER_ADMIN to delete any photo', async () => {
    const prisma = await getPrisma();
    prisma.matchPhoto.findUnique.mockResolvedValue({
      id: 'p1',
      uploadedByUserId: 'u-uploader',
      blobUrl: 'https://x.public.blob.vercel-storage.com/p1.jpg',
      matchId: 'm1',
      independentMatchId: null,
    });
    prisma.user.findUnique.mockResolvedValue({ role: 'SUPER_ADMIN' });
    prisma.matchPhoto.delete.mockResolvedValue({});

    await MatchPhotoService.delete('p1', 'u-admin');
    expect(prisma.matchPhoto.delete).toHaveBeenCalled();
  });
});

describe('MatchPhotoService.deleteComment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when caller is no longer a participant of the match (and is not admin)', async () => {
    const prisma = await getPrisma();
    prisma.matchPhotoComment.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'u-author',
      photo: { matchId: 'm1', independentMatchId: null },
    });
    prisma.user.findUnique.mockResolvedValue({ role: 'PLAYER' });
    // Roster no longer contains the comment author — they left their team.
    prisma.match.findUnique.mockResolvedValue({
      teamA: { members: [{ userId: 'u-someone' }] },
      teamB: { members: [{ userId: 'u-other' }] },
    });

    await expect(MatchPhotoService.deleteComment('c1', 'u-author')).rejects.toThrow(/participantes/i);
  });

  it('lets the author delete their own comment when still a participant', async () => {
    const prisma = await getPrisma();
    prisma.matchPhotoComment.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'u-author',
      photo: { matchId: 'm1', independentMatchId: null },
    });
    prisma.user.findUnique.mockResolvedValue({ role: 'PLAYER' });
    prisma.match.findUnique.mockResolvedValue({
      teamA: { members: [{ userId: 'u-author' }] },
      teamB: { members: [{ userId: 'u-other' }] },
    });
    prisma.matchPhotoComment.delete.mockResolvedValue({});

    await MatchPhotoService.deleteComment('c1', 'u-author');
    expect(prisma.matchPhotoComment.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('SUPER_ADMIN bypasses the participant + author checks', async () => {
    const prisma = await getPrisma();
    prisma.matchPhotoComment.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'u-author',
      photo: { matchId: 'm1', independentMatchId: null },
    });
    prisma.user.findUnique.mockResolvedValue({ role: 'SUPER_ADMIN' });
    prisma.matchPhotoComment.delete.mockResolvedValue({});

    await MatchPhotoService.deleteComment('c1', 'u-admin');
    // No participant check happened (we never set match.findUnique mock).
    expect(prisma.match.findUnique).not.toHaveBeenCalled();
    expect(prisma.matchPhotoComment.delete).toHaveBeenCalled();
  });
});
