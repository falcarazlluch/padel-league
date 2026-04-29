import type { AICommentaryProvider, CommentaryType, TeamCategory } from '@prisma/client';

export type { CommentaryType };

export type RecentCategoryChange = {
  fromCategory: TeamCategory;
  toCategory: TeamCategory;
  reason: 'PROMOTION' | 'DEMOTION';
};

export type CommentaryTeam = {
  name: string;
  rank: number | null;
  points: number;
  recent: Array<{ won: boolean; opponent: string }>;
  recentCategoryChange?: RecentCategoryChange;
};

export type CommentaryContext = {
  type: CommentaryType;
  league: { name: string };
  teamA: CommentaryTeam;
  teamB: CommentaryTeam;
  result?: {
    sets: Array<{ gamesA: number; gamesB: number }>;
    winnerTeam: 'A' | 'B' | 'DRAW';
  };
  scheduledAt?: Date;
};

export type CommentaryRow = {
  id: string;
  matchId: string;
  type: CommentaryType;
  provider: AICommentaryProvider;
  content: string;
  generatedAt: Date;
  regeneratedCount: number;
  rejectedForSafety: boolean;
  promptVersion: string;
  editedAt: Date | null;
  editedByUserId: string | null;
};

export type CommentaryFeedItem = CommentaryRow & {
  match: {
    id: string;
    leagueId: string;
    league: { name: string; slug: string };
    teamA: { id: string; name: string };
    teamB: { id: string; name: string };
    winnerTeamId: string | null;
    confirmedResult: {
      sets: Array<{ gamesA: number; gamesB: number; setNumber: number }>;
    } | null;
  };
};
