import { logger } from '@/shared/logger';
import { env } from '@/shared/config/env';
import { MatchCommentaryService } from '@/modules/match-commentary';
import type { JobMap } from '@/shared/queue/jobs';

export async function generateMatchCommentaryHandler(
  data: JobMap['generate-match-commentary'],
): Promise<void> {
  const { matchId, type, regenerate } = data;
  const log = logger();

  if (!env().FEATURE_AI_COMMENTARY) {
    log.info({ matchId, type }, 'commentary.skip.feature-disabled');
    return;
  }

  try {
    await MatchCommentaryService.generate(matchId, type, { regenerate });
    log.info({ matchId, type, regenerate: regenerate ?? false }, 'commentary.generated');
  } catch (err) {
    log.error({ matchId, type, err }, 'commentary.failed');
    throw err; // pg-boss retries with backoff
  }
}
