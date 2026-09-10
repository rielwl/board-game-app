import { PICK_FOR_US_POOL_SIZE, PICK_FOR_US_WEIGHT_EXPONENT } from './constants';
import type { Recommendation } from './types';

export type PickResult = {
  picked: Recommendation;
  /** The games that were in the draw, with the probability each one had. */
  pool: { gameId: string; name: string; probability: number }[];
};

/**
 * Weighted random draw from the top eligible recommendations.
 *
 * Only games the caller has already established as eligible are passed in, so
 * "Pick for us" can never land on an ineligible game. `random` is injectable
 * purely so tests can be deterministic.
 */
export function pickForUs(
  eligible: Recommendation[],
  random: () => number = Math.random,
  poolSize: number = PICK_FOR_US_POOL_SIZE,
): PickResult | null {
  if (eligible.length === 0) return null;

  const pool = [...eligible]
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, Math.max(1, poolSize));

  // A floor of 1 keeps a zero-scoring game from having zero chance, and the
  // exponent tilts the draw toward the leader without making it a foregone
  // conclusion.
  const weights = pool.map((r) => Math.pow(Math.max(r.total, 1), PICK_FOR_US_WEIGHT_EXPONENT));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const probabilities = weights.map((w) => w / totalWeight);

  const roll = Math.min(Math.max(random(), 0), 0.999999999) * totalWeight;
  let cursor = 0;
  let pickedIndex = pool.length - 1;
  for (let i = 0; i < pool.length; i += 1) {
    cursor += weights[i]!;
    if (roll < cursor) {
      pickedIndex = i;
      break;
    }
  }

  return {
    picked: pool[pickedIndex]!,
    pool: pool.map((r, i) => ({
      gameId: r.gameId,
      name: r.name,
      probability: Math.round(probabilities[i]! * 1000) / 1000,
    })),
  };
}
