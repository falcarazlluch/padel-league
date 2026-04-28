import type { AICommentaryProvider, CommentaryType } from '@prisma/client';

export type { CommentaryType };

export type CommentaryContext = {
  type: CommentaryType;
  league: { name: string };
  teamA: {
    name: string;
    rank: number | null;
    points: number;
    recent: Array<{ won: boolean; opponent: string }>;
  };
  teamB: {
    name: string;
    rank: number | null;
    points: number;
    recent: Array<{ won: boolean; opponent: string }>;
  };
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
