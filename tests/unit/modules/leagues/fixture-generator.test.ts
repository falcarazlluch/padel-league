import { describe, it, expect } from 'vitest';
import { generateFixtures } from '@/modules/leagues/application/fixture-generator';

describe('generateFixtures', () => {
  it('generates N-1 rounds for even N teams', () => {
    const teams = ['t1', 't2', 't3', 't4']; // 4 teams → 3 rounds
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(3);
  });

  it('generates N rounds for odd N teams (bye)', () => {
    const teams = ['t1', 't2', 't3']; // 3 teams → 3 rounds
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(3);
  });

  it('generates correct total match count for 4 teams', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    expect(matches).toHaveLength(6);
  });

  it('generates correct total match count for 3 teams', () => {
    const teams = ['t1', 't2', 't3'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    expect(matches).toHaveLength(3);
  });

  it('generates correct total match count for 5 teams', () => {
    const teams = ['t1', 't2', 't3', 't4', 't5'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    expect(matches).toHaveLength(10);
  });

  it('each pair plays exactly once', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    const pairs = matches.map((m) => [m.teamAId, m.teamBId].sort().join('-'));
    expect(new Set(pairs).size).toBe(6);
  });

  it('no team plays twice in the same round', () => {
    const teams = ['t1', 't2', 't3', 't4', 't5', 't6'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    const byRound = new Map<number, string[]>();
    for (const m of matches) {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round)!.push(m.teamAId, m.teamBId);
    }
    for (const [, teamList] of byRound) {
      expect(new Set(teamList).size).toBe(teamList.length);
    }
  });

  it('each match has deadlineAt = startDate + deadlineDays', () => {
    const startDate = new Date('2025-01-01');
    const matches = generateFixtures(['t1', 't2'], startDate, 21);
    const expected = new Date('2025-01-22');
    expect(matches[0]!.deadlineAt.getTime()).toBe(expected.getTime());
  });

  it('no team plays itself', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    matches.forEach((m) => expect(m.teamAId).not.toBe(m.teamBId));
  });

  it('round values start at 1', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    const minRound = Math.min(...matches.map((m) => m.round));
    expect(minRound).toBe(1);
  });
});
