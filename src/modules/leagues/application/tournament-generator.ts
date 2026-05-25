// Generadores para competiciones tipo TOURNAMENT.
//
// La activación crea:
//   - Si hasGroupPhase: N grupos × M parejas → round-robin dentro de cada
//     grupo (`generateGroupRoundRobin`). Tras cerrar la fase de grupos se
//     materializa el bracket con los K mejores de cada grupo.
//   - Bracket Oro (`generateGoldBracket`) — eliminación directa con byes
//     automáticos para los top seeds cuando N no es potencia de 2.
//   - Bracket Plata (`generateSilverBracket`) — opcional, perdedores de la
//     primera ronda del Oro juegan otra eliminatoria.
//
// Estos generadores no tocan Prisma: devuelven descripciones puras que la
// función `activateTournament` traduce a filas Match / CompetitionGroup.

export type BracketSide = 'GOLD' | 'SILVER';

export type FeederRef =
  | { kind: 'seed'; id: string }
  | { kind: 'matchRef'; side: BracketSide; round: number; position: number };

export type BracketMatchDescriptor = {
  side: BracketSide;
  round: number; // 0 = primera ronda del bracket
  position: number; // 0..(N en esa ronda)
  teamAId: string | null;
  teamBId: string | null;
  // Referencias para resolver `sourceMatchAId`/`sourceMatchBId` cuando ya
  // tengamos los Match.id reales en la activación. `null` significa que la
  // posición se llena directamente con un seed (bye) o no aplica.
  sourceA: { side: BracketSide; round: number; position: number } | null;
  sourceB: { side: BracketSide; round: number; position: number } | null;
};

export type GroupRoundRobinFixture = {
  groupIndex: number;
  round: number;
  teamAId: string;
  teamBId: string;
};

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Distribución "snake" para repartir N parejas en G grupos de M:
//   grupo 0: seeds 0, G-1...etc tipo serpentina para balancear los grupos
// El parámetro `seeds` debe estar ordenado de mejor (índice 0) a peor.
export function distributeIntoGroups(
  seeds: string[],
  groupCount: number,
  teamsPerGroup: number,
): string[][] {
  const totalNeeded = groupCount * teamsPerGroup;
  if (seeds.length < totalNeeded) {
    throw new Error(
      `Faltan parejas: se necesitan ${totalNeeded} (${groupCount} grupos × ${teamsPerGroup}), pero hay ${seeds.length}.`,
    );
  }
  if (seeds.length > totalNeeded) {
    throw new Error(
      `Sobran parejas: se necesitan ${totalNeeded} y hay ${seeds.length}.`,
    );
  }
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  for (let i = 0; i < seeds.length; i++) {
    // Snake order: 0..G-1, G-1..0, 0..G-1, ...
    const rowIdx = Math.floor(i / groupCount);
    const colIdx = i % groupCount;
    const groupIdx = rowIdx % 2 === 0 ? colIdx : groupCount - 1 - colIdx;
    groups[groupIdx]!.push(seeds[i]!);
  }
  return groups;
}

// Round-robin "Circle method" simple para los matches de cada grupo. Devuelve
// fixtures con `round` 1-based (jornada del grupo). Idéntico al algoritmo de
// `generateFixtures` pero con el contexto de grupoIndex incrustado.
export function generateGroupRoundRobin(
  groupIndex: number,
  teamIds: string[],
): GroupRoundRobinFixture[] {
  const teams = [...teamIds];
  const padded = teams.length % 2 === 1 ? [...teams, null] : teams;
  const N = padded.length;
  const rounds = N - 1;
  const out: GroupRoundRobinFixture[] = [];

  // Posiciones rotatorias del Circle method.
  const positions = padded.slice(1);

  for (let r = 0; r < rounds; r++) {
    const round = r + 1;
    const fixed = padded[0];
    const rotated = [fixed, ...positions];
    for (let i = 0; i < N / 2; i++) {
      const a = rotated[i];
      const b = rotated[N - 1 - i];
      if (a && b) {
        out.push({ groupIndex, round, teamAId: a, teamBId: b });
      }
    }
    // Rotar (mantener la posición 0 fija).
    positions.unshift(positions.pop()!);
  }

  return out;
}

