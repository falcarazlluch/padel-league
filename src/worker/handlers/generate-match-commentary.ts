import { logger } from '@/shared/logger';
import { env } from '@/shared/config/env';
import { prisma } from '@/shared/db/client';
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

  // Las crónicas IA solo aplican a competiciones tipo LEAGUE. El generador
  // de prompts (context-builder) asume dos equipos identificados y standings
  // de liga round-robin — para Americana (sin teams en la variante individual,
  // sin clasificación por puntos) y Torneo (bracket, no round-robin) los
  // datos no encajan en el prompt actual. Silenciamos en lugar de fallar para
  // no llenar la dead-letter de la cola.
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { league: { select: { type: true } } },
  });
  if (!match) {
    log.info({ matchId }, 'commentary.skip.match-not-found');
    return;
  }
  if (match.league.type !== 'LEAGUE') {
    log.info({ matchId, type, leagueType: match.league.type }, 'commentary.skip.non-league-type');
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
