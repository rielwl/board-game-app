import { describe, expect, it } from 'vitest';

import { recommendGames } from '@/domain/recommendation';

import { makeAttendee, makeGame, makeInput, offer } from './helpers/builders';

/**
 * The four hard rules. A game that fails any of them must never appear in
 * `recommendations`, and must explain itself in `nearMisses`.
 */
describe('hard eligibility rules', () => {
  it('requires an offer from a Yes attendee', () => {
    const result = recommendGames(
      makeInput({
        attendees: [
          makeAttendee({ userId: 'ada', rsvp: 'YES' }),
          makeAttendee({ userId: 'sam', rsvp: 'YES' }),
          makeAttendee({ userId: 'rosa', rsvp: 'MAYBE' }),
        ],
        games: [makeGame({ id: 'g1', name: 'Offered by a Yes' }), makeGame({ id: 'g2', name: 'Offered by a Maybe' })],
        offers: [offer('ada', 'g1'), offer('rosa', 'g2')],
      }),
    );

    expect(result.recommendations.map((r) => r.gameId)).toEqual(['g1']);

    const nearMiss = result.nearMisses.find((n) => n.gameId === 'g2');
    expect(nearMiss?.failures[0]?.rule).toBe('NO_YES_ATTENDEE_OFFER');
    expect(nearMiss?.warnings).toContain('Owner is only a Maybe');
  });

  it('excludes a game nobody offered at all', () => {
    const result = recommendGames(
      makeInput({
        attendees: [makeAttendee({ userId: 'ada' }), makeAttendee({ userId: 'sam' })],
        games: [makeGame({ id: 'g1' })],
        offers: [],
      }),
    );

    expect(result.recommendations).toHaveLength(0);
    expect(result.nearMisses[0]?.failures[0]?.reason).toBe('Nobody has offered to bring this');
  });

  it('requires the target player count to be inside the supported range', () => {
    const attendees = ['a', 'b', 'c', 'd', 'e'].map((id) => makeAttendee({ userId: id }));

    const result = recommendGames(
      makeInput({
        attendees,
        games: [
          makeGame({ id: 'fits', minPlayers: 3, maxPlayers: 6 }),
          makeGame({ id: 'too-small', name: 'Duel', minPlayers: 2, maxPlayers: 2 }),
          makeGame({ id: 'too-big', name: 'Epic', minPlayers: 6, maxPlayers: 10 }),
        ],
        offers: [offer('a', 'fits'), offer('a', 'too-small'), offer('a', 'too-big')],
      }),
    );

    expect(result.targetPlayerCount).toBe(5);
    expect(result.recommendations.map((r) => r.gameId)).toEqual(['fits']);
    expect(result.nearMisses.map((n) => n.gameId).sort()).toEqual(['too-big', 'too-small']);
    expect(result.nearMisses.every((n) => n.failures[0]?.rule === 'PLAYER_COUNT_OUT_OF_RANGE')).toBe(
      true,
    );
  });

  it('treats a missing max player count as unbounded rather than crashing', () => {
    const result = recommendGames(
      makeInput({
        attendees: [makeAttendee({ userId: 'a' }), makeAttendee({ userId: 'b' })],
        games: [makeGame({ id: 'g1', minPlayers: null, maxPlayers: null })],
        offers: [offer('a', 'g1')],
      }),
    );

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.warnings).toContain('Supported player count is unknown');
  });

  it('never treats an expansion as standalone', () => {
    const base = makeGame({ id: 'base', name: 'CATAN', minPlayers: 3, maxPlayers: 4 });
    const expansion = makeGame({
      id: 'exp',
      name: 'Cities & Knights',
      minPlayers: 3,
      maxPlayers: 4,
      isExpansion: true,
      baseGameIds: ['base'],
    });

    const withoutBase = recommendGames(
      makeInput({
        attendees: [
          makeAttendee({ userId: 'a' }),
          makeAttendee({ userId: 'b' }),
          makeAttendee({ userId: 'c' }),
        ],
        games: [base, expansion],
        offers: [offer('a', 'exp')],
      }),
    );

    expect(withoutBase.recommendations).toHaveLength(0);
    const nearMiss = withoutBase.nearMisses.find((n) => n.gameId === 'exp');
    expect(nearMiss?.failures.some((f) => f.rule === 'EXPANSION_WITHOUT_BASE')).toBe(true);
    expect(nearMiss?.failures.find((f) => f.rule === 'EXPANSION_WITHOUT_BASE')?.reason).toContain(
      'CATAN',
    );

    const withBase = recommendGames(
      makeInput({
        attendees: [
          makeAttendee({ userId: 'a' }),
          makeAttendee({ userId: 'b' }),
          makeAttendee({ userId: 'c' }),
        ],
        games: [base, expansion],
        offers: [offer('a', 'exp'), offer('b', 'base')],
      }),
    );

    expect(withBase.recommendations.map((r) => r.gameId).sort()).toEqual(['base', 'exp']);
    expect(
      withBase.recommendations.find((r) => r.gameId === 'exp')?.reasons.join(' '),
    ).toContain('playable because CATAN is on the table');
  });

  it('enforces the organizer hard duration limit', () => {
    const result = recommendGames(
      makeInput({
        attendees: [makeAttendee({ userId: 'a' }), makeAttendee({ userId: 'b' })],
        games: [
          makeGame({ id: 'short', playingTime: 45 }),
          makeGame({ id: 'long', name: 'Marathon', playingTime: 180 }),
        ],
        offers: [offer('a', 'short'), offer('a', 'long')],
        settings: { maxDurationMinutes: 90 },
      }),
    );

    expect(result.recommendations.map((r) => r.gameId)).toEqual(['short']);
    expect(result.nearMisses[0]?.failures[0]?.rule).toBe('EXCEEDS_MAX_DURATION');
    expect(result.nearMisses[0]?.failures[0]?.reason).toContain('90 min limit');
  });

  it('does not reject a game whose length is unknown', () => {
    const result = recommendGames(
      makeInput({
        attendees: [makeAttendee({ userId: 'a' }), makeAttendee({ userId: 'b' })],
        games: [
          makeGame({ id: 'g1', playingTime: null, minPlayTime: null, maxPlayTime: null }),
        ],
        offers: [offer('a', 'g1')],
        settings: { maxDurationMinutes: 60 },
      }),
    );

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.warnings).toContain('Play time is unknown');
  });
});

