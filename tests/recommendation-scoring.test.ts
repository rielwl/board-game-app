import { describe, expect, it } from 'vitest';

import { MAX_SCORE, WEIGHTS, recommendGames } from '@/domain/recommendation';

import { makeAttendee, makeGame, makeInput, offer } from './helpers/builders';

const threeYesAttendees = () => [
  makeAttendee({ userId: 'ada', name: 'Ada' }),
  makeAttendee({ userId: 'sam', name: 'Sam' }),
  makeAttendee({ userId: 'kai', name: 'Kai' }),
];

describe('score components', () => {
  it('never exceeds 100 and reports every component', () => {
    const result = recommendGames(
      makeInput({
        attendees: [
          makeAttendee({
            userId: 'ada',
            name: 'Ada',
            requestedGameIds: ['g1'],
            teachableGameIds: ['g1'],
          }),
          makeAttendee({ userId: 'sam', name: 'Sam', requestedGameIds: ['g1'] }),
          makeAttendee({ userId: 'kai', name: 'Kai' }),
        ],
        games: [
          makeGame({
            id: 'g1',
            minPlayers: 2,
            maxPlayers: 5,
            bestPlayerCounts: [3],
            bayesRating: 8.5,
            averageWeight: 2.5,
            playingTime: 60,
          }),
        ],
        offers: [offer('ada', 'g1')],
      }),
    );

    const top = result.recommendations[0]!;
    expect(top.total).toBeLessThanOrEqual(MAX_SCORE);
    expect(top.total).toBeGreaterThan(90);
    expect(Object.keys(top.components).sort()).toEqual(
      ['complexity', 'duration', 'playerCount', 'rating', 'requests', 'teaching'].sort(),
    );
    // The reported components must actually add up to the reported total.
    const summed = Object.values(top.components).reduce((a, b) => a + b, 0);
    expect(Math.abs(summed - top.total)).toBeLessThan(0.35);
  });

  it('scores the community-best player count above a merely supported one', () => {
    const [best, supported] = ['best', 'supported'].map((id) =>
      makeGame({
        id,
        minPlayers: 2,
        maxPlayers: 6,
        bestPlayerCounts: id === 'best' ? [3] : [5],
        recommendedPlayerCounts: id === 'best' ? [] : [],
        notRecommendedPlayerCounts: [],
      }),
    );

    const result = recommendGames(
      makeInput({
        attendees: threeYesAttendees(),
        games: [best!, supported!],
        offers: [offer('ada', 'best'), offer('ada', 'supported')],
      }),
    );

    const bestScore = result.recommendations.find((r) => r.gameId === 'best')!;
    const supportedScore = result.recommendations.find((r) => r.gameId === 'supported')!;

    expect(bestScore.components.playerCount).toBe(WEIGHTS.playerCount);
    expect(supportedScore.components.playerCount).toBeLessThan(WEIGHTS.playerCount);
    expect(bestScore.reasons).toContain('Best with 3 players');
  });

  it('warns and drops confidence when the community votes against the count', () => {
    const result = recommendGames(
      makeInput({
        attendees: threeYesAttendees(),
        games: [
          makeGame({
            id: 'g1',
            minPlayers: 2,
            maxPlayers: 6,
            notRecommendedPlayerCounts: [3],
          }),
        ],
        offers: [offer('ada', 'g1')],
      }),
    );

    const rec = result.recommendations[0]!;
    expect(rec.warnings).toContain('The community does not recommend this at 3 players');
  });

  it('rewards fitting more attendees complexity ranges', () => {
    const attendees = [
      makeAttendee({
        userId: 'ada',
        name: 'Ada',
        preference: {
          minComplexity: 1,
          maxComplexity: 3,
          maxPlayTime: null,
          noveltyPreference: 'EITHER',
        },
      }),
      makeAttendee({
        userId: 'sam',
        name: 'Sam',
        preference: {
          minComplexity: 1,
          maxComplexity: 2.5,
          maxPlayTime: null,
          noveltyPreference: 'EITHER',
        },
      }),
      makeAttendee({
        userId: 'kai',
        name: 'Kai',
        preference: {
          minComplexity: 1,
          maxComplexity: 2,
          maxPlayTime: null,
          noveltyPreference: 'EITHER',
        },
      }),
    ];

    const result = recommendGames(
      makeInput({
        attendees,
        games: [
          makeGame({ id: 'light', averageWeight: 1.8 }),
          makeGame({ id: 'heavy', averageWeight: 4.2 }),
        ],
        offers: [offer('ada', 'light'), offer('ada', 'heavy')],
      }),
    );

    const light = result.recommendations.find((r) => r.gameId === 'light')!;
    const heavy = result.recommendations.find((r) => r.gameId === 'heavy')!;

    expect(light.components.complexity).toBe(WEIGHTS.complexity);
    // The organizer set no complexity target, so the 30% "hits the target"
    // share is awarded in full and only the 70% attendee-fit share is lost.
    expect(heavy.components.complexity).toBeCloseTo(WEIGHTS.complexity * 0.3, 5);
    expect(heavy.components.complexity).toBeLessThan(light.components.complexity);
    expect(light.reasons).toContain("Within 3 of 3 attendees' complexity preferences");
    expect(heavy.warnings).toContain("Outside 3 attendees' complexity preferences");
  });

  it('flags missing complexity data instead of crashing', () => {
    const result = recommendGames(
      makeInput({
        attendees: threeYesAttendees(),
        games: [makeGame({ id: 'g1', averageWeight: null, numWeightVotes: null })],
        offers: [offer('ada', 'g1')],
      }),
    );

    const rec = result.recommendations[0]!;
    expect(rec.warnings).toContain('Complexity data is missing');
    expect(rec.components.complexity).toBeGreaterThan(0);
    expect(rec.confidence).toBeLessThan(1);
  });

  it('penalises games longer than an attendee wants', () => {
    const attendees = [
      makeAttendee({
        userId: 'ada',
        name: 'Ada',
        preference: {
          minComplexity: null,
          maxComplexity: null,
          maxPlayTime: 60,
          noveltyPreference: 'EITHER',
        },
      }),
      makeAttendee({ userId: 'sam', name: 'Sam' }),
    ];

    const result = recommendGames(
      makeInput({
        attendees,
        games: [makeGame({ id: 'g1', playingTime: 150 })],
        offers: [offer('ada', 'g1')],
      }),
    );

    const rec = result.recommendations[0]!;
    expect(rec.components.duration).toBeLessThan(WEIGHTS.duration);
    expect(rec.warnings).toContain('Longer than 1 attendee prefers');
  });

  it('gives full marks once two attendees request a game', () => {
    const result = recommendGames(
      makeInput({
        attendees: [
          makeAttendee({ userId: 'ada', name: 'Ada', requestedGameIds: ['g2'] }),
          makeAttendee({ userId: 'sam', name: 'Sam', requestedGameIds: ['g2', 'g1'] }),
          makeAttendee({ userId: 'kai', name: 'Kai' }),
        ],
        games: [makeGame({ id: 'g1' }), makeGame({ id: 'g2' })],
        offers: [offer('ada', 'g1'), offer('ada', 'g2')],
      }),
    );

    const one = result.recommendations.find((r) => r.gameId === 'g1')!;
    const two = result.recommendations.find((r) => r.gameId === 'g2')!;

    expect(two.components.requests).toBe(WEIGHTS.requests);
    expect(one.components.requests).toBe(WEIGHTS.requests / 2);
    expect(two.reasons).toContain('Requested by 2 attendees');
  });

  it('names a Yes attendee who can teach, and warns when nobody can', () => {
    const result = recommendGames(
      makeInput({
        attendees: [
          makeAttendee({ userId: 'ada', name: 'Ada', teachableGameIds: ['taught'] }),
          makeAttendee({ userId: 'sam', name: 'Sam' }),
        ],
        games: [makeGame({ id: 'taught' }), makeGame({ id: 'untaught' })],
        offers: [offer('ada', 'taught'), offer('ada', 'untaught')],
      }),
    );

    const taught = result.recommendations.find((r) => r.gameId === 'taught')!;
    const untaught = result.recommendations.find((r) => r.gameId === 'untaught')!;

    expect(taught.components.teaching).toBe(WEIGHTS.teaching);
    expect(taught.reasons).toContain('Ada can teach it');
    expect(untaught.components.teaching).toBe(0);
    expect(untaught.warnings).toContain('No confirmed attendee can teach this');
  });

  it('half-credits a teacher who only answered Maybe', () => {
    const result = recommendGames(
      makeInput({
        attendees: [
          makeAttendee({ userId: 'ada', name: 'Ada' }),
          makeAttendee({
            userId: 'rosa',
            name: 'Rosa',
            rsvp: 'MAYBE',
            teachableGameIds: ['g1'],
          }),
        ],
        // Only Ada counts, so the target is 1 player.
        games: [makeGame({ id: 'g1', minPlayers: 1 })],
        offers: [offer('ada', 'g1')],
      }),
    );

    const rec = result.recommendations[0]!;
    expect(rec.components.teaching).toBe(WEIGHTS.teaching / 2);
    expect(rec.warnings.join(' ')).toContain('Rosa');
  });
});

