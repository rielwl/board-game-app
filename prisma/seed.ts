/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';

import { FIXTURE_GAMES } from '../src/domain/catalog/fixture-data';
import type { CatalogGame } from '../src/domain/catalog/types';

/**
 * Demo scenario.
 *
 * Everything here is deterministic and offline: the games come from the same
 * fixture catalog the offline provider serves, so `npm run db:seed` works with
 * no network access and produces the identical scenario every time.
 *
 * Passwords are hashed with Better Auth's own scrypt helper, so the seeded
 * accounts sign in through the normal flow.
 */

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'meeple-night-demo';

const USERS = [
  { key: 'ada', name: 'Ada', email: 'ada@example.com', bggUsername: 'demo' },
  { key: 'sam', name: 'Sam', email: 'sam@example.com', bggUsername: 'heavygamer' },
  { key: 'kai', name: 'Kai', email: 'kai@example.com', bggUsername: null },
  { key: 'rosa', name: 'Rosa', email: 'rosa@example.com', bggUsername: null },
  { key: 'bo', name: 'Bo', email: 'bo@example.com', bggUsername: null },
] as const;

type UserKey = (typeof USERS)[number]['key'];

// bggId -> the seeded library rows that own it.
const LIBRARY: {
  owner: UserKey;
  bggId: number;
  available?: boolean;
  familiarity?: 'NEVER_PLAYED' | 'PLAYED' | 'CAN_TEACH';
  notes?: string;
}[] = [
  { owner: 'ada', bggId: 30549, familiarity: 'CAN_TEACH' },
  { owner: 'ada', bggId: 178900, familiarity: 'CAN_TEACH' },
  { owner: 'ada', bggId: 13, familiarity: 'PLAYED' },
  { owner: 'ada', bggId: 926, familiarity: 'PLAYED', notes: 'Needs the base game.' },
  { owner: 'sam', bggId: 266192, familiarity: 'CAN_TEACH' },
  { owner: 'sam', bggId: 167791, familiarity: 'CAN_TEACH' },
  { owner: 'sam', bggId: 342942, familiarity: 'PLAYED' },
  { owner: 'sam', bggId: 12333, familiarity: 'CAN_TEACH' },
  { owner: 'kai', bggId: 39856, familiarity: 'PLAYED' },
  { owner: 'kai', bggId: 68448, familiarity: 'CAN_TEACH' },
  { owner: 'kai', bggId: 148228, familiarity: 'PLAYED' },
  {
    owner: 'kai',
    bggId: 224517,
    available: false,
    familiarity: 'PLAYED',
    notes: 'Lent to my brother.',
  },
  { owner: 'rosa', bggId: 999901, familiarity: 'NEVER_PLAYED', notes: 'Found it in the attic.' },
  { owner: 'rosa', bggId: 178900, familiarity: 'PLAYED' },
];

async function persistFixtureGames(games: CatalogGame[]): Promise<Map<number, string>> {
  const idByBggId = new Map<number, string>();

  for (const game of games) {
    const fields = {
      bggId: game.bggId,
      bggUrl: `https://boardgamegeek.com/boardgame/${game.bggId}`,
      source: 'BGG' as const,
      name: game.name,
      yearPublished: game.yearPublished,
      imageUrl: game.imageUrl,
      thumbnailUrl: game.thumbnailUrl,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      playingTime: game.playingTime,
      minPlayTime: game.minPlayTime,
      maxPlayTime: game.maxPlayTime,
      minAge: game.minAge,
      averageRating: game.averageRating,
      bayesRating: game.bayesRating,
      usersRated: game.usersRated,
      averageWeight: game.averageWeight,
      numWeightVotes: game.numWeightVotes,
      isExpansion: game.isExpansion,
      lastFetchedAt: new Date(),
    };

    const row = await prisma.game.upsert({
      where: { bggId: game.bggId },
      create: fields,
      update: fields,
      select: { id: true },
    });
    idByBggId.set(game.bggId, row.id);

    for (const [kind, names] of [
      ['MECHANIC', game.mechanics],
      ['CATEGORY', game.categories],
    ] as const) {
      for (const name of names) {
        const tag = await prisma.tag.upsert({
          where: { kind_name: { kind, name } },
          create: { kind, name },
          update: {},
          select: { id: true },
        });
        await prisma.gameTag.createMany({
          data: [{ gameId: row.id, tagId: tag.id }],
          skipDuplicates: true,
        });
      }
    }

    for (const poll of game.playerPolls) {
      await prisma.gamePlayerPoll.upsert({
        where: { gameId_playerCount: { gameId: row.id, playerCount: poll.playerCount } },
        create: { gameId: row.id, ...poll },
        update: poll,
      });
    }
  }

  for (const game of games) {
    if (!game.isExpansion) continue;
    const expansionId = idByBggId.get(game.bggId);
    if (!expansionId) continue;
    for (const baseBggId of game.baseGameBggIds) {
      const baseGameId = idByBggId.get(baseBggId);
      if (!baseGameId) continue;
      await prisma.gameRelation.createMany({
        data: [{ expansionId, baseGameId }],
        skipDuplicates: true,
      });
    }
  }

  return idByBggId;
}