// Bracket Oro (eliminación directa). Para N que no sea potencia de 2, los top
// seeds reciben byes automáticos en la primera ronda — es decir, no se crea
// el match correspondiente y el seed avanza directamente al hueco de R1.
// Devuelve también la lista de posiciones de R0 donde un seed `loser` queda
// (si Plata = on, esos serán los Match cuyos perdedores alimentarán Plata).
export function generateGoldBracket(seedIds: string[]): {
  matches: BracketMatchDescriptor[];
  round0LoserSources: Array<{ position: number }>;
} {
  if (seedIds.length < 2) {
    throw new Error('Un bracket necesita al menos 2 inscritos.');
  }

  const N = seedIds.length;
  const totalSlots = nextPowerOfTwo(N);

  // Distribuye seeds en slots 0..totalSlots-1. Slots ≥ N son byes (null).
  const seedAtSlot: (string | null)[] = [];
  for (let i = 0; i < totalSlots; i++) {
    seedAtSlot.push(i < N ? seedIds[i]! : null);
  }

  // Round-0 pairings: slot i (0..totalSlots/2-1) contra slot (totalSlots-1-i).
  // Los top seeds (i pequeños) se enfrentan a slots altos (los byes), así que
  // los top seeds tienden a recibir el bye cuando los hay.
  const round0Pairs: Array<{ teamA: string | null; teamB: string | null }> = [];
  for (let p = 0; p < totalSlots / 2; p++) {
    round0Pairs.push({
      teamA: seedAtSlot[p] ?? null,
      teamB: seedAtSlot[totalSlots - 1 - p] ?? null,
    });
  }

  type Feeder =
    | { kind: 'seed'; id: string }
    | { kind: 'matchRef'; round: number; position: number };
  let currentAdvancers: Feeder[] = [];
  const matches: BracketMatchDescriptor[] = [];
  const round0LoserSources: Array<{ position: number }> = [];

  // Ronda 0
  round0Pairs.forEach((pair, idx) => {
    if (pair.teamA && pair.teamB) {
      matches.push({
        side: 'GOLD',
        round: 0,
        position: idx,
        teamAId: pair.teamA,
        teamBId: pair.teamB,
        sourceA: null,
        sourceB: null,
      });
      currentAdvancers.push({ kind: 'matchRef', round: 0, position: idx });
      round0LoserSources.push({ position: idx });
    } else if (pair.teamA) {
      currentAdvancers.push({ kind: 'seed', id: pair.teamA });
    } else if (pair.teamB) {
      currentAdvancers.push({ kind: 'seed', id: pair.teamB });
    }
    // both byes → ignored (no debería pasar)
  });

  // Rondas siguientes
  let round = 1;
  while (currentAdvancers.length > 1) {
    const nextAdvancers: Feeder[] = [];
    for (let p = 0; p < currentAdvancers.length; p += 2) {
      const left = currentAdvancers[p]!;
      const right = currentAdvancers[p + 1];
      const positionInRound = Math.floor(p / 2);

      if (!right) {
        // Caso impar — el de la izquierda avanza solo (no debería ocurrir
        // con la construcción anterior, pero por defensa).
        nextAdvancers.push(left);
        continue;
      }

      matches.push({
        side: 'GOLD',
        round,
        position: positionInRound,
        teamAId: left.kind === 'seed' ? left.id : null,
        teamBId: right.kind === 'seed' ? right.id : null,
        sourceA:
          left.kind === 'matchRef'
            ? { side: 'GOLD', round: left.round, position: left.position }
            : null,
        sourceB:
          right.kind === 'matchRef'
            ? { side: 'GOLD', round: right.round, position: right.position }
            : null,
      });
      nextAdvancers.push({ kind: 'matchRef', round, position: positionInRound });
    }
    currentAdvancers = nextAdvancers;
    round++;
  }

  return { matches, round0LoserSources };
}

// Bracket Plata. Toma los perdedores de la primera ronda Oro y construye un
// bracket de eliminación con ellos. Los `goldFirstRoundPositions` son las
// posiciones (en Gold round 0) cuyos perdedores entran a la primera ronda
// del Silver bracket. Los teamAId/teamBId del Silver R0 son null por
// construcción y se rellenarán cuando los matches Gold R0 se confirmen
// (propagación: el perdedor entra como teamA o teamB en Silver R0).
//
// Para simplificar, encadenamos: Silver R0 position p = perdedor de Gold R0
// position 2p vs perdedor de Gold R0 position 2p+1.
export function generateSilverBracket(
  goldFirstRoundPositions: Array<{ position: number }>,
): BracketMatchDescriptor[] {
  const losers = goldFirstRoundPositions;
  if (losers.length < 2) return []; // sin Plata si hay 0/1 perdedores.

  const matches: BracketMatchDescriptor[] = [];

  // Silver R0: cada match recibe a 2 perdedores consecutivos de Gold R0.
  type Feeder =
    | { kind: 'goldLoser'; goldR0Position: number }
    | { kind: 'silverRef'; round: number; position: number };
  let advancers: Feeder[] = [];
  let p = 0;
  for (let i = 0; i < losers.length; i += 2) {
    const a = losers[i];
    const b = losers[i + 1];
    if (a && b) {
      matches.push({
        side: 'SILVER',
        round: 0,
        position: p,
        teamAId: null,
        teamBId: null,
        sourceA: { side: 'GOLD', round: 0, position: a.position },
        sourceB: { side: 'GOLD', round: 0, position: b.position },
      });
      advancers.push({ kind: 'silverRef', round: 0, position: p });
      p++;
    } else if (a) {
      // bye en Silver — el perdedor avanza solo (raro pero contemplado).
      advancers.push({ kind: 'goldLoser', goldR0Position: a.position });
    }
  }

  // Rondas Silver siguientes.
  let round = 1;
  while (advancers.length > 1) {
    const next: Feeder[] = [];
    for (let i = 0; i < advancers.length; i += 2) {
      const left = advancers[i]!;
      const right = advancers[i + 1];
      const positionInRound = Math.floor(i / 2);
      if (!right) {
        next.push(left);
        continue;
      }
      matches.push({
        side: 'SILVER',
        round,
        position: positionInRound,
        teamAId: null,
        teamBId: null,
        sourceA:
          left.kind === 'silverRef'
            ? { side: 'SILVER', round: left.round, position: left.position }
            : { side: 'GOLD', round: 0, position: left.goldR0Position },
        sourceB:
          right.kind === 'silverRef'
            ? { side: 'SILVER', round: right.round, position: right.position }
            : { side: 'GOLD', round: 0, position: right.goldR0Position },
      });
      next.push({ kind: 'silverRef', round, position: positionInRound });
    }
    advancers = next;
    round++;
  }

  return matches;
}
