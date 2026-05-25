import { describe, it, expect } from 'vitest';
import {
  generateRotatingIndividualAmericana,
  distributeAcrossCourts,
} from '@/modules/leagues/application/americana-generator';

describe('generateRotatingIndividualAmericana', () => {
  it('produces the expected number of matches for 8 players × 2 courts × 4 rounds', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const fixtures = generateRotatingIndividualAmericana(players, 2, { rounds: 4 });
    // 4 rondas × 2 pistas = 8 partidos máximo
    expect(fixtures).toHaveLength(8);
    // Cada partido tiene 4 jugadores únicos
    for (const f of fixtures) {
      const all = new Set([...f.sideAUsers, ...f.sideBUsers]);
      expect(all.size).toBe(4);
    }
  });

  it('keeps games played roughly balanced across players', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const fixtures = generateRotatingIndividualAmericana(players, 2, { rounds: 4 });
    const count = new Map<string, number>();
    for (const f of fixtures) {
      for (const u of [...f.sideAUsers, ...f.sideBUsers]) {
        count.set(u, (count.get(u) ?? 0) + 1);
      }
    }
    const values = [...count.values()];
    // Con 8 jugadores, 2 pistas, 4 rondas → 16 slots para 8 jugadores = 2 cada uno
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it('avoids repeating partnerships when possible', () => {
    const players = ['p1', 'p2', 'p3', 'p4'];
    // Con 4 jugadores, 1 pista, 3 rondas: cada pareja única exactamente una vez
    const fixtures = generateRotatingIndividualAmericana(players, 1, { rounds: 3 });
    expect(fixtures).toHaveLength(3);
    const partnerships = new Set<string>();
    for (const f of fixtures) {
      const a = [...f.sideAUsers].sort().join('-');
      const b = [...f.sideBUsers].sort().join('-');
      partnerships.add(a);
      partnerships.add(b);
    }
    // En 3 rondas con 4 jugadores debe haber 6 parejas distintas (las únicas posibles)
    expect(partnerships.size).toBe(6);
  });

  it('throws when players are out of range', () => {
    expect(() => generateRotatingIndividualAmericana(['p1', 'p2', 'p3'], 1, { rounds: 1 })).toThrow();
    expect(() => generateRotatingIndividualAmericana(Array.from({ length: 17 }, (_, i) => `p${i}`), 1, { rounds: 1 })).toThrow();
  });

  it('throws when courts are out of range', () => {
    expect(() => generateRotatingIndividualAmericana(['p1', 'p2', 'p3', 'p4'], 0)).toThrow();
    expect(() => generateRotatingIndividualAmericana(['p1', 'p2', 'p3', 'p4'], 5)).toThrow();
  });

  it('caps parallel matches when fewer players than 4 × courts', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5']; // sólo 4 caben simultáneos
    const fixtures = generateRotatingIndividualAmericana(players, 3, { rounds: 2 });
    // Aunque pidan 3 pistas, máximo 1 partido simultáneo (5/4 = 1)
    const courtsUsed = new Set(fixtures.map((f) => `${f.round}-${f.court}`));
    expect(fixtures.every((f) => f.court === 1)).toBe(true);
    expect(courtsUsed.size).toBe(2);
  });
});

describe('distributeAcrossCourts (FIXED_PAIRS)', () => {
  it('assigns court 1..N within each round chunk', () => {
    const fixtures = [
      { round: 1, teamAId: 't1', teamBId: 't2' },
      { round: 1, teamAId: 't3', teamBId: 't4' },
      { round: 1, teamAId: 't5', teamBId: 't6' },
      { round: 2, teamAId: 't1', teamBId: 't3' },
    ];
    const out = distributeAcrossCourts(fixtures, 2);
    // Round 1 con 3 partidos en 2 pistas → 2 jornadas: jornada 1 con pista 1+2, jornada 2 con pista 1.
    // Round 2 con 1 partido → jornada 3 con pista 1.
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ round: 1, court: 1, teamAId: 't1', teamBId: 't2' });
    expect(out[1]).toEqual({ round: 1, court: 2, teamAId: 't3', teamBId: 't4' });
    expect(out[2]).toEqual({ round: 2, court: 1, teamAId: 't5', teamBId: 't6' });
    expect(out[3]).toEqual({ round: 3, court: 1, teamAId: 't1', teamBId: 't3' });
  });
});
