import { prisma } from '@/shared/db/client';
import { z } from 'zod';
import {
  NotFoundError,
  AuthorizationError,
  DomainError,
} from '@/shared/errors';
import { OpenAIProvider } from './openai-provider';
import { buildContext } from './context-builder';
import { buildPrompt, PROMPT_VERSION } from './prompt-builder';
import type { AIProvider } from '../domain/ai-provider';
import type { CommentaryRow, CommentaryType, CommentaryFeedItem } from '../domain/types';

let _provider: AIProvider = OpenAIProvider;

/** Allows tests to inject a fake provider. */
export function __setProviderForTests(provider: AIProvider): void {
  _provider = provider;
}

const editSchema = z.string().trim().min(1, 'El contenido no puede estar vacío.').max(1000, 'Máximo 1000 caracteres.');

async function ensureLeagueAdmin(matchId: string, userId: string): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { league: { select: { createdByUserId: true } } },
  });
  if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  const isLeagueAdmin =
    user?.role === 'LEAGUE_ADMIN' && match.league.createdByUserId === userId;
  if (user?.role !== 'SUPER_ADMIN' && !isLeagueAdmin) {
    throw new AuthorizationError('NOT_LEAGUE_ADMIN', 'Solo el admin de la liga puede gestionar la crónica.');
  }
}

export const MatchCommentaryService = {
  async generate(
    matchId: string,
    type: CommentaryType,
    opts: { regenerate?: boolean } = {},
  ): Promise<void> {
    const existing = await prisma.matchCommentary.findUnique({
      where: { matchId_type: { matchId, type } },
    });

    if (existing && !opts.regenerate) {
      return; // idempotent
    }

    const ctx = await buildContext(matchId, type);
    const prompt = buildPrompt(ctx);
    const { content } = await _provider.generateCommentary(prompt);

    if (existing) {
      await prisma.matchCommentary.update({
        where: { id: existing.id },
        data: {
          content,
          generatedAt: new Date(),
          regeneratedCount: existing.regeneratedCount + 1,
          editedAt: null,
          editedByUserId: null,
          promptVersion: PROMPT_VERSION,
        },
      });
    } else {
      await prisma.matchCommentary.create({
        data: {
          matchId,
          type,
          provider: 'OPENAI',
          content,
          promptVersion: PROMPT_VERSION,
        },
      });
    }
  },

  async regenerate(commentaryId: string, userId: string): Promise<void> {
    const commentary = await prisma.matchCommentary.findUnique({
      where: { id: commentaryId },
      select: { matchId: true, type: true },
    });
    if (!commentary) throw new NotFoundError('COMMENTARY_NOT_FOUND', 'Crónica no encontrada.');
    await ensureLeagueAdmin(commentary.matchId, userId);
    await this.generate(commentary.matchId, commentary.type, { regenerate: true });
  },

  async edit(commentaryId: string, userId: string, newContent: string): Promise<void> {
    const parsed = editSchema.safeParse(newContent);
    if (!parsed.success) {
      throw new DomainError('INVALID_CONTENT', parsed.error.issues[0]?.message ?? 'Contenido inválido.');
    }
    const commentary = await prisma.matchCommentary.findUnique({
      where: { id: commentaryId },
      select: { matchId: true },
    });
    if (!commentary) throw new NotFoundError('COMMENTARY_NOT_FOUND', 'Crónica no encontrada.');
    await ensureLeagueAdmin(commentary.matchId, userId);

    await prisma.matchCommentary.update({
      where: { id: commentaryId },
      data: {
        content: parsed.data,
        editedAt: new Date(),
        editedByUserId: userId,
      },
    });
  },

  async delete(commentaryId: string, userId: string): Promise<void> {
    const commentary = await prisma.matchCommentary.findUnique({
      where: { id: commentaryId },
      select: { matchId: true },
    });
    if (!commentary) throw new NotFoundError('COMMENTARY_NOT_FOUND', 'Crónica no encontrada.');
    await ensureLeagueAdmin(commentary.matchId, userId);

    await prisma.matchCommentary.delete({ where: { id: commentaryId } });
  },

  async deleteByMatch(matchId: string): Promise<void> {
    await prisma.matchCommentary.deleteMany({ where: { matchId } });
  },

  async deleteByMatchAndType(matchId: string, type: CommentaryType): Promise<void> {
    await prisma.matchCommentary.deleteMany({ where: { matchId, type } });
  },

  async getByMatch(matchId: string): Promise<{ preview: CommentaryRow | null; recap: CommentaryRow | null }> {
    const items = await prisma.matchCommentary.findMany({ where: { matchId } });
    return {
      preview: (items.find((i) => i.type === 'PREVIEW') as CommentaryRow | undefined) ?? null,
      recap: (items.find((i) => i.type === 'RECAP') as CommentaryRow | undefined) ?? null,
    };
  },

  async listForLeague(leagueId: string, limit = 20): Promise<CommentaryFeedItem[]> {
    return prisma.matchCommentary.findMany({
      where: { match: { leagueId } },
      include: {
        match: {
          include: {
            league: { select: { name: true, slug: true } },
            teamA: { select: { id: true, name: true } },
            teamB: { select: { id: true, name: true } },
            confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
          },
        },
      },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    }) as unknown as Promise<CommentaryFeedItem[]>;
  },

  /**
   * `organizationId` is a REQUIRED tenant scope (pass `null` for the public
   * platform). Without it the crónicas sidebar leaks match narratives from the
   * public platform into a club's private environment — the feed is rendered in
   * the shared app layout, so it shows up on every tenant page at once.
   */
  async listForUser(
    userId: string,
    organizationId: string | null,
    limit = 5,
  ): Promise<CommentaryFeedItem[]> {
    return prisma.matchCommentary.findMany({
      where: {
        match: {
          league: {
            organizationId,
            registrations: {
              some: {
                withdrawnAt: null,
                team: { members: { some: { userId } } },
              },
            },
          },
        },
      },
      include: {
        match: {
          include: {
            league: { select: { name: true, slug: true } },
            teamA: { select: { id: true, name: true } },
            teamB: { select: { id: true, name: true } },
            confirmedResult: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
          },
        },
      },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    }) as unknown as Promise<CommentaryFeedItem[]>;
  },
} as const;
