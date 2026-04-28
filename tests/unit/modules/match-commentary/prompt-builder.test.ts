import { describe, it, expect } from 'vitest';
import { buildPrompt } from '@/modules/match-commentary/application/prompt-builder';
import type { CommentaryContext } from '@/modules/match-commentary/domain/types';

const baseCtx: CommentaryContext = {
  type: 'PREVIEW',
  league: { name: 'Liga Verano 2026' },
  teamA: {
    name: 'Los Cañones',
    rank: 1,
    points: 9,
    recent: [
      { won: true, opponent: 'Pádel Bros' },
      { won: true, opponent: 'Team Rafa' },
      { won: false, opponent: 'Los Ases' },
    ],
  },
  teamB: {
    name: 'Pádel Bros',
    rank: 4,
    points: 3,
    recent: [
      { won: false, opponent: 'Los Cañones' },
      { won: false, opponent: 'Los Ases' },
      { won: true, opponent: 'Team Rafa' },
    ],
  },
  scheduledAt: new Date('2026-05-12T19:00:00Z'),
};

describe('buildPrompt', () => {
  it('includes the league name', () => {
    const prompt = buildPrompt(baseCtx);
    expect(prompt).toContain('Liga Verano 2026');
  });

  it('includes both team names', () => {
    const prompt = buildPrompt(baseCtx);
    expect(prompt).toContain('Los Cañones');
    expect(prompt).toContain('Pádel Bros');
  });

  it('includes ranking and points when available', () => {
    const prompt = buildPrompt(baseCtx);
    expect(prompt).toContain('1º');
    expect(prompt).toContain('9 pts');
    expect(prompt).toContain('4º');
    expect(prompt).toContain('3 pts');
  });

  it('omits ranking when rank is null (cold start)', () => {
    const ctx: CommentaryContext = {
      ...baseCtx,
      teamA: { ...baseCtx.teamA, rank: null, points: 0 },
      teamB: { ...baseCtx.teamB, rank: null, points: 0 },
    };
    const prompt = buildPrompt(ctx);
    expect(prompt).not.toContain('1º');
    expect(prompt).not.toContain('clasificación');
  });

  it('uses PREVIEW instructions when type is PREVIEW', () => {
    const prompt = buildPrompt({ ...baseCtx, type: 'PREVIEW' });
    expect(prompt.toLowerCase()).toContain('previa');
    expect(prompt.toLowerCase()).toContain('sin spoilers');
  });

  it('uses RECAP instructions when type is RECAP', () => {
    const prompt = buildPrompt({
      ...baseCtx,
      type: 'RECAP',
      result: {
        sets: [
          { gamesA: 6, gamesB: 4 },
          { gamesA: 3, gamesB: 6 },
          { gamesA: 7, gamesB: 5 },
        ],
        winnerTeam: 'A',
      },
    });
    expect(prompt.toLowerCase()).toContain('crónica');
    expect(prompt).toContain('6-4');
    expect(prompt).toContain('3-6');
    expect(prompt).toContain('7-5');
  });

  it('marks the winner explicitly in RECAP', () => {
    const prompt = buildPrompt({
      ...baseCtx,
      type: 'RECAP',
      result: {
        sets: [{ gamesA: 6, gamesB: 4 }, { gamesA: 6, gamesB: 3 }],
        winnerTeam: 'A',
      },
    });
    expect(prompt).toContain('Ganador: Los Cañones');
  });

  it('marks draw when winnerTeam is DRAW', () => {
    const prompt = buildPrompt({
      ...baseCtx,
      type: 'RECAP',
      result: {
        sets: [{ gamesA: 6, gamesB: 4 }, { gamesA: 4, gamesB: 6 }],
        winnerTeam: 'DRAW',
      },
    });
    expect(prompt.toLowerCase()).toContain('empate');
  });

  it('handles empty recent arrays (no prior matches)', () => {
    const ctx: CommentaryContext = {
      ...baseCtx,
      teamA: { ...baseCtx.teamA, recent: [] },
      teamB: { ...baseCtx.teamB, recent: [] },
    };
    const prompt = buildPrompt(ctx);
    expect(prompt).toContain('Sin partidos previos');
  });

  it('formats recent matches as wins/losses with opponent names', () => {
    const prompt = buildPrompt(baseCtx);
    expect(prompt).toMatch(/(victoria|derrota|ganó|perdió|✓|✗)/i);
    expect(prompt).toContain('Pádel Bros');
  });

  it('includes the privacy / safety rules', () => {
    const prompt = buildPrompt(baseCtx);
    expect(prompt).toContain('No inventes');
    expect(prompt).toContain('datos personales');
  });
});
