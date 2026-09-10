import {
  COMPLEXITY,
  CONFIDENCE_PENALTIES,
  DURATION,
  MIN_CONFIDENCE,
  PLAYER_COUNT,
  RATING,
  REQUESTS,
  TEACHING,
  WEIGHTS,
} from './constants';
import type {
  Attendee,
  CandidateGame,
  HardRule,
  NearMiss,
  OfferedBy,
  Recommendation,
  RecommendationInput,
  RecommendationResult,
  ScoreComponents,
} from './types';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const round1 = (value: number) => Math.round(value * 10) / 10;

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  count === 1 ? singular : pluralForm;

function listNames(names: string[], limit = 2): string {
  if (names.length === 0) return '';
  if (names.length <= limit) {
    if (names.length === 1) return names[0]!;
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, limit).join(', ')} and ${names.length - limit} others`;
}

/** BGG's headline time, falling back to the max/min range when it is absent. */
function effectiveDuration(game: CandidateGame): number | null {
  return game.playingTime ?? game.maxPlayTime ?? game.minPlayTime ?? null;
}

/**
 * Shrinks a raw average toward a neutral prior so a 9.5 from six voters does
 * not outrank a 8.1 from sixty thousand.
 */
function shrunkRating(game: CandidateGame): number | null {
  if (game.bayesRating != null) return game.bayesRating;
  if (game.averageRating == null) return null;
  const votes = game.usersRated ?? 0;
  return (
    (game.averageRating * votes + RATING.priorRating * RATING.priorVotes) /
    (votes + RATING.priorVotes)
  );
}

// ---------------------------------------------------------------------------
// Component scores
// ---------------------------------------------------------------------------

type ComponentOutcome = {
  score: number;
  reasons: string[];
  warnings: string[];
  confidencePenalty: number;
};

function scorePlayerCount(game: CandidateGame, target: number): ComponentOutcome {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let confidencePenalty = 0;

  const hasRange = game.minPlayers != null || game.maxPlayers != null;
  if (!hasRange) {
    warnings.push('Supported player count is unknown');
    confidencePenalty += CONFIDENCE_PENALTIES.missingPlayerRange;
  }

  const hasPolls =
    game.bestPlayerCounts.length > 0 ||
    game.recommendedPlayerCounts.length > 0 ||
    game.notRecommendedPlayerCounts.length > 0;

  let fraction: number;
  if (game.bestPlayerCounts.includes(target)) {
    fraction = PLAYER_COUNT.bestFraction;
    reasons.push(`Best with ${target} ${plural(target, 'player')}`);
  } else if (game.recommendedPlayerCounts.includes(target)) {
    fraction = PLAYER_COUNT.recommendedFraction;
    reasons.push(`Community-recommended at ${target} ${plural(target, 'player')}`);
  } else if (game.notRecommendedPlayerCounts.includes(target)) {
    fraction = PLAYER_COUNT.notRecommendedFraction;
    reasons.push(`Supports ${target} ${plural(target, 'player')}`);
    warnings.push(`The community does not recommend this at ${target} players`);
  } else if (hasPolls) {
    fraction = PLAYER_COUNT.withinRangeFraction;
    reasons.push(`Fits ${target} ${plural(target, 'player')}`);
  } else {
    fraction = PLAYER_COUNT.noPollDataFraction;
    reasons.push(`Fits ${target} ${plural(target, 'player')}`);
    confidencePenalty += CONFIDENCE_PENALTIES.missingPlayerPolls;
  }

  return { score: WEIGHTS.playerCount * fraction, reasons, warnings, confidencePenalty };
}

function scoreComplexity(
  game: CandidateGame,
  counted: Attendee[],
  complexityTarget: number | null,
): ComponentOutcome {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const weight = game.averageWeight;
  if (weight == null) {
    warnings.push('Complexity data is missing');
    return {
      score: WEIGHTS.complexity * COMPLEXITY.unknownWeightFraction,
      reasons,
      warnings,
      confidencePenalty: CONFIDENCE_PENALTIES.missingWeight,
    };
  }

  const satisfies = (attendee: Attendee) => {
    const min = attendee.preference?.minComplexity ?? COMPLEXITY.defaultMin;
    const max = attendee.preference?.maxComplexity ?? COMPLEXITY.defaultMax;
    return weight >= min && weight <= max;
  };

  const attendeeFit = counted.length === 0 ? 1 : counted.filter(satisfies).length / counted.length;

  const withExplicitPref = counted.filter(
    (a) => a.preference?.minComplexity != null || a.preference?.maxComplexity != null,
  );
  if (withExplicitPref.length > 0) {
    const met = withExplicitPref.filter(satisfies).length;
    reasons.push(
      `Within ${met} of ${withExplicitPref.length} ${plural(
        withExplicitPref.length,
        'attendee',
      )}' complexity preferences`,
    );
    if (met < withExplicitPref.length) {
      const missed = withExplicitPref.length - met;
      warnings.push(
        `Outside ${missed} ${plural(missed, 'attendee')}' complexity ${plural(
          missed,
          'preference',
        )}`,
      );
    }
  }

  let targetFit = 1;
  if (complexityTarget != null) {
    targetFit = clamp(
      1 - Math.abs(weight - complexityTarget) / COMPLEXITY.targetToleranceWeight,
      0,
      1,
    );
    if (targetFit >= 0.75) {
      reasons.push(`Complexity ${weight.toFixed(1)} is close to your ${complexityTarget} target`);
    } else {
      warnings.push(
        `Complexity ${weight.toFixed(1)} is away from your ${complexityTarget} target`,
      );
    }
  }

  const fraction =
    COMPLEXITY.attendeeFitShare * attendeeFit + COMPLEXITY.organizerTargetShare * targetFit;

  const votes = game.numWeightVotes ?? 0;
  const confidencePenalty = votes > 0 && votes < 20 ? CONFIDENCE_PENALTIES.missingWeight / 2 : 0;
  if (votes > 0 && votes < 20) {
    warnings.push(`Complexity is based on only ${votes} ${plural(votes, 'vote')}`);
  }

  return { score: WEIGHTS.complexity * fraction, reasons, warnings, confidencePenalty };
}