async function main(): Promise<void> {
  console.log('Seeding Meeple Night…');

  // Wipe only what the seed owns, in dependency order, so re-seeding is safe.
  await prisma.eventSelection.deleteMany();
  await prisma.gameRequest.deleteMany();
  await prisma.eventPreference.deleteMany();
  await prisma.eventGameOffer.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.eventMember.deleteMany();
  await prisma.event.deleteMany();
  await prisma.userGame.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany({ where: { email: { in: USERS.map((u) => u.email) } } });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const userIds = new Map<UserKey, string>();
  for (const user of USERS) {
    const created = await prisma.user.create({
      data: {
        name: user.name,
        email: user.email,
        emailVerified: true,
        bggUsername: user.bggUsername,
        accounts: {
          create: {
            // Better Auth's credential provider looks the account up by
            // providerId 'credential' with accountId = the user id.
            providerId: 'credential',
            accountId: user.email,
            password: passwordHash,
          },
        },
      },
      select: { id: true },
    });
    userIds.set(user.key, created.id);
  }

  // Better Auth stores accountId as the user's own id for credential accounts.
  for (const user of USERS) {
    const id = userIds.get(user.key)!;
    await prisma.account.updateMany({
      where: { userId: id, providerId: 'credential' },
      data: { accountId: id },
    });
  }
  console.log(`  ${USERS.length} users`);

  const gameIdByBggId = await persistFixtureGames(FIXTURE_GAMES);
  console.log(`  ${gameIdByBggId.size} games`);

  for (const entry of LIBRARY) {
    const userId = userIds.get(entry.owner)!;
    const gameId = gameIdByBggId.get(entry.bggId);
    if (!gameId) continue;
    await prisma.userGame.create({
      data: {
        userId,
        gameId,
        available: entry.available ?? true,
        familiarity: entry.familiarity ?? 'NEVER_PLAYED',
        notes: entry.notes ?? null,
      },
    });
  }
  console.log(`  ${LIBRARY.length} library entries`);

  // --- The demo event -------------------------------------------------------
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 5);
  startsAt.setHours(19, 30, 0, 0);

  const event = await prisma.event.create({
    data: {
      title: 'Thursday board games at Ada’s',
      description:
        'Our usual mid-week night. Something we can finish before midnight, please.',
      startsAt,
      timezone: 'Europe/London',
      location: '42 Kite Street, ring the top bell',
      attendeeNotes: 'There is street parking after 18:00. Bring snacks if you can.',
      maxAttendees: 6,
      maxDurationMinutes: 120,
      createdById: userIds.get('ada')!,
      members: {
        create: [
          { userId: userIds.get('ada')!, role: 'ORGANIZER', rsvp: 'YES', respondedAt: new Date() },
          { userId: userIds.get('sam')!, rsvp: 'YES', respondedAt: new Date() },
          { userId: userIds.get('kai')!, rsvp: 'YES', respondedAt: new Date() },
          {
            userId: userIds.get('rosa')!,
            rsvp: 'MAYBE',
            rsvpNote: 'Depends whether my train is on time.',
            respondedAt: new Date(),
          },
          { userId: userIds.get('bo')!, rsvp: 'AWAITING' },
        ],
      },
    },
    select: { id: true },
  });

  const offer = (owner: UserKey, bggId: number) => ({
    eventId: event.id,
    userId: userIds.get(owner)!,
    gameId: gameIdByBggId.get(bggId)!,
  });

  await prisma.eventGameOffer.createMany({
    data: [
      offer('ada', 30549), // Pandemic
      offer('ada', 178900), // Codenames
      offer('ada', 13), // CATAN
      offer('ada', 926), // Cities & Knights, an expansion of CATAN
      offer('sam', 266192), // Wingspan
      offer('sam', 167791), // Terraforming Mars
      offer('sam', 12333), // Twilight Struggle — 2 players only, and over the time limit
      offer('kai', 68448), // 7 Wonders
      offer('kai', 148228), // Splendor
      offer('rosa', 999901), // The sparse attic game, offered by a Maybe
    ],
    skipDuplicates: true,
  });

  await prisma.eventPreference.createMany({
    data: [
      {
        eventId: event.id,
        userId: userIds.get('ada')!,
        minComplexity: 1,
        maxComplexity: 3,
        maxPlayTime: 90,
        noveltyPreference: 'EITHER',
        note: 'Happy to teach whatever we land on.',
      },
      {
        eventId: event.id,
        userId: userIds.get('sam')!,
        minComplexity: 2,
        maxComplexity: 4.5,
        maxPlayTime: 150,
        noveltyPreference: 'NEW',
      },
      {
        eventId: event.id,
        userId: userIds.get('kai')!,
        minComplexity: 1,
        maxComplexity: 2.5,
        maxPlayTime: 75,
        noveltyPreference: 'FAMILIAR',
        note: 'Work is brutal this week, keep it light.',
      },
      {
        eventId: event.id,
        userId: userIds.get('rosa')!,
        maxPlayTime: 60,
        noveltyPreference: 'NEW',
      },
    ],
  });

  await prisma.gameRequest.createMany({
    data: [
      { eventId: event.id, userId: userIds.get('kai')!, gameId: gameIdByBggId.get(266192)! },
      { eventId: event.id, userId: userIds.get('sam')!, gameId: gameIdByBggId.get(266192)! },
      { eventId: event.id, userId: userIds.get('ada')!, gameId: gameIdByBggId.get(30549)! },
    ],
    skipDuplicates: true,
  });

  // A second, already-finished night, so the dashboard has a past section.
  const pastStart = new Date();
  pastStart.setDate(pastStart.getDate() - 21);
  pastStart.setHours(19, 0, 0, 0);

  const pastEvent = await prisma.event.create({
    data: {
      title: 'Games and leftovers',
      startsAt: pastStart,
      timezone: 'Europe/London',
      location: 'Sam’s flat',
      status: 'ARCHIVED',
      createdById: userIds.get('sam')!,
      members: {
        create: [
          { userId: userIds.get('sam')!, role: 'ORGANIZER', rsvp: 'YES', respondedAt: pastStart },
          { userId: userIds.get('ada')!, rsvp: 'YES', respondedAt: pastStart },
          { userId: userIds.get('kai')!, rsvp: 'NO', respondedAt: pastStart },
        ],
      },
    },
    select: { id: true },
  });

  await prisma.eventGameOffer.create({
    data: {
      eventId: pastEvent.id,
      userId: userIds.get('sam')!,
      gameId: gameIdByBggId.get(266192)!,
    },
  });
  await prisma.eventSelection.create({
    data: {
      eventId: pastEvent.id,
      primaryGameId: gameIdByBggId.get(266192)!,
      method: 'MANUAL',
      selectedById: userIds.get('sam')!,
      primaryScoreSnapshot: 81.5,
    },
  });

  console.log('  2 events, with RSVPs, offers, preferences and requests');
  console.log('');
  console.log('Sign in with any of:');
  for (const user of USERS) {
    console.log(`  ${user.email}  /  ${DEMO_PASSWORD}`);
  }
  console.log('');
  console.log('Ada organises "Thursday board games"; Bo has not responded yet.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
