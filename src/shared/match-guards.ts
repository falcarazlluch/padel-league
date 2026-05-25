import { DomainError } from '@/shared/errors';

// Tras Competitions v2, `Match.teamAId / teamBId` son nullables porque
// Americana ROTATING_INDIVIDUAL no tiene Teams (los 4 jugadores viven en
// `MatchParticipant`) y el primer round del bracket de un Torneo puede tener
// slots vacíos hasta que el match fuente se resuelve.
//
// La mayoría del código existente (scheduling, results, photos, calendar,
// commentary) asume un enfrentamiento entre dos equipos. Para no esparcir
// guards por todas partes, este helper narrow-ea el tipo cuando el caller
// ya sabe que el match en cuestión es de Liga / Torneo / Americana FIXED_PAIRS.
//
// El call-site lanza `NOT_TWO_TEAM_MATCH` si alguien intenta usar uno de los
// flujos clásicos sobre un match individual de Americana — es un error de
// programación más que de UX (la UI no debería ofrecer esa acción).

export function assertTwoTeamMatch<T extends { teamA: unknown; teamB: unknown }>(
  match: T,
): asserts match is T & {
  teamA: NonNullable<T['teamA']>;
  teamB: NonNullable<T['teamB']>;
} {
  if (match.teamA == null || match.teamB == null) {
    throw new DomainError(
      'NOT_TWO_TEAM_MATCH',
      'Esta operación requiere un partido entre dos equipos.',
    );
  }
}

export function assertMatchTeamIds<T extends { teamAId: string | null; teamBId: string | null }>(
  match: T,
): asserts match is T & { teamAId: string; teamBId: string } {
  if (match.teamAId == null || match.teamBId == null) {
    throw new DomainError(
      'NOT_TWO_TEAM_MATCH',
      'Esta operación requiere un partido entre dos equipos.',
    );
  }
}
