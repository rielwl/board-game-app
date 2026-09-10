/**
 * Plain data types for the recommendation engine.
 *
 * Nothing in `src/domain` imports Prisma, Next.js or `server-only`: the engine
 * is a pure function of its input so it can be unit tested directly. The
 * mapping from database rows to these shapes lives in
 * `src/server/recommendations.ts`.
 */

export type RsvpStatus = 'YES' | 'MAYBE' | 'NO' | 'AWAITING';

export type NoveltyPreference = 'FAMILIAR' | 'NEW' | 'EITHER';

export type CandidateGame = {
  id: string;
  name: string;
  minPlayers: number | null;
  maxPlayers: number | null;
  /** BGG's headline playing time, in minutes. */
  playingTime: number | null;
  minPlayTime: number | null;
  maxPlayTime: number | null;
  /** BGG community weight, 1..5. */
  averageWeight: number | null;
  numWeightVotes: number | null;
  /** BGG Bayesian / "geek" rating. */
  bayesRating: number | null;
  averageRating: number | null;
  usersRated: number | null;
  isExpansion: boolean;
  /** Ids of base games this expansion requires. Empty for base games. */
  baseGameIds: string[];
  /** Player counts the community voted "Best". */
  bestPlayerCounts: number[];
  /** Player counts the community voted "Recommended" (excluding "Best"). */
  recommendedPlayerCounts: number[];
  /** Player counts the community voted "Not Recommended". */
  notRecommendedPlayerCounts: number[];
};

export type AttendeePreference = {
  minComplexity: number | null;
  maxComplexity: number | null;
  maxPlayTime: number | null;
  noveltyPreference: NoveltyPreference;
};

export type Attendee = {
  userId: string;
  name: string;
  rsvp: RsvpStatus;
  preference: AttendeePreference | null;
  /** Games this attendee specifically asked for at this event. */
  requestedGameIds: string[];
  /** Games this attendee marked CAN_TEACH in their library. */
  teachableGameIds: string[];
  /** Games this attendee has played at least once (PLAYED or CAN_TEACH). */
  playedGameIds: string[];
};

/** An explicit promise to bring a game. Owning is not offering. */
export type GameOffer = {
  gameId: string;
  userId: string;
};

export type RecommendationSettings = {
  /** Organizer override. Defaults to the number of Yes attendees. */
  targetPlayerCount?: number | null;
  /** Hard cap. Games longer than this are ineligible. */
  maxDurationMinutes?: number | null;
  /** Soft target on the 1..5 BGG weight scale. */
  complexityTarget?: number | null;
  /** Whether Maybe attendees count toward the group. Off by default. */
  countMaybeAttendees?: boolean;
};

export type RecommendationInput = {
  attendees: Attendee[];
  offers: GameOffer[];
  games: CandidateGame[];
  settings?: RecommendationSettings;
};

export type ScoreComponents = {
  playerCount: number;
  complexity: number;
  duration: number;
  requests: number;
  rating: number;
  teaching: number;
};

export type OfferedBy = {
  userId: string;
  name: string;
  rsvp: RsvpStatus;
};

export type Recommendation = {
  gameId: string;
  name: string;
  /** 0..100, rounded to one decimal. */
  total: number;
  components: ScoreComponents;
  /** Short factual statements about why this scored as it did. */
  reasons: string[];
  /** Caveats the organizer should see before locking this in. */
  warnings: string[];
  offeredBy: OfferedBy[];
  /** 0..1. Drops when BGG data is missing; never affects `total`. */
  confidence: number;
};

export type HardRule =
  | 'NO_YES_ATTENDEE_OFFER'
  | 'PLAYER_COUNT_OUT_OF_RANGE'
  | 'EXPANSION_WITHOUT_BASE'
  | 'EXCEEDS_MAX_DURATION';

export type NearMiss = {
  gameId: string;
  name: string;
  /** The rules this game failed, with a human-readable explanation each. */
  failures: { rule: HardRule; reason: string }[];
  /** What it would have scored had it been eligible. */
  hypotheticalTotal: number;
  warnings: string[];
  offeredBy: OfferedBy[];
};

export type RecommendationResult = {
  targetPlayerCount: number;
  yesCount: number;
  maybeCount: number;
  countedAttendeeCount: number;
  /** Eligible games, best first. */
  recommendations: Recommendation[];
  /** Games that failed at least one hard rule, closest first. */
  nearMisses: NearMiss[];
  /**
   * Set when nothing is eligible: a plain-language summary of why, so the UI
   * can explain the empty state instead of showing a blank list.
   */
  noEligibleGamesReason: string | null;
};
