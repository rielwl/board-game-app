import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogNotFoundError, CatalogUnavailableError } from '@/domain/catalog/types';

import { createPrismaMock } from './helpers/prisma-mock';

/**
 * Library server actions.
 *
 * These are the app's write endpoints for a user's own game collection, so
 * the assertions concentrate on the two things a form cannot be trusted with:
 * that every write is scoped to the signed-in user, and that a catalog outage
 * turns into a helpful message rather than a 500.
 */

const prisma = createPrismaMock();
const requireUser = vi.fn();
const consumeRateLimit = vi.fn();
const revalidatePath = vi.fn();
const addCatalogGameToLibrary = vi.fn();
const createManualGame = vi.fn();
const importCollection = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return { ...actual, requireUser: (to?: string) => requireUser(to) };
});
vi.mock('@/lib/auth', () => ({ auth: {} }));
vi.mock('@/lib/rate-limit', () => ({
  consumeRateLimit: (options: unknown) => consumeRateLimit(options),
  clientIpFrom: () => '203.0.113.7',
}));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/server/games', () => ({
  addCatalogGameToLibrary: (...args: unknown[]) => addCatalogGameToLibrary(...args),
  createManualGame: (...args: unknown[]) => createManualGame(...args),
  importCollection: (...args: unknown[]) => importCollection(...args),
}));

const {
  addCatalogGameAction,
  createManualGameAction,
  importCollectionAction,
  removeUserGameAction,
  updateUserGameAction,
} = await import('@/server/actions/library');
const { idleState } = await import('@/server/actions/state');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(() => {
  prisma.reset();
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com', name: 'Ada' });
  consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 1 });
});

describe('addCatalogGameAction', () => {
  it('adds the game and confirms it', async () => {
    addCatalogGameToLibrary.mockResolvedValue({ gameId: 'g1', alreadyOwned: false });

    const state = await addCatalogGameAction(idleState, form({ bggId: '13' }));

    expect(addCatalogGameToLibrary).toHaveBeenCalledWith('u1', 13);
    expect(state).toMatchObject({ status: 'success', message: 'Added to your library.' });
    expect(revalidatePath).toHaveBeenCalledWith('/library');
  });

  it('says so when the game was already in the library', async () => {
    addCatalogGameToLibrary.mockResolvedValue({ gameId: 'g1', alreadyOwned: true });

    const state = await addCatalogGameAction(idleState, form({ bggId: '13' }));

    expect(state).toMatchObject({
      status: 'success',
      message: 'That game is already in your library.',
    });
  });

  it.each([['nonsense'], ['0'], ['-4'], ['1.5'], ['']])(
    'rejects %s as a BGG id without calling the catalog',
    async (bggId) => {
      const state = await addCatalogGameAction(idleState, form({ bggId }));

      expect(state).toMatchObject({ status: 'error', message: 'That game could not be added.' });
      expect(addCatalogGameToLibrary).not.toHaveBeenCalled();
    },
  );

  it('points at manual entry when the catalog is unavailable', async () => {
    addCatalogGameToLibrary.mockRejectedValue(new CatalogUnavailableError('BGG is not answering.'));

    const state = await addCatalogGameAction(idleState, form({ bggId: '13' }));

    expect(state).toMatchObject({
      status: 'error',
      message: 'BGG is not answering. You can still add the game manually.',
    });
  });

  it('does not leak an unexpected failure to the user', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    addCatalogGameToLibrary.mockRejectedValue(new Error('P2002 unique constraint'));

    const state = await addCatalogGameAction(idleState, form({ bggId: '13' }));

    expect(state).toMatchObject({
      status: 'error',
      message: 'Something went wrong. Please try again.',
    });
    error.mockRestore();
  });
});

describe('importCollectionAction', () => {
  it('imports a collection and summarises the outcome', async () => {
    importCollection.mockResolvedValue({
      username: 'ada',
      imported: 3,
      alreadyOwned: 2,
      skipped: 1,
      total: 6,
    });

    const state = await importCollectionAction(idleState, form({ bggUsername: 'ada' }));

    expect(importCollection).toHaveBeenCalledWith('u1', 'ada');
    expect(state).toMatchObject({
      status: 'success',
      message: 'Imported 3 of 6 owned games. 2 were already in your library. 1 could not be looked up.',
    });
  });

  it('omits the extra clauses when nothing was skipped or already owned', async () => {
    importCollection.mockResolvedValue({
      username: 'ada',
      imported: 2,
      alreadyOwned: 0,
      skipped: 0,
      total: 2,
    });

    const state = await importCollectionAction(idleState, form({ bggUsername: 'ada' }));

    expect(state.message).toBe('Imported 2 of 2 owned games.');
  });

  it('rejects a username the outbound query should never see', async () => {
    const state = await importCollectionAction(idleState, form({ bggUsername: 'ada&cmd=1' }));

    expect(state.status).toBe('error');
    expect(state.fieldErrors).toHaveProperty('bggUsername');
    expect(importCollection).not.toHaveBeenCalled();
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it('applies a tight per-user rate limit before making the outbound call', async () => {
    importCollection.mockResolvedValue({
      username: 'ada',
      imported: 1,
      alreadyOwned: 0,
      skipped: 0,
      total: 1,
    });

    await importCollectionAction(idleState, form({ bggUsername: 'ada' }));

    expect(consumeRateLimit).toHaveBeenCalledWith({
      bucket: 'bgg-import',
      key: 'u1',
      limit: 5,
      windowSeconds: 600,
    });
  });

  it('reports the wait in minutes once the limit is spent', async () => {
    consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 200 });

    const state = await importCollectionAction(idleState, form({ bggUsername: 'ada' }));

    expect(state).toMatchObject({
      status: 'error',
      message: 'You have run several imports recently. Try again in 4 minutes.',
    });
    expect(importCollection).not.toHaveBeenCalled();
  });

  it('treats an empty collection as a problem worth explaining', async () => {
    importCollection.mockResolvedValue({
      username: 'ada',
      imported: 0,
      alreadyOwned: 0,
      skipped: 0,
      total: 0,
    });

    const state = await importCollectionAction(idleState, form({ bggUsername: 'ada' }));

    expect(state.status).toBe('error');
    expect(state.message).toContain('no owned games');
  });

  it('surfaces an unknown username as-is', async () => {
    importCollection.mockRejectedValue(new CatalogNotFoundError('No such BGG user.'));

    const state = await importCollectionAction(idleState, form({ bggUsername: 'ada' }));

    expect(state).toMatchObject({ status: 'error', message: 'No such BGG user.' });
  });

  it('points at manual entry when BGG is down', async () => {
    importCollection.mockRejectedValue(new CatalogUnavailableError('BGG is not answering.'));

    const state = await importCollectionAction(idleState, form({ bggUsername: 'ada' }));

    expect(state.message).toBe('BGG is not answering. You can still add games manually.');
  });
});

