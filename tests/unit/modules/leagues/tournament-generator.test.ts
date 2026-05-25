import { describe, it, expect } from 'vitest';
import {
  distributeIntoGroups,
  generateGroupRoundRobin,
  generateGoldBracket,
  generateSilverBracket,
} from '@/modules/leagues/application/tournament-generator';

describe('distributeIntoGroups', () => {
  it('snake-distributes 8 seeds into 2 groups of 4', () => {
    const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
    const groups = distributeIntoGroups(seeds, 2, 4);
    expect(groups).toHaveLength(2);
    // Snake: pos 0..1 = row 0 left→right, pos 2..3 = row 1 right→left, etc.
    // Group 0 gets seeds 0, 3, 4, 7
    // Group 1 gets seeds 1, 2, 5, 6
    expect(groups[0]).toEqual(['s1', 's4', 's5', 's8']);
    expect(groups[1]).toEqual(['s2', 's3', 's6', 's7']);
  });

  it('throws if seed count does not match groupCount × teamsPerGroup', () => {
    expect(() => distributeIntoGroups(['a', 'b', 'c'], 2, 2)).toThrow();
    expect(() => distributeIntoGroups(['a', 'b', 'c', 'd', 'e'], 2, 2)).toThrow();
  });
});

describe('generateGroupRoundRobin', () => {
  it('generates the expected number of matches for 4 teams', () => {
    const fixtures = generateGroupRoundRobin(0, ['t1', 't2', 't3', 't4']);
    // 4 teams → 3 rounds × 2 matches per round = 6 matches
    expect(fixtures).toHaveLength(6);
    const rounds = new Set(fixtures.map((f) => f.round));
    expect(rounds.size).toBe(3);
    // Every pair plays exactly once.
    const pairs = new Set(
      fixtures.map((f) => [f.teamAId, f.teamBId].sort().join('-')),
    );
    expect(pairs.size).toBe(6);
  });

  it('handles odd team count with a bye', () => {
    const fixtures = generateGroupRoundRobin(0, ['t1', 't2', 't3']);
    expect(fixtures).toHaveLength(3);
  });
});

describe('generateGoldBracket', () => {
  it('generates a clean 4-team bracket (2 R0 + 1 final)', () => {
    const { matches } = generateGoldBracket(['s1', 's2', 's3', 's4']);
    expect(matches).toHaveLength(3);
    const r0 = matches.filter((m) => m.round === 0);
    const r1 = matches.filter((m) => m.round === 1);
    expect(r0).toHaveLength(2);
    expect(r1).toHaveLength(1);
    // Round 1 final references both R0 matches as sources.
    expect(r1[0]?.teamAId).toBeNull();
    expect(r1[0]?.teamBId).toBeNull();
    expect(r1[0]?.sourceA).toEqual({ side: 'GOLD', round: 0, position: 0 });
    expect(r1[0]?.sourceB).toEqual({ side: 'GOLD', round: 0, position: 1 });
  });

  it('handles 6 teams with 2 byes for the top seeds', () => {
    const { matches } = generateGoldBracket(['s1', 's2', 's3', 's4', 's5', 's6']);
    // totalSlots = 8 → 4 R0 pairings. With 6 teams, 2 byes → only 2 R0 matches.
    // R1: 2 semis (1 mixed: bye-seed vs winner of R0). R2: 1 final.
    const r0 = matches.filter((m) => m.round === 0);
    expect(r0).toHaveLength(2);
    const r1 = matches.filter((m) => m.round === 1);
    expect(r1).toHaveLength(2);
    // Top seed s1 should be in some R1 match as a direct team (bye).
    const r1Teams = r1.flatMap((m) => [m.teamAId, m.teamBId]).filter(Boolean);
    expect(r1Teams).toContain('s1');
    expect(r1Teams).toContain('s2');
  });

  it('returns round0LoserSources for the Silver bracket', () => {
    const { round0LoserSources } = generateGoldBracket(['s1', 's2', 's3', 's4']);
    expect(round0LoserSources).toHaveLength(2);
    expect(round0LoserSources[0]).toEqual({ position: 0 });
    expect(round0LoserSources[1]).toEqual({ position: 1 });
  });

  it('throws with fewer than 2 teams', () => {
    expect(() => generateGoldBracket(['s1'])).toThrow();
    expect(() => generateGoldBracket([])).toThrow();
  });
});

describe('generateSilverBracket', () => {
  it('builds a silver bracket from the gold R0 losers', () => {
    // 4 gold R0 matches → 4 silver R0 inputs → 2 silver R0 matches + 1 silver final.
    const losers = [{ position: 0 }, { position: 1 }, { position: 2 }, { position: 3 }];
    const silver = generateSilverBracket(losers);
    expect(silver).toHaveLength(3);
    const r0 = silver.filter((m) => m.round === 0);
    expect(r0).toHaveLength(2);
    expect(r0[0]?.sourceA).toEqual({ side: 'GOLD', round: 0, position: 0 });
    expect(r0[0]?.sourceB).toEqual({ side: 'GOLD', round: 0, position: 1 });
  });

  it('returns empty when there are fewer than 2 losers', () => {
    expect(generateSilverBracket([])).toEqual([]);
    expect(generateSilverBracket([{ position: 0 }])).toEqual([]);
  });
});
