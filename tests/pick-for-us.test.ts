import { describe, expect, it } from 'vitest';

import { PICK_FOR_US_POOL_SIZE, pickForUs, type Recommendation } from '@/domain/recommendation';

function rec(gameId: string, total: number, name = gameId): Recommendation {
  return {
    gameId,
    name,
    total,
    components: {
      playerCount: 0,
      complexity: 0,
      duration: 0,
      requests: 0,
      rating: 0,
      teaching: 0,
    },
    reasons: [],
    warnings: [],
    offeredBy: [],
    confidence: 1,
  };
}

describe('pickForUs', () => {
  it('returns null when nothing is eligible', () => {
    expect(pickForUs([])).toBeNull();
  });

  it('only ever draws from the top three eligible games', () => {
    const eligible = [
      rec('a', 90),
      rec('b', 80),
      rec('c', 70),
      rec('d', 60),
      rec('e', 10),
    ];

    // Sweep the whole unit interval: nothing outside the top three may win.
    const winners = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const result = pickForUs(eligible, () => i / 1000);
      winners.add(result!.picked.gameId);
    }

    expect([...winners].sort()).toEqual(['a', 'b', 'c']);
    expect(PICK_FOR_US_POOL_SIZE).toBe(3);
  });

  it('cannot pick a game that was not passed in as eligible', () => {
    const eligible = [rec('only', 42)];
    for (let i = 0; i < 100; i += 1) {
      expect(pickForUs(eligible, () => i / 100)!.picked.gameId).toBe('only');
    }
  });

  it('reports the probability of each game in the draw', () => {
    const result = pickForUs([rec('a', 90), rec('b', 80), rec('c', 70)], () => 0)!;

    expect(result.pool).toHaveLength(3);
    const sum = result.pool.reduce((total, entry) => total + entry.probability, 0);
    expect(sum).toBeCloseTo(1, 2);
    // Higher-scoring games must be likelier, but not certain.
    expect(result.pool[0]!.probability).toBeGreaterThan(result.pool[2]!.probability);
    expect(result.pool[0]!.probability).toBeLessThan(1);
  });

  it('favours the leader without making the draw deterministic', () => {
    const eligible = [rec('a', 95), rec('b', 60), rec('c', 55)];

    let leaderWins = 0;
    const samples = 2000;
    for (let i = 0; i < samples; i += 1) {
      if (pickForUs(eligible, () => i / samples)!.picked.gameId === 'a') leaderWins += 1;
    }

    const share = leaderWins / samples;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.9);
  });

  it('is deterministic for a given random value', () => {
    const eligible = [rec('a', 90), rec('b', 80), rec('c', 70)];
    const first = pickForUs(eligible, () => 0.5)!;
    const second = pickForUs(eligible, () => 0.5)!;
    expect(first.picked.gameId).toBe(second.picked.gameId);
  });

  it('handles a random value of exactly 1 without falling off the end', () => {
    const eligible = [rec('a', 90), rec('b', 80), rec('c', 70)];
    const result = pickForUs(eligible, () => 1);
    expect(result).not.toBeNull();
    expect(['a', 'b', 'c']).toContain(result!.picked.gameId);
  });

  it('gives a zero-scoring game a non-zero chance rather than dividing by zero', () => {
    const result = pickForUs([rec('a', 0), rec('b', 0)], () => 0.5);
    expect(result).not.toBeNull();
    expect(result!.pool.every((entry) => entry.probability > 0)).toBe(true);
  });
});
