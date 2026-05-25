// Clasificación por jugador (ROTATING_INDIVIDUAL) y por pareja (FIXED_PAIRS)
// para Americanas. Funciones puras — no tocan Prisma, las páginas se encargan
// de cargar los datos en la forma que esperan estos helpers.
//
// El scoring es por games ganados (no por sets/puntos como una liga) porque
// una americana social se mide en games por ronda.

type AmericanaConfirmedStatus = 'CONFIRMED' | 'ADMIN_RESOLVED';

export type AmericanaSet = {
  gamesA: number;
  gamesB: number;
};

export type IndividualStandingEntry = {
  userId: string;
  name: string;
  matchesPlayed: number;
  gamesFor: number;
  gamesAgainst: number;
  gamesDiff: number;
};

export type PairsStandingEntry = {
  teamId: string;
  teamName: string;
  matchesPlayed: number;
  gamesFor: number;
  gamesAgainst: number;
  gamesDiff: number;
};

export type AmericanaIndividualMatch = {
  status: AmericanaConfirmedStatus | string;
  participants: ReadonlyArray<{ userId: string; side: 'A' | 'B' }>;
  sets: ReadonlyArray<AmericanaSet>;
};

export type AmericanaPairsMatch = {
  status: AmericanaConfirmedStatus | string;
  teamAId: string;
  teamBId: string;
  sets: ReadonlyArray<AmericanaSet>;
};

function isConfirmed(status: string): boolean {
  return status === 'CONFIRMED' || status === 'ADMIN_RESOLVED';
}

function sumGames(sets: ReadonlyArray<AmericanaSet>): { gamesA: number; gamesB: number } {
  let gamesA = 0;
  let gamesB = 0;
  for (const s of sets) {
    gamesA += s.gamesA;
    gamesB += s.gamesB;
  }
  return { gamesA, gamesB };
}

export function calculateAmericanaIndividualStandings(
  participantNames: Record<string, string>,
  matches: ReadonlyArray<AmericanaIndividualMatch>,
): IndividualStandingEntry[] {
  const acc = new Map<string, { gamesFor: number; gamesAgainst: number; matches: number }>();
  for (const userId of Object.keys(participantNames)) {
    acc.set(userId, { gamesFor: 0, gamesAgainst: 0, matches: 0 });
  }

  for (const m of matches) {
    if (!isConfirmed(m.status)) continue;
    const { gamesA, gamesB } = sumGames(m.sets);
    for (const p of m.participants) {
      if (!acc.has(p.userId)) acc.set(p.userId, { gamesFor: 0, gamesAgainst: 0, matches: 0 });
      const entry = acc.get(p.userId)!;
      entry.matches += 1;
      if (p.side === 'A') {
        entry.gamesFor += gamesA;
        entry.gamesAgainst += gamesB;
      } else {
        entry.gamesFor += gamesB;
        entry.gamesAgainst += gamesA;
      }
    }
  }

  const entries: IndividualStandingEntry[] = [...acc.entries()].map(([userId, v]) => ({
    userId,
    name: participantNames[userId] ?? 'Jugador',
    matchesPlayed: v.matches,
    gamesFor: v.gamesFor,
    gamesAgainst: v.gamesAgainst,
    gamesDiff: v.gamesFor - v.gamesAgainst,
  }));

  // Orden: más games a favor, desempate por diff, luego por nombre.
  entries.sort((a, b) => {
    if (a.gamesFor !== b.gamesFor) return b.gamesFor - a.gamesFor;
    if (a.gamesDiff !== b.gamesDiff) return b.gamesDiff - a.gamesDiff;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export function calculateAmericanaPairsStandings(
  teamNames: Record<string, string>,
  matches: ReadonlyArray<AmericanaPairsMatch>,
): PairsStandingEntry[] {
  const acc = new Map<string, { gamesFor: number; gamesAgainst: number; matches: number }>();
  for (const teamId of Object.keys(teamNames)) {
    acc.set(teamId, { gamesFor: 0, gamesAgainst: 0, matches: 0 });
  }

  for (const m of matches) {
    if (!isConfirmed(m.status)) continue;
    const { gamesA, gamesB } = sumGames(m.sets);
    for (const [teamId, gamesForThis, gamesAgainstThis] of [
      [m.teamAId, gamesA, gamesB] as const,
      [m.teamBId, gamesB, gamesA] as const,
    ]) {
      if (!acc.has(teamId)) acc.set(teamId, { gamesFor: 0, gamesAgainst: 0, matches: 0 });
      const entry = acc.get(teamId)!;
      entry.matches += 1;
      entry.gamesFor += gamesForThis;
      entry.gamesAgainst += gamesAgainstThis;
    }
  }

  const entries: PairsStandingEntry[] = [...acc.entries()].map(([teamId, v]) => ({
    teamId,
    teamName: teamNames[teamId] ?? 'Pareja',
    matchesPlayed: v.matches,
    gamesFor: v.gamesFor,
    gamesAgainst: v.gamesAgainst,
    gamesDiff: v.gamesFor - v.gamesAgainst,
  }));

  entries.sort((a, b) => {
    if (a.gamesFor !== b.gamesFor) return b.gamesFor - a.gamesFor;
    if (a.gamesDiff !== b.gamesDiff) return b.gamesDiff - a.gamesDiff;
    return a.teamName.localeCompare(b.teamName);
  });

  return entries;
}