function scoreDuration(game: CandidateGame, counted: Attendee[]): ComponentOutcome {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const duration = effectiveDuration(game);
  if (duration == null) {
    warnings.push('Play time is unknown');
    return {
      score: WEIGHTS.duration * DURATION.unknownDurationFraction,
      reasons,
      warnings,
      confidencePenalty: CONFIDENCE_PENALTIES.missingDuration,
    };
  }

  const withCap = counted.filter((a) => a.preference?.maxPlayTime != null);
  let credit = 0;
  let overCount = 0;

  for (const attendee of counted) {
    const cap = attendee.preference?.maxPlayTime;
    if (cap == null) {
      credit += 1;
      continue;
    }
    if (duration <= cap) {
      credit += 1;
    } else if (duration <= cap + DURATION.graceMinutes) {
      credit += DURATION.partialFitCredit;
      overCount += 1;
    } else {
      overCount += 1;
    }
  }

  const fraction = counted.length === 0 ? 1 : credit / counted.length;

  if (overCount > 0) {
    warnings.push(
      `Longer than ${overCount} ${plural(overCount, 'attendee')} ${plural(
        overCount,
        'prefers',
        'prefer',
      )}`,
    );
  } else if (withCap.length > 0) {
    reasons.push(`${duration} min fits everyone's time limit`);
  } else {
    reasons.push(`Runs about ${duration} min`);
  }

  return { score: WEIGHTS.duration * fraction, reasons, warnings, confidencePenalty: 0 };
}

function scoreRequests(
  game: CandidateGame,
  counted: Attendee[],
  uncountedMaybes: Attendee[],
): ComponentOutcome {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const requesters = counted.filter((a) => a.requestedGameIds.includes(game.id));
  const maybeRequesters = uncountedMaybes.filter((a) => a.requestedGameIds.includes(game.id));

  const effective =
    requesters.length + maybeRequesters.length * REQUESTS.maybeRequestFraction;
  const fraction = clamp(effective / REQUESTS.saturationCount, 0, 1);

  if (requesters.length > 0) {
    reasons.push(
      `Requested by ${requesters.length} ${plural(requesters.length, 'attendee')}`,
    );
  }
  if (maybeRequesters.length > 0) {
    reasons.push(
      `Also requested by ${listNames(maybeRequesters.map((a) => a.name))}, who answered Maybe`,
    );
  }

  return { score: WEIGHTS.requests * fraction, reasons, warnings, confidencePenalty: 0 };
}