describe('rating handling', () => {
  it('shrinks a high average from few voters toward the prior', () => {
    const result = recommendGames(
      makeInput({
        attendees: threeYesAttendees(),
        games: [
          makeGame({
            id: 'hyped',
            bayesRating: null,
            averageRating: 9.6,
            usersRated: 4,
          }),
          makeGame({
            id: 'proven',
            bayesRating: null,
            averageRating: 8.1,
            usersRated: 60000,
          }),
        ],
        offers: [offer('ada', 'hyped'), offer('ada', 'proven')],
      }),
    );

    const hyped = result.recommendations.find((r) => r.gameId === 'hyped')!;
    const proven = result.recommendations.find((r) => r.gameId === 'proven')!;
    expect(proven.components.rating).toBeGreaterThan(hyped.components.rating);
  });

  it('caps popularity so it cannot outweigh group suitability', () => {
    // A perfectly rated game that suits nobody must lose to a modest game that
    // fits the group.
    const attendees = [
      makeAttendee({
        userId: 'ada',
        name: 'Ada',
        preference: {
          minComplexity: 1,
          maxComplexity: 2,
          maxPlayTime: 45,
          noveltyPreference: 'EITHER',
        },
        requestedGameIds: ['modest'],
      }),
      makeAttendee({
        userId: 'sam',
        name: 'Sam',
        preference: {
          minComplexity: 1,
          maxComplexity: 2,
          maxPlayTime: 45,
          noveltyPreference: 'EITHER',
        },
        requestedGameIds: ['modest'],
      }),
    ];

    const result = recommendGames(
      makeInput({
        attendees,
        games: [
          makeGame({
            id: 'famous',
            name: 'Famous Brick',
            averageWeight: 4.5,
            playingTime: 180,
            bayesRating: 8.6,
          }),
          makeGame({
            id: 'modest',
            name: 'Modest Filler',
            averageWeight: 1.6,
            playingTime: 30,
            bayesRating: 6.4,
          }),
        ],
        offers: [offer('ada', 'famous'), offer('ada', 'modest')],
      }),
    );

    expect(result.recommendations[0]?.gameId).toBe('modest');
  });

  it('degrades gracefully with no rating at all', () => {
    const result = recommendGames(
      makeInput({
        attendees: threeYesAttendees(),
        games: [
          makeGame({ id: 'g1', bayesRating: null, averageRating: null, usersRated: null }),
        ],
        offers: [offer('ada', 'g1')],
      }),
    );

    const rec = result.recommendations[0]!;
    expect(Number.isFinite(rec.total)).toBe(true);
    expect(rec.warnings).toContain('No community rating available');
    expect(rec.confidence).toBeLessThan(1);
  });
});

