export { MatchCommentaryService, __setProviderForTests } from './application/match-commentary-service';
export { buildContext } from './application/context-builder';
export { buildPrompt, PROMPT_VERSION } from './application/prompt-builder';
export type {
  CommentaryContext,
  CommentaryRow,
  CommentaryType,
  CommentaryFeedItem,
} from './domain/types';
export type { AIProvider } from './domain/ai-provider';
