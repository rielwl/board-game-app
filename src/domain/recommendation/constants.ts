/**
 * Every tunable number the recommendation engine uses lives here, so the
 * scoring policy can be read and changed in one place.
 */

/** Component maxima. These sum to 100. */
export const WEIGHTS = {
  playerCount: 25,
  complexity: 25,
  duration: 15,
  requests: 20,
  rating: 10,
  teaching: 5,
} as const;

export const MAX_SCORE = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

export const PLAYER_COUNT = {
  /** Community voted this count "Best". */
  bestFraction: 1,
  /** Community voted "Recommended" but not "Best". */
  recommendedFraction: 0.8,
  /** Inside the box range, but the community votes against this count. */
  notRecommendedFraction: 0.4,
  /** Inside the box range with no community opinion for this specific count. */
  withinRangeFraction: 0.72,
  /** Inside the box range and no poll data exists for the game at all. */
  noPollDataFraction: 0.8,
} as const;

export const COMPLEXITY = {
  /** Split between "fits the attendees" and "hits the organizer's target". */
  attendeeFitShare: 0.7,
  organizerTargetShare: 0.3,
  /** A weight this far from the organizer's target scores zero on that share. */
  targetToleranceWeight: 2,
  /** Awarded when the game has no community weight at all. */
  unknownWeightFraction: 0.6,
  /** Assumed preference range when an attendee expressed none. */
  defaultMin: 1,
  defaultMax: 5,
} as const;

export const DURATION = {
  /** Awarded when play time is unknown. */
  unknownDurationFraction: 0.6,
  /**
   * Grace period, in minutes: a game this much over an attendee's stated cap
   * still counts as a partial fit rather than a flat miss.
   */
  graceMinutes: 15,
  partialFitCredit: 0.5,
} as const;

export const REQUESTS = {
  /** Number of counted attendees requesting a game for full marks. */
  saturationCount: 2,
  /** Fraction of the request weight a Maybe attendee's request is worth. */
  maybeRequestFraction: 0.5,
} as const;

export const RATING = {
  /** Bayesian shrinkage strength when only a raw average is available. */
  priorVotes: 50,
  priorRating: 5.5,
  /** Ratings map linearly from `floor` to `ceiling` onto 0..1. */
  floor: 5.5,
  ceiling: 8.5,
  /** Awarded when the game has no rating data at all. */
  unknownRatingFraction: 0.4,
} as const;

export const TEACHING = {
  /** A Yes attendee can teach it. */
  confirmedFraction: 1,
  /** Only a Maybe attendee can teach it. */
  tentativeFraction: 0.5,
} as const;

/** Confidence penalties, subtracted from a starting confidence of 1. */
export const CONFIDENCE_PENALTIES = {
  missingWeight: 0.25,
  missingRating: 0.15,
  missingPlayerPolls: 0.1,
  missingDuration: 0.15,
  missingPlayerRange: 0.2,
} as const;

export const MIN_CONFIDENCE = 0.2;

/** "Pick for us" draws from this many top eligible games. */
export const PICK_FOR_US_POOL_SIZE = 3;

/**
 * Exponent applied to scores when weighting the "Pick for us" draw. Above 1
 * favours the leader; 1 would make the draw proportional to raw score.
 */
export const PICK_FOR_US_WEIGHT_EXPONENT = 2;
