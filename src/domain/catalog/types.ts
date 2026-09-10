/**
 * The game catalog abstraction.
 *
 * The application never talks to BoardGameGeek directly; it talks to a
 * `GameCatalogProvider`. That keeps BGG's quirks (XML, 202 queueing, rate
 * limits) in one adapter and lets the whole app run against a fixture provider
 * when BGG is disabled or unreachable.
 */

export type CatalogPlayerPoll = {
  playerCount: number;
  best: number;
  recommended: number;
  notRecommended: number;
};

export type CatalogGame = {
  bggId: number;
  name: string;
  yearPublished: number | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTime: number | null;
  minPlayTime: number | null;
  maxPlayTime: number | null;
  minAge: number | null;
  averageRating: number | null;
  bayesRating: number | null;
  usersRated: number | null;
  averageWeight: number | null;
  numWeightVotes: number | null;
  isExpansion: boolean;
  /** BGG ids of the base games this expansion requires. */
  baseGameBggIds: number[];
  mechanics: string[];
  categories: string[];
  playerPolls: CatalogPlayerPoll[];
};

export type CatalogSearchResult = {
  bggId: number;
  name: string;
  yearPublished: number | null;
  isExpansion: boolean;
};

export type CatalogCollectionItem = {
  bggId: number;
  name: string;
  yearPublished: number | null;
  owned: boolean;
  isExpansion: boolean;
};

export interface GameCatalogProvider {
  /** Stable identifier, surfaced in the UI so users know where data came from. */
  readonly id: 'bgg' | 'fixture';
  /** Human-readable label for attribution. */
  readonly label: string;
  /** False when the provider is switched off by configuration. */
  readonly enabled: boolean;

  search(query: string, options?: { limit?: number }): Promise<CatalogSearchResult[]>;

  /** Detail lookup. Ids are batched internally within the API's documented limit. */
  getGames(bggIds: number[]): Promise<CatalogGame[]>;

  /** Public collection import. Only owned items are returned. */
  getCollection(username: string): Promise<CatalogCollectionItem[]>;
}

/**
 * Thrown when the upstream catalog cannot answer. Callers are expected to
 * catch this and degrade to manual entry rather than failing the request.
 */
export class CatalogUnavailableError extends Error {
  readonly cause?: unknown;
  readonly retryable: boolean;

  constructor(message: string, options: { cause?: unknown; retryable?: boolean } = {}) {
    super(message);
    this.name = 'CatalogUnavailableError';
    this.cause = options.cause;
    this.retryable = options.retryable ?? true;
  }
}

/** Thrown when a username has no public collection, or does not exist. */
export class CatalogNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogNotFoundError';
  }
}