describe('determinism and ordering', () => {
  it('produces identical output for identical input', () => {
    const input = makeInput({
      attendees: threeYesAttendees(),
      games: [makeGame({ id: 'g1' }), makeGame({ id: 'g2' }), makeGame({ id: 'g3' })],
      offers: [offer('ada', 'g1'), offer('sam', 'g2'), offer('kai', 'g3')],
    });

    expect(recommendGames(input)).toEqual(recommendGames(input));
  });

  it('breaks score ties by name so the order never wobbles', () => {
    const result = recommendGames(
      makeInput({
        attendees: threeYesAttendees(),
        games: [
          makeGame({ id: 'z', name: 'Zeppelin' }),
          makeGame({ id: 'a', name: 'Aardvark' }),
        ],
        offers: [offer('ada', 'z'), offer('ada', 'a')],
      }),
    );

    expect(result.recommendations.map((r) => r.name)).toEqual(['Aardvark', 'Zeppelin']);
  });

  it('ignores offers from people who are not members', () => {
    const result = recommendGames(
      makeInput({
        attendees: [makeAttendee({ userId: 'ada' })],
        games: [makeGame({ id: 'g1' })],
        offers: [offer('stranger', 'g1')],
      }),
    );

    expect(result.recommendations).toHaveLength(0);
  });

  it('counts a duplicated offer from one person only once', () => {
    const result = recommendGames(
      makeInput({
        attendees: [makeAttendee({ userId: 'ada', name: 'Ada' })],
        games: [makeGame({ id: 'g1', minPlayers: 1 })],
        offers: [offer('ada', 'g1'), offer('ada', 'g1')],
      }),
    );

    expect(result.recommendations[0]?.offeredBy).toHaveLength(1);
  });
});

describe('novelty preferences', () => {
  it('warns when new-seekers have all played the game', () => {
    const result = recommendGames(
      makeInput({
        attendees: [
          makeAttendee({
            userId: 'ada',
            name: 'Ada',
            playedGameIds: ['g1'],
            preference: {
              minComplexity: null,
              maxComplexity: null,
              maxPlayTime: null,
              noveltyPreference: 'NEW',
            },
          }),
          makeAttendee({ userId: 'sam', name: 'Sam', playedGameIds: ['g1'] }),
        ],
        games: [makeGame({ id: 'g1' })],
        offers: [offer('ada', 'g1')],
      }),
    );

    expect(result.recommendations[0]?.warnings.join(' ')).toContain('wanted something new');
  });

  it('celebrates a game nobody has played when somebody wants novelty', () => {
    const result = recommendGames(
      makeInput({
        attendees: [
          makeAttendee({
            userId: 'ada',
            name: 'Ada',
            preference: {
              minComplexity: null,
              maxComplexity: null,
              maxPlayTime: null,
              noveltyPreference: 'NEW',
            },
          }),
        ],
        games: [makeGame({ id: 'g1', minPlayers: 1 })],
        offers: [offer('ada', 'g1')],
      }),
    );

    expect(result.recommendations[0]?.reasons).toContain('New to everyone at the table');
  });
});
