// Generador de fixtures para competiciones tipo AMERICANA.
//
// Dos variantes:
//   - ROTATING_INDIVIDUAL: N jugadores individuales rotan partners cada ronda.
//     Algoritmo greedy: cada ronda emparejamos primero a los jugadores que
//     menos partidos han jugado, luego les damos como compañero al que menos
//     veces hayan jugado con él, y como rivales otra pareja construida igual.
//   - FIXED_PAIRS: las parejas inscritas (Teams) hacen un round-robin clásico
//     y se reparten en las pistas paralelas disponibles.
//
// Restricciones razonadas con el usuario: 4–16 participantes, 1–4 pistas. El
// generador NO devuelve `Match` de Prisma; devuelve descripciones puras que
// el activate transforma en filas (Match + MatchParticipant cuando aplique).

export type AmericanaRotatingFixture = {
  round: number; // 1-based
  court: number; // 1-based
  sideAUsers: [string, string]; // userIds de la pareja A
  sideBUsers: [string, string]; // userIds de la pareja B
};

export type AmericanaPairsFixture = {
  round: number;
  court: number;
  teamAId: string;
  teamBId: string;
};

export type AmericanaGeneratorOptions = {
  rounds?: number; // si no se pasa, usamos un default sensato por nº de jugadores
};

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 16;
const MIN_COURTS = 1;
const MAX_COURTS = 4;

// Por defecto, en un evento social de ~2-3h se juegan estas rondas según
// nº de participantes. El admin puede sobreescribir desde el wizard.
function defaultRoundsFor(nPlayers: number): number {
  if (nPlayers <= 4) return 3;
  if (nPlayers <= 6) return 5;
  if (nPlayers <= 8) return 7;
  if (nPlayers <= 12) return 8;
  return 8;
}

