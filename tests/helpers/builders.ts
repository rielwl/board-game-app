import type {
  Attendee,
  CandidateGame,
  GameOffer,
  RecommendationInput,
} from '@/domain/recommendation';

/**
 * Builders for recommendation-engine tests.
 *
 * Each one supplies a complete, sensible default so a test only has to state
 * the field it actually cares about. That keeps the assertions readable and
 * stops an unrelated schema addition from breaking every test at once.
 */

export function makeGame(overrides: Partial<CandidateGame> & { id: string }): CandidateGame {
  return {
    name: `Game ${overrides.id}`,
    minPlayers: 2,
    maxPlayers: 6,
    playingTime: 60,
    minPlayTime: 45,
    maxPlayTime: 60,
    averageWeight: 2.5,
    numWeightVotes: 5000,
    bayesRating: 7.2,
    averageRating: 7.4,
    usersRated: 20000,
    isExpansion: false,
    baseGameIds: [],
    bestPlayerCounts: [],
    recommendedPlayerCounts: [],
    notRecommendedPlayerCounts: [],
    ...overrides,
  };
}

export function makeAttendee(overrides: Partial<Attendee> & { userId: string }): Attendee {
  return {
    name: overrides.userId,
    rsvp: 'YES',
    preference: null,
    requestedGameIds: [],
    teachableGameIds: [],
    playedGameIds: [],
    ...overrides,
  };
}

export function offer(userId: string, gameId: string): GameOffer {
  return { userId, gameId };
}

export function makeInput(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    attendees: [],
    offers: [],
    games: [],
    ...overrides,
  };
}