describe('the counted group', () => {
  it('defaults the target to the number of Yes attendees, ignoring Maybes', () => {
    const result = recommendGames(
      makeInput({
        attendees: [
          makeAttendee({ userId: 'a', rsvp: 'YES' }),
          makeAttendee({ userId: 'b', rsvp: 'YES' }),
          makeAttendee({ userId: 'c', rsvp: 'MAYBE' }),
          makeAttendee({ userId: 'd', rsvp: 'NO' }),
          makeAttendee({ userId: 'e', rsvp: 'AWAITING' }),
        ],
      }),
    );

    expect(result.targetPlayerCount).toBe(2);
    expect(result.yesCount).toBe(2);
    expect(result.maybeCount).toBe(1);
  });

  it('counts Maybe attendees when the organizer asks it to', () => {
    const result = recommendGames(
      makeInput({
        attendees: [
          makeAttendee({ userId: 'a', rsvp: 'YES' }),
          makeAttendee({ userId: 'c', rsvp: 'MAYBE' }),
        ],
        settings: { countMaybeAttendees: true },
      }),
    );

    expect(result.targetPlayerCount).toBe(2);
    expect(result.countedAttendeeCount).toBe(2);
  });

  it('lets the organizer override the target player count outright', () => {
    const result = recommendGames(
      makeInput({
        attendees: [makeAttendee({ userId: 'a' })],
        games: [makeGame({ id: 'g1', minPlayers: 4, maxPlayers: 6 })],
        offers: [offer('a', 'g1')],
        settings: { targetPlayerCount: 5 },
      }),
    );

    expect(result.targetPlayerCount).toBe(5);
    expect(result.recommendations.map((r) => r.gameId)).toEqual(['g1']);
  });
});

describe('explaining an empty result', () => {
  it('says nobody has RSVPd yes', () => {
    const result = recommendGames(
      makeInput({
        attendees: [makeAttendee({ userId: 'a', rsvp: 'MAYBE' })],
        games: [makeGame({ id: 'g1' })],
        offers: [offer('a', 'g1')],
      }),
    );

    expect(result.recommendations).toHaveLength(0);
    expect(result.noEligibleGamesReason).toContain('RSVP');
  });

  it('summarises which hard rules did the damage', () => {
    const attendees = ['a', 'b', 'c', 'd', 'e'].map((id) => makeAttendee({ userId: id }));
    const result = recommendGames(
      makeInput({
        attendees,
        games: [
          makeGame({ id: 'g1', minPlayers: 2, maxPlayers: 2 }),
          makeGame({ id: 'g2', minPlayers: 2, maxPlayers: 3 }),
        ],
        offers: [offer('a', 'g1'), offer('a', 'g2')],
      }),
    );

    expect(result.noEligibleGamesReason).toContain('do not support 5 players');
  });
});