export function generateRotatingIndividualAmericana(
  userIds: string[],
  courts: number,
  opts: AmericanaGeneratorOptions = {},
): AmericanaRotatingFixture[] {
  if (userIds.length < MIN_PLAYERS || userIds.length > MAX_PLAYERS) {
    throw new Error(
      `Americana ROTATING_INDIVIDUAL admite entre ${MIN_PLAYERS} y ${MAX_PLAYERS} jugadores (recibidos: ${userIds.length}).`,
    );
  }
  if (courts < MIN_COURTS || courts > MAX_COURTS) {
    throw new Error(`Pistas válidas: ${MIN_COURTS}–${MAX_COURTS} (recibidas: ${courts}).`);
  }

  const players = [...userIds];
  const N = players.length;
  const rounds = Math.max(1, opts.rounds ?? defaultRoundsFor(N));
  // Capacidad por ronda = min(courts, floor(N/4)). Más pistas que partidos
  // simultáneos posibles es desperdicio (los pares libres descansan).
  const maxParallel = Math.min(courts, Math.floor(N / 4));
  if (maxParallel < 1) {
    throw new Error('No hay suficientes jugadores para formar un partido (mínimo 4).');
  }

  // Matrices de seguimiento — partnerCount[a][b] = veces que a y b han jugado
  // como compañeros; opponentCount[a][b] = veces que se han enfrentado.
  // Usamos Map para no asumir ordenación de ids.
  const partnerCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();
  const gamesPlayed = new Map<string, number>();
  for (const p of players) {
    partnerCount.set(p, new Map());
    opponentCount.set(p, new Map());
    gamesPlayed.set(p, 0);
  }

  const inc = (mapMap: Map<string, Map<string, number>>, a: string, b: string) => {
    const row = mapMap.get(a)!;
    row.set(b, (row.get(b) ?? 0) + 1);
  };
  const get = (mapMap: Map<string, Map<string, number>>, a: string, b: string): number => {
    return mapMap.get(a)?.get(b) ?? 0;
  };

  const result: AmericanaRotatingFixture[] = [];

  for (let round = 1; round <= rounds; round++) {
    const available = new Set(players);
    let court = 1;

    while (available.size >= 4 && court <= maxParallel) {
      // Elige al jugador con menos partidos jugados; desempate por id (estable).
      const sorted = [...available].sort((a, b) => {
        const diff = (gamesPlayed.get(a) ?? 0) - (gamesPlayed.get(b) ?? 0);
        return diff !== 0 ? diff : a.localeCompare(b);
      });

      const p1 = sorted[0]!;
      available.delete(p1);

      // Compañero: jugador del pool con menor partnerCount con p1; desempate
      // por menos partidos jugados, luego id.
      const candidatesForP2 = [...available].sort((a, b) => {
        const cA = get(partnerCount, p1, a);
        const cB = get(partnerCount, p1, b);
        if (cA !== cB) return cA - cB;
        const gA = gamesPlayed.get(a) ?? 0;
        const gB = gamesPlayed.get(b) ?? 0;
        if (gA !== gB) return gA - gB;
        return a.localeCompare(b);
      });
      const p2 = candidatesForP2[0]!;
      available.delete(p2);

      // Rival 1: el de menos partidos jugados restante; desempate por menos
      // veces que se haya enfrentado a p1.
      const candidatesForP3 = [...available].sort((a, b) => {
        const gA = gamesPlayed.get(a) ?? 0;
        const gB = gamesPlayed.get(b) ?? 0;
        if (gA !== gB) return gA - gB;
        const oA = get(opponentCount, p1, a) + get(opponentCount, p2, a);
        const oB = get(opponentCount, p1, b) + get(opponentCount, p2, b);
        if (oA !== oB) return oA - oB;
        return a.localeCompare(b);
      });
      const p3 = candidatesForP3[0]!;
      available.delete(p3);

      // Rival 2: el que menos haya jugado con p3 como pareja; desempate por
      // menos enfrentamientos con A.
      const candidatesForP4 = [...available].sort((a, b) => {
        const cA = get(partnerCount, p3, a);
        const cB = get(partnerCount, p3, b);
        if (cA !== cB) return cA - cB;
        const oA = get(opponentCount, p1, a) + get(opponentCount, p2, a);
        const oB = get(opponentCount, p1, b) + get(opponentCount, p2, b);
        if (oA !== oB) return oA - oB;
        return a.localeCompare(b);
      });
      const p4 = candidatesForP4[0]!;
      available.delete(p4);

      result.push({
        round,
        court,
        sideAUsers: [p1, p2],
        sideBUsers: [p3, p4],
      });

      // Actualiza contadores
      inc(partnerCount, p1, p2);
      inc(partnerCount, p2, p1);
      inc(partnerCount, p3, p4);
      inc(partnerCount, p4, p3);
      for (const a of [p1, p2]) {
        for (const b of [p3, p4]) {
          inc(opponentCount, a, b);
          inc(opponentCount, b, a);
        }
      }
      for (const p of [p1, p2, p3, p4]) {
        gamesPlayed.set(p, (gamesPlayed.get(p) ?? 0) + 1);
      }

      court++;
    }
  }

  return result;
}

// Para FIXED_PAIRS: dado un round-robin clásico entre N teams, asignar pista
// a cada partido aprovechando hasta `courts` pistas paralelas. Cada ronda
// del round-robin se reparte en chunks; si la ronda tiene más partidos que
// pistas, se generan rondas-bis (jornada 1a, 1b, etc.).
export function distributeAcrossCourts<T extends { round: number; teamAId: string; teamBId: string }>(
  fixtures: T[],
  courts: number,
): Array<T & { court: number; round: number }> {
  if (courts < MIN_COURTS || courts > MAX_COURTS) {
    throw new Error(`Pistas válidas: ${MIN_COURTS}–${MAX_COURTS} (recibidas: ${courts}).`);
  }

  const byRound = new Map<number, T[]>();
  for (const f of fixtures) {
    const list = byRound.get(f.round) ?? [];
    list.push(f);
    byRound.set(f.round, list);
  }

  const out: Array<T & { court: number; round: number }> = [];
  let outputRound = 1;
  for (const round of [...byRound.keys()].sort((a, b) => a - b)) {
    const matchesThisRound = byRound.get(round)!;
    for (let i = 0; i < matchesThisRound.length; i += courts) {
      const chunk = matchesThisRound.slice(i, i + courts);
      chunk.forEach((m, idx) => {
        out.push({ ...m, round: outputRound, court: idx + 1 });
      });
      outputRound++;
    }
  }
  return out;
}
