import { describe, it, expect } from 'vitest';
import { generateFixtures } from '@/modules/leagues/application/fixture-generator';

describe('generateFixtures', () => {
  it('generates correct number of matches for 4 teams (round-robin)', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    // 4 teams = 4*(4-1)/2 = 6 matches
    expect(matches).toHaveLength(6);
  });

  it('each pair plays exactly once', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    const pairs = matches.map((m) => [m.teamAId, m.teamBId].sort().join('-'));
    expect(new Set(pairs).size).toBe(6);
  });

  it('generates correct number of matches for 3 teams (odd)', () => {
    const teams = ['t1', 't2', 't3'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    // 3 teams = 3*(3-1)/2 = 3 matches
    expect(matches).toHaveLength(3);
  });

  it('generates correct number of matches for 5 teams', () => {
    const teams = ['t1', 't2', 't3', 't4', 't5'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    // 5 teams = 5*(5-1)/2 = 10 matches
    expect(matches).toHaveLength(10);
  });

  it('each match has a deadlineAt set to startDate + deadlineDays', () => {
    const startDate = new Date('2025-01-01');
    const matches = generateFixtures(['t1', 't2'], startDate, 21);
    const expected = new Date('2025-01-01');
    expected.setDate(expected.getDate() + 21);
    expect(matches[0]!.deadlineAt.getTime()).toBe(expected.getTime());
  });

  it('no team plays itself', () => {
    const teams = ['t1', 't2', 't3', 't4'];
    const matches = generateFixtures(teams, new Date('2025-01-01'), 21);
    matches.forEach((m) => expect(m.teamAId).not.toBe(m.teamBId));
  });
});
