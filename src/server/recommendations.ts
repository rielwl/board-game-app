import 'server-only';

import {
  recommendGames,
  type Attendee,
  type CandidateGame,
  type GameOffer,
  type RecommendationResult,
} from '@/domain/recommendation';
import { prisma } from '@/lib/prisma';

/**
 * Bridges the database to the pure recommendation engine.
 *
 * Everything domain-shaped is assembled here so `src/domain` stays free of
 * Prisma. The candidate pool is exactly the games somebody has explicitly
 * offered for this event, plus the base games those offers depend on.
 */

export type EventRecommendations = RecommendationResult & {
  /** Offered games whose owner has since marked them unavailable. */
  unavailableOffers: { gameId: string; gameName: string; ownerName: string }[];
};

export async function getEventRecommendations(eventId: string): Promise<EventRecommendations> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      targetPlayerCount: true,
      maxDurationMinutes: true,
      complexityTarget: true,
      members: {
        select: {
          userId: true,
          rsvp: true,
          user: { select: { name: true } },
        },
      },
      preferences: {
        select: {
          userId: true,
          minComplexity: true,
          maxComplexity: true,
          maxPlayTime: true,
          noveltyPreference: true,
        },
      },
      requests: { select: { userId: true, gameId: true } },
      offers: { select: { userId: true, gameId: true } },
    },
  });

  if (!event) {
    return {
      targetPlayerCount: 0,
      yesCount: 0,
      maybeCount: 0,
      countedAttendeeCount: 0,
      recommendations: [],
      nearMisses: [],
      noEligibleGamesReason: 'This event no longer exists.',
      unavailableOffers: [],
    };
  }

  const memberIds = event.members.map((m) => m.userId);
  const offeredGameIds = [...new Set(event.offers.map((o) => o.gameId))];

  // An offer only stands while the owner still has the game marked available.
  const ownerships = await prisma.userGame.findMany({
    where: { userId: { in: memberIds } },
    select: { userId: true, gameId: true, available: true, familiarity: true },
  });
  const ownershipKey = (userId: string, gameId: string) => `${userId}:${gameId}`;
  const ownershipByKey = new Map(
    ownerships.map((row) => [ownershipKey(row.userId, row.gameId), row]),
  );

  const nameByUserId = new Map(event.members.map((m) => [m.userId, m.user.name]));

  const liveOffers: GameOffer[] = [];
  const unavailableOffers: EventRecommendations['unavailableOffers'] = [];
  for (const offer of event.offers) {
    const ownership = ownershipByKey.get(ownershipKey(offer.userId, offer.gameId));
    // A missing UserGame row means the owner removed it from their library
    // after offering; treat that the same as unavailable.
    if (ownership?.available) {
      liveOffers.push({ gameId: offer.gameId, userId: offer.userId });
    } else {
      unavailableOffers.push({
        gameId: offer.gameId,
        gameName: '',
        ownerName: nameByUserId.get(offer.userId) ?? 'Someone',
      });
    }
  }

  // Candidate pool: offered games, plus the base games any offered expansion
  // needs so the engine can name them in its explanation.
  const relations = await prisma.gameRelation.findMany({
    where: { expansionId: { in: offeredGameIds } },
    select: { expansionId: true, baseGameId: true },
  });
  const candidateIds = [
    ...new Set([...offeredGameIds, ...relations.map((r) => r.baseGameId)]),
  ];

  const gameRows = await prisma.game.findMany({
    where: { id: { in: candidateIds } },
    include: {
      playerPolls: true,
      baseGames: { select: { baseGameId: true } },
    },
  });

  const games: CandidateGame[] = gameRows.map((game) => {
    const best: number[] = [];
    const recommended: number[] = [];
    const notRecommended: number[] = [];

    for (const poll of game.playerPolls) {
      const total = poll.best + poll.recommended + poll.notRecommended;
      if (total === 0) continue;
      // Classify a count by whichever bucket the community put most votes in.
      if (poll.best >= poll.recommended && poll.best >= poll.notRecommended) {
        best.push(poll.playerCount);
      } else if (poll.recommended >= poll.notRecommended) {
        recommended.push(poll.playerCount);
      } else {
        notRecommended.push(poll.playerCount);
      }
    }

    return {
      id: game.id,
      name: game.name,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      playingTime: game.playingTime,
      minPlayTime: game.minPlayTime,
      maxPlayTime: game.maxPlayTime,
      averageWeight: game.averageWeight,
      numWeightVotes: game.numWeightVotes,
      bayesRating: game.bayesRating,
      averageRating: game.averageRating,
      usersRated: game.usersRated,
      isExpansion: game.isExpansion,
      baseGameIds: game.baseGames.map((r) => r.baseGameId),
      bestPlayerCounts: best,
      recommendedPlayerCounts: recommended,
      notRecommendedPlayerCounts: notRecommended,
    };
  });

  const gameNameById = new Map(gameRows.map((g) => [g.id, g.name]));
  for (const entry of unavailableOffers) {
    entry.gameName = gameNameById.get(entry.gameId) ?? 'A game';
  }

  const preferenceByUserId = new Map(event.preferences.map((p) => [p.userId, p]));
  const requestsByUserId = new Map<string, string[]>();
  for (const request of event.requests) {
    requestsByUserId.set(request.userId, [
      ...(requestsByUserId.get(request.userId) ?? []),
      request.gameId,
    ]);
  }

  const attendees: Attendee[] = event.members.map((member) => {
    const preference = preferenceByUserId.get(member.userId);
    const owned = ownerships.filter((row) => row.userId === member.userId);
    return {
      userId: member.userId,
      name: member.user.name,
      rsvp: member.rsvp,
      preference: preference
        ? {
            minComplexity: preference.minComplexity,
            maxComplexity: preference.maxComplexity,
            maxPlayTime: preference.maxPlayTime,
            noveltyPreference: preference.noveltyPreference,
          }
        : null,
      requestedGameIds: requestsByUserId.get(member.userId) ?? [],
      teachableGameIds: owned
        .filter((row) => row.familiarity === 'CAN_TEACH')
        .map((row) => row.gameId),
      playedGameIds: owned
        .filter((row) => row.familiarity === 'CAN_TEACH' || row.familiarity === 'PLAYED')
        .map((row) => row.gameId),
    };
  });

  const result = recommendGames({
    attendees,
    offers: liveOffers,
    games,
    settings: {
      targetPlayerCount: event.targetPlayerCount,
      maxDurationMinutes: event.maxDurationMinutes,
      complexityTarget: event.complexityTarget,
    },
  });

  return { ...result, unavailableOffers };
}
