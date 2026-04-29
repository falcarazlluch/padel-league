import { describe, it, expect } from 'vitest';
import {
  calculateCategoryProposals,
  CATEGORY_EVOLUTION_MIN_TEAMS,
} from '@/modules/leagues/application/category-evolution';

const POINTS_WIN = 3;

function teams(items: Array<{ id: string; cat: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'; pts: number }>) {
  return items.map((t) => ({ teamId: t.id, category: t.cat, points: t.pts }));
}

describe('calculateCategoryProposals', () => {
  it('returns no proposals when team count is below the minimum threshold', () => {
    const t = teams([
      { id: 't1', cat: 'INTERMEDIATE', pts: 15 },
      { id: 't2', cat: 'INTERMEDIATE', pts: 12 },
      { id: 't3', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't4', cat: 'INTERMEDIATE', pts: 6 },
      { id: 't5', cat: 'INTERMEDIATE', pts: 3 },
    ]);
    expect(t.length).toBeLessThan(CATEGORY_EVOLUTION_MIN_TEAMS);
    expect(calculateCategoryProposals(t, POINTS_WIN)).toEqual([]);
  });

  it('proposes promotion for INTERMEDIATE team that crosses the 75% threshold', () => {
    // 6 teams → maxPoints = 5 * 3 = 15. Promotion threshold = 11.25.
    const t = teams([
      { id: 'champion', cat: 'INTERMEDIATE', pts: 15 }, // 100% — qualifies
      { id: 't2', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't3', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't4', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't5', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't6', cat: 'INTERMEDIATE', pts: 9 },
    ]);
    const proposals = calculateCategoryProposals(t, POINTS_WIN);
    expect(proposals).toEqual([
      { teamId: 'champion', fromCategory: 'INTERMEDIATE', toCategory: 'ADVANCED', reason: 'PROMOTION' },
    ]);
  });

  it('does not propose promotion for ADVANCED team (already at top)', () => {
    const t = teams([
      { id: 'top', cat: 'ADVANCED', pts: 15 },
      { id: 't2', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't3', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't4', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't5', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't6', cat: 'INTERMEDIATE', pts: 9 },
    ]);
    expect(calculateCategoryProposals(t, POINTS_WIN)).toEqual([]);
  });

  it('proposes demotion for ADVANCED team below the 25% threshold', () => {
    // demotion threshold = 15 * 0.25 = 3.75
    const t = teams([
      { id: 't1', cat: 'ADVANCED', pts: 12 },
      { id: 't2', cat: 'ADVANCED', pts: 9 },
      { id: 't3', cat: 'ADVANCED', pts: 9 },
      { id: 't4', cat: 'ADVANCED', pts: 9 },
      { id: 't5', cat: 'ADVANCED', pts: 6 },
      { id: 'loser', cat: 'ADVANCED', pts: 0 },
    ]);
    expect(calculateCategoryProposals(t, POINTS_WIN)).toEqual([
      { teamId: 'loser', fromCategory: 'ADVANCED', toCategory: 'INTERMEDIATE', reason: 'DEMOTION' },
    ]);
  });

  it('does not propose demotion for BEGINNER team (already at bottom)', () => {
    // All teams stay within the no-action band (between 25% and 75%) except `loser`,
    // who would be demoted from any other tier — but is already BEGINNER, so no proposal.
    const t = teams([
      { id: 't1', cat: 'BEGINNER', pts: 11 },
      { id: 't2', cat: 'BEGINNER', pts: 9 },
      { id: 't3', cat: 'BEGINNER', pts: 9 },
      { id: 't4', cat: 'BEGINNER', pts: 9 },
      { id: 't5', cat: 'BEGINNER', pts: 6 },
      { id: 'loser', cat: 'BEGINNER', pts: 0 },
    ]);
    expect(calculateCategoryProposals(t, POINTS_WIN)).toEqual([]);
  });

  it('handles both promotion and demotion in the same league', () => {
    const t = teams([
      { id: 'top', cat: 'INTERMEDIATE', pts: 15 },
      { id: 't2', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't3', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't4', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't5', cat: 'INTERMEDIATE', pts: 6 },
      { id: 'bottom', cat: 'INTERMEDIATE', pts: 0 },
    ]);
    const proposals = calculateCategoryProposals(t, POINTS_WIN);
    expect(proposals).toHaveLength(2);
    expect(proposals).toContainEqual({
      teamId: 'top',
      fromCategory: 'INTERMEDIATE',
      toCategory: 'ADVANCED',
      reason: 'PROMOTION',
    });
    expect(proposals).toContainEqual({
      teamId: 'bottom',
      fromCategory: 'INTERMEDIATE',
      toCategory: 'BEGINNER',
      reason: 'DEMOTION',
    });
  });

  it('does not propose anything when no team crosses thresholds', () => {
    // Tight league: everyone within 25%-75% band
    const t = teams([
      { id: 't1', cat: 'INTERMEDIATE', pts: 11 }, // just below 11.25 promotion
      { id: 't2', cat: 'INTERMEDIATE', pts: 10 },
      { id: 't3', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't4', cat: 'INTERMEDIATE', pts: 8 },
      { id: 't5', cat: 'INTERMEDIATE', pts: 5 },
      { id: 't6', cat: 'INTERMEDIATE', pts: 4 }, // above 3.75 demotion
    ]);
    expect(calculateCategoryProposals(t, POINTS_WIN)).toEqual([]);
  });

  it('uses team.category for the source, not the league context', () => {
    // Mixed-category league (e.g., teams that climbed mid-tier still play together)
    const t = teams([
      { id: 'beginner-winner', cat: 'BEGINNER', pts: 15 },
      { id: 't2', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't3', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't4', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't5', cat: 'INTERMEDIATE', pts: 9 },
      { id: 't6', cat: 'INTERMEDIATE', pts: 9 },
    ]);
    expect(calculateCategoryProposals(t, POINTS_WIN)).toEqual([
      { teamId: 'beginner-winner', fromCategory: 'BEGINNER', toCategory: 'INTERMEDIATE', reason: 'PROMOTION' },
    ]);
  });

  it('returns empty when pointsWin is non-positive (defensive)', () => {
    const t = teams([
      { id: 't1', cat: 'INTERMEDIATE', pts: 0 },
      { id: 't2', cat: 'INTERMEDIATE', pts: 0 },
      { id: 't3', cat: 'INTERMEDIATE', pts: 0 },
      { id: 't4', cat: 'INTERMEDIATE', pts: 0 },
      { id: 't5', cat: 'INTERMEDIATE', pts: 0 },
      { id: 't6', cat: 'INTERMEDIATE', pts: 0 },
    ]);
    expect(calculateCategoryProposals(t, 0)).toEqual([]);
    expect(calculateCategoryProposals(t, -1)).toEqual([]);
  });
});