function scoreRating(game: CandidateGame): ComponentOutcome {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const rating = shrunkRating(game);
  if (rating == null) {
    warnings.push('No community rating available');
    return {
      score: WEIGHTS.rating * RATING.unknownRatingFraction,
      reasons,
      warnings,
      confidencePenalty: CONFIDENCE_PENALTIES.missingRating,
    };
  }

  const normalized = clamp((rating - RATING.floor) / (RATING.ceiling - RATING.floor), 0, 1);
  if (normalized >= 0.6) {
    reasons.push(`Highly rated on BGG (${rating.toFixed(1)})`);
  }

  return { score: WEIGHTS.rating * normalized, reasons, warnings, confidencePenalty: 0 };
}

function scoreTeaching(
  game: CandidateGame,
  yesAttendees: Attendee[],
  maybeAttendees: Attendee[],
): ComponentOutcome {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const yesTeachers = yesAttendees.filter((a) => a.teachableGameIds.includes(game.id));
  if (yesTeachers.length > 0) {
    reasons.push(`${listNames(yesTeachers.map((a) => a.name))} can teach it`);
    return {
      score: WEIGHTS.teaching * TEACHING.confirmedFraction,
      reasons,
      warnings,
      confidencePenalty: 0,
    };
  }

  const maybeTeachers = maybeAttendees.filter((a) => a.teachableGameIds.includes(game.id));
  if (maybeTeachers.length > 0) {
    warnings.push(
      `Only ${listNames(maybeTeachers.map((a) => a.name))} can teach it, and they answered Maybe`,
    );
    return {
      score: WEIGHTS.teaching * TEACHING.tentativeFraction,
      reasons,
      warnings,
      confidencePenalty: 0,
    };
  }

  warnings.push('No confirmed attendee can teach this');
  return { score: 0, reasons, warnings, confidencePenalty: 0 };
}

/**
 * Novelty preferences do not carry score weight — the 100 points are already
 * allocated — but they produce useful reasons and warnings.
 */
