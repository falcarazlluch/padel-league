import type { TeamCategory } from '@prisma/client';
import { nextCategoryDown, nextCategoryUp } from '../domain/category';

export const CATEGORY_EVOLUTION_MIN_TEAMS = 6;
export const PROMOTION_THRESHOLD = 0.75;
export const DEMOTION_THRESHOLD = 0.25;

export type CategoryEvolutionTeam = {
  teamId: string;
  category: TeamCategory;
  points: number;
};

export type CategoryEvolutionProposal = {
  teamId: string;
  fromCategory: TeamCategory;
  toCategory: TeamCategory;
  reason: 'PROMOTION' | 'DEMOTION';
};

/**
 * Decide which teams should get a category-change proposal after a league ends.
 *
 * Rules:
 * - Skip entirely if league has fewer than CATEGORY_EVOLUTION_MIN_TEAMS teams.
 * - maxPoints = (teams.length - 1) * pointsWin (one round-robin against every other team).
 * - Promotion if points >= 0.75 * maxPoints and team is not already ADVANCED.
 * - Demotion if points <= 0.25 * maxPoints and team is not already BEGINNER.
 *
 * The function is pure — no DB access, no side effects.
 */
export function calculateCategoryProposals(
  teams: CategoryEvolutionTeam[],
  pointsWin: number,
): CategoryEvolutionProposal[] {
  if (teams.length < CATEGORY_EVOLUTION_MIN_TEAMS) return [];
  if (pointsWin <= 0) return [];

  const maxPoints = (teams.length - 1) * pointsWin;
  const promotionPoints = maxPoints * PROMOTION_THRESHOLD;
  const demotionPoints = maxPoints * DEMOTION_THRESHOLD;

  const proposals: CategoryEvolutionProposal[] = [];
  for (const team of teams) {
    if (team.points >= promotionPoints) {
      const next = nextCategoryUp(team.category);
      if (next) {
        proposals.push({
          teamId: team.teamId,
          fromCategory: team.category,
          toCategory: next,
          reason: 'PROMOTION',
        });
      }
    } else if (team.points <= demotionPoints) {
      const next = nextCategoryDown(team.category);
      if (next) {
        proposals.push({
          teamId: team.teamId,
          fromCategory: team.category,
          toCategory: next,
          reason: 'DEMOTION',
        });
      }
    }
  }
  return proposals;
}