describe('createManualGameAction', () => {
  it('creates the game after validating the form', async () => {
    createManualGame.mockResolvedValue({ gameId: 'g1' });

    const state = await createManualGameAction(
      idleState,
      form({ name: 'Prototype', minPlayers: '2', maxPlayers: '4', playingTime: '90' }),
    );

    expect(createManualGame).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ name: 'Prototype', minPlayers: 2, maxPlayers: 4, playingTime: 90 }),
    );
    expect(state).toMatchObject({ status: 'success', message: 'Prototype added to your library.' });
  });

  it('reports field errors and writes nothing when the form is invalid', async () => {
    const state = await createManualGameAction(
      idleState,
      form({ name: 'X', minPlayers: '2', maxPlayers: '4' }),
    );

    expect(state.status).toBe('error');
    expect(state.fieldErrors.name).toBeDefined();
    expect(createManualGame).not.toHaveBeenCalled();
  });

  it('rejects a maximum below the minimum', async () => {
    const state = await createManualGameAction(
      idleState,
      form({ name: 'Prototype', minPlayers: '5', maxPlayers: '2' }),
    );

    expect(state.fieldErrors.maxPlayers).toEqual([
      'Maximum players cannot be lower than minimum players.',
    ]);
    expect(createManualGame).not.toHaveBeenCalled();
  });
});

describe('updateUserGameAction', () => {
  it('scopes the update to the caller, so another user\'s row cannot be edited', async () => {
    prisma.userGame.updateMany.mockResolvedValue({ count: 1 });

    const state = await updateUserGameAction(
      idleState,
      form({ userGameId: 'ug1', available: 'on', familiarity: 'CAN_TEACH', notes: 'Sleeved' }),
    );

    expect(prisma.userGame.updateMany).toHaveBeenCalledWith({
      where: { id: 'ug1', userId: 'u1' },
      data: { available: true, familiarity: 'CAN_TEACH', notes: 'Sleeved' },
    });
    expect(state).toMatchObject({ status: 'success', message: 'Saved.' });
  });

  it('treats an absent checkbox as "not available"', async () => {
    prisma.userGame.updateMany.mockResolvedValue({ count: 1 });

    await updateUserGameAction(
      idleState,
      form({ userGameId: 'ug1', familiarity: 'PLAYED' }),
    );

    expect(prisma.userGame.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ available: false }) }),
    );
  });

  it('reports a row that is not the caller\'s as simply not in their library', async () => {
    prisma.userGame.updateMany.mockResolvedValue({ count: 0 });

    const state = await updateUserGameAction(
      idleState,
      form({ userGameId: 'someone-elses', familiarity: 'PLAYED' }),
    );

    expect(state).toMatchObject({
      status: 'error',
      message: 'That game is not in your library.',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects an unknown familiarity value', async () => {
    const state = await updateUserGameAction(
      idleState,
      form({ userGameId: 'ug1', familiarity: 'EXPERT' }),
    );

    expect(state.status).toBe('error');
    expect(prisma.userGame.updateMany).not.toHaveBeenCalled();
  });
});

describe('removeUserGameAction', () => {
  it('withdraws outstanding offers in the same transaction as the removal', async () => {
    prisma.userGame.findFirst.mockResolvedValue({ gameId: 'g1' });
    prisma.eventGameOffer.deleteMany.mockResolvedValue({ count: 2 });
    prisma.userGame.delete.mockResolvedValue({ id: 'ug1' });

    const state = await removeUserGameAction(idleState, form({ userGameId: 'ug1' }));

    expect(prisma.userGame.findFirst).toHaveBeenCalledWith({
      where: { id: 'ug1', userId: 'u1' },
      select: { gameId: true },
    });
    expect(prisma.eventGameOffer.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', gameId: 'g1' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ status: 'success', message: 'Removed from your library.' });
  });

  it('refuses to delete a row the caller does not own', async () => {
    prisma.userGame.findFirst.mockResolvedValue(null);

    const state = await removeUserGameAction(idleState, form({ userGameId: 'someone-elses' }));

    expect(state).toMatchObject({
      status: 'error',
      message: 'That game is not in your library.',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