function noveltyNotes(game: CandidateGame, counted: Attendee[]): ComponentOutcome {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const played = counted.filter((a) => a.playedGameIds.includes(game.id));
  const wantsNew = counted.filter((a) => a.preference?.noveltyPreference === 'NEW');
  const wantsFamiliar = counted.filter((a) => a.preference?.noveltyPreference === 'FAMILIAR');

  if (wantsNew.length > 0 && played.length === counted.length && counted.length > 0) {
    warnings.push(
      `${wantsNew.length} ${plural(wantsNew.length, 'attendee')} wanted something new, and everyone has played this`,
    );
  } else if (wantsNew.length > 0 && played.length === 0) {
    reasons.push('New to everyone at the table');
  }

  if (wantsFamiliar.length > 0 && played.length === 0) {
    warnings.push(
      `${wantsFamiliar.length} ${plural(wantsFamiliar.length, 'attendee')} wanted something familiar, and nobody has played this`,
    );
  }

  return { score: 0, reasons, warnings, confidencePenalty: 0 };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function recommendGames(input: RecommendationInput): RecommendationResult {
  const settings = input.settings ?? {};
  const countMaybe = settings.countMaybeAttendees ?? false;

  const attendeeById = new Map(input.attendees.map((a) => [a.userId, a]));

  const yesAttendees = input.attendees.filter((a) => a.rsvp === 'YES');
  const maybeAttendees = input.attendees.filter((a) => a.rsvp === 'MAYBE');
  const counted = countMaybe ? [...yesAttendees, ...maybeAttendees] : yesAttendees;
  const uncountedMaybes = countMaybe ? [] : maybeAttendees;

  const targetPlayerCount = settings.targetPlayerCount ?? counted.length;
  const maxDuration = settings.maxDurationMinutes ?? null;
  const complexityTarget = settings.complexityTarget ?? null;

  // Who offered what, ignoring offers from people who are not members.
  const offersByGame = new Map<string, OfferedBy[]>();
  for (const offer of input.offers) {
    const attendee = attendeeById.get(offer.userId);
    if (!attendee) continue;
    const list = offersByGame.get(offer.gameId) ?? [];
    if (list.some((o) => o.userId === attendee.userId)) continue; // duplicate offer
    list.push({ userId: attendee.userId, name: attendee.name, rsvp: attendee.rsvp });
    offersByGame.set(offer.gameId, list);
  }

  /** Games at least one Yes attendee has committed to bringing. */
  const gamesOnTheTable = new Set(
    [...offersByGame.entries()]
      .filter(([, offerers]) => offerers.some((o) => o.rsvp === 'YES'))
      .map(([gameId]) => gameId),
  );

  const gamesById = new Map(input.games.map((g) => [g.id, g]));

  const recommendations: Recommendation[] = [];
  const nearMisses: NearMiss[] = [];
  const failureTally = new Map<HardRule, number>();

  for (const game of input.games) {
    const offeredBy = offersByGame.get(game.id) ?? [];
    const failures: { rule: HardRule; reason: string }[] = [];
    const hardWarnings: string[] = [];

    // Rule 1 — somebody who is definitely coming has offered to bring it.
    const yesOfferers = offeredBy.filter((o) => o.rsvp === 'YES');
    if (yesOfferers.length === 0) {
      if (offeredBy.length === 0) {
        failures.push({
          rule: 'NO_YES_ATTENDEE_OFFER',
          reason: 'Nobody has offered to bring this',
        });
      } else {
        const names = listNames(offeredBy.map((o) => o.name));
        failures.push({
          rule: 'NO_YES_ATTENDEE_OFFER',
          reason: `Only offered by ${names}, who ${
            offeredBy.length === 1 ? 'has' : 'have'
          } not confirmed`,
        });
        if (offeredBy.some((o) => o.rsvp === 'MAYBE')) {
          hardWarnings.push('Owner is only a Maybe');
        }
      }
    }

    // Rule 2 — the table size has to be inside the supported range.
    const minPlayers = game.minPlayers ?? 1;
    const maxPlayers = game.maxPlayers ?? Number.POSITIVE_INFINITY;
    if (targetPlayerCount < minPlayers || targetPlayerCount > maxPlayers) {
      const range =
        game.maxPlayers == null
          ? `${minPlayers}+`
          : `${minPlayers}–${game.maxPlayers}`;
      failures.push({
        rule: 'PLAYER_COUNT_OUT_OF_RANGE',
        reason: `Plays ${range}, but you are planning for ${targetPlayerCount}`,
      });
    }

    // Rule 3 — expansions are only playable alongside their base game.
    if (game.isExpansion) {
      const availableBase = game.baseGameIds.find((baseId) => gamesOnTheTable.has(baseId));
      if (!availableBase) {
        const baseNames = game.baseGameIds
          .map((id) => gamesById.get(id)?.name)
          .filter((n): n is string => Boolean(n));
        failures.push({
          rule: 'EXPANSION_WITHOUT_BASE',
          reason:
            baseNames.length > 0
              ? `Expansion — needs ${listNames(baseNames)}, which nobody is bringing`
              : 'Expansion — its base game is not being brought',
        });
      }
    }

    // Rule 4 — the organizer's hard time limit.
    const duration = effectiveDuration(game);
    if (maxDuration != null && duration != null && duration > maxDuration) {
      failures.push({
        rule: 'EXCEEDS_MAX_DURATION',
        reason: `Runs about ${duration} min, over your ${maxDuration} min limit`,
      });
    }

    // Score it either way: near misses show what they would have scored.
    const outcomes: ComponentOutcome[] = [
      scorePlayerCount(game, targetPlayerCount),
      scoreComplexity(game, counted, complexityTarget),
      scoreDuration(game, counted),
      scoreRequests(game, counted, uncountedMaybes),
      scoreRating(game),
      scoreTeaching(game, yesAttendees, maybeAttendees),
      noveltyNotes(game, counted),
    ];

    const [playerCountOut, complexityOut, durationOut, requestsOut, ratingOut, teachingOut] =
      outcomes as [
        ComponentOutcome,
        ComponentOutcome,
        ComponentOutcome,
        ComponentOutcome,
        ComponentOutcome,
        ComponentOutcome,
        ComponentOutcome,
      ];

    const components: ScoreComponents = {
      playerCount: round1(playerCountOut.score),
      complexity: round1(complexityOut.score),
      duration: round1(durationOut.score),
      requests: round1(requestsOut.score),
      rating: round1(ratingOut.score),
      teaching: round1(teachingOut.score),
    };

    const total = round1(
      outcomes.reduce((sum, outcome) => sum + outcome.score, 0),
    );

    if (failures.length > 0) {
      failureTally.set(
        failures[0]!.rule,
        (failureTally.get(failures[0]!.rule) ?? 0) + 1,
      );
      nearMisses.push({
        gameId: game.id,
        name: game.name,
        failures,
        hypotheticalTotal: total,
        warnings: [...hardWarnings, ...outcomes.flatMap((o) => o.warnings)],
        offeredBy,
      });
      continue;
    }

    const reasons = outcomes.flatMap((o) => o.reasons);
    if (game.isExpansion) {
      const baseName = game.baseGameIds
        .map((id) => (gamesOnTheTable.has(id) ? gamesById.get(id)?.name : null))
        .find((n): n is string => Boolean(n));
      if (baseName) reasons.unshift(`Expansion, playable because ${baseName} is on the table`);
    }

    const confidence = clamp(
      1 - outcomes.reduce((sum, o) => sum + o.confidencePenalty, 0),
      MIN_CONFIDENCE,
      1,
    );

    recommendations.push({
      gameId: game.id,
      name: game.name,
      total,
      components,
      reasons,
      warnings: outcomes.flatMap((o) => o.warnings),
      offeredBy,
      confidence: round1(confidence * 100) / 100,
    });
  }

  // Highest score first; ties broken by name so ordering is deterministic.
  recommendations.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  nearMisses.sort(
    (a, b) =>
      a.failures.length - b.failures.length ||
      b.hypotheticalTotal - a.hypotheticalTotal ||
      a.name.localeCompare(b.name),
  );

  return {
    targetPlayerCount,
    yesCount: yesAttendees.length,
    maybeCount: maybeAttendees.length,
    countedAttendeeCount: counted.length,
    recommendations,
    nearMisses,
    noEligibleGamesReason:
      recommendations.length > 0
        ? null
        : buildNoEligibleReason({
            gameCount: input.games.length,
            offeredCount: gamesOnTheTable.size,
            yesCount: yesAttendees.length,
            targetPlayerCount,
            failureTally,
          }),
  };
}

function buildNoEligibleReason(args: {
  gameCount: number;
  offeredCount: number;
  yesCount: number;
  targetPlayerCount: number;
  failureTally: Map<HardRule, number>;
}): string {
  const { gameCount, offeredCount, yesCount, targetPlayerCount, failureTally } = args;

  if (gameCount === 0) {
    return 'No games have been offered for this event yet.';
  }
  if (yesCount === 0) {
    return 'Nobody has RSVP’d Yes yet, so there is no confirmed group to recommend for.';
  }
  if (offeredCount === 0) {
    return 'No confirmed attendee has offered to bring a game yet.';
  }

  const parts: string[] = [];
  const playerCountFails = failureTally.get('PLAYER_COUNT_OUT_OF_RANGE') ?? 0;
  const durationFails = failureTally.get('EXCEEDS_MAX_DURATION') ?? 0;
  const expansionFails = failureTally.get('EXPANSION_WITHOUT_BASE') ?? 0;
  const offerFails = failureTally.get('NO_YES_ATTENDEE_OFFER') ?? 0;

  if (playerCountFails > 0) {
    parts.push(
      `${playerCountFails} ${plural(playerCountFails, 'game does', 'games do')} not support ${targetPlayerCount} players`,
    );
  }
  if (durationFails > 0) {
    parts.push(`${durationFails} ${plural(durationFails, 'game is', 'games are')} over your time limit`);
  }
  if (expansionFails > 0) {
    parts.push(
      `${expansionFails} ${plural(expansionFails, 'is an expansion', 'are expansions')} without their base game`,
    );
  }
  if (offerFails > 0) {
    parts.push(
      `${offerFails} ${plural(offerFails, 'game has', 'games have')} no confirmed attendee bringing them`,
    );
  }

  if (parts.length === 0) {
    return 'No game satisfies every hard constraint right now.';
  }

  return `No game satisfies every hard constraint: ${listNames(parts, 3)}.`;
}
