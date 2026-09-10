import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPrismaMock } from './helpers/prisma-mock';

/**
 * Offers, requests, preferences and the organizer's selection.
 *
 * The recommendation engine is mocked at the `getEventRecommendations` seam:
 * its scoring is covered elsewhere, and what these actions add on top is a
 * re-check that the game the browser submitted is still eligible — the server
 * must not take the form's word for it.
 */

const prisma = createPrismaMock();
const requireUser = vi.fn();
const assertMember = vi.fn();
const assertOrganizer = vi.fn();
const revalidatePath = vi.fn();
const getEventRecommendations = vi.fn();
const pickForUs = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/auth', () => ({ auth: {} }));
vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return {
    ...actual,
    requireUser: (to?: string) => requireUser(to),
    assertMember: (eventId: string, userId: string) => assertMember(eventId, userId),
    assertOrganizer: (eventId: string, userId: string) => assertOrganizer(eventId, userId),
  };
});
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
vi.mock('@/server/recommendations', () => ({
  getEventRecommendations: (eventId: string) => getEventRecommendations(eventId),
}));
vi.mock('@/domain/recommendation', async () => {
  const actual = await vi.importActual<typeof import('@/domain/recommendation')>(
    '@/domain/recommendation',
  );
  return { ...actual, pickForUs: (rows: unknown) => pickForUs(rows) };
});

const { AuthorizationError } = await import('@/lib/authz');
const {
  clearSelectionAction,
  lockPickAction,
  lockSelectionAction,
  pickForUsAction,
  savePreferencesAction,
  toggleOfferAction,
  toggleRequestAction,
} = await import('@/server/actions/event-games');
const { idleState } = await import('@/server/actions/state');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

function recommendation(gameId: string, name: string, total = 80) {
  return { gameId, name, total };
}

beforeEach(() => {
  prisma.reset();
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com', name: 'Ada' });
  assertMember.mockResolvedValue({ eventId: 'e1', userId: 'u1', role: 'ATTENDEE', isOrganizer: false });
  assertOrganizer.mockResolvedValue({ eventId: 'e1', userId: 'u1', role: 'ORGANIZER', isOrganizer: true });
});

describe('toggleOfferAction', () => {
  it('records an offer of a game the caller owns and has available', async () => {
    prisma.userGame.findUnique.mockResolvedValue({ available: true, game: { name: 'Catan' } });
    prisma.eventGameOffer.upsert.mockResolvedValue({ id: 'o1' });

    const state = await toggleOfferAction(
      idleState,
      form({ eventId: 'e1', gameId: 'g1', offering: 'true' }),
    );

    expect(prisma.eventGameOffer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_userId_gameId: { eventId: 'e1', userId: 'u1', gameId: 'g1' } },
      }),
    );
    expect(state).toMatchObject({ status: 'success', message: 'You are bringing Catan.' });
  });

  it('looks the ownership row up under the caller, never the submitted user', async () => {
    prisma.userGame.findUnique.mockResolvedValue({ available: true, game: { name: 'Catan' } });
    prisma.eventGameOffer.upsert.mockResolvedValue({ id: 'o1' });

    await toggleOfferAction(
      idleState,
      form({ eventId: 'e1', gameId: 'g1', offering: 'true', userId: 'someone-else' }),
    );

    expect(prisma.userGame.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_gameId: { userId: 'u1', gameId: 'g1' } } }),
    );
  });

  it('refuses to offer a game the caller does not own', async () => {
    prisma.userGame.findUnique.mockResolvedValue(null);

    const state = await toggleOfferAction(
      idleState,
      form({ eventId: 'e1', gameId: 'g1', offering: 'true' }),
    );

    expect(state).toMatchObject({
      status: 'error',
      message: 'You can only offer games from your own library.',
    });
    expect(prisma.eventGameOffer.upsert).not.toHaveBeenCalled();
  });

  it('refuses to offer a game marked unavailable, and says how to fix it', async () => {
    prisma.userGame.findUnique.mockResolvedValue({ available: false, game: { name: 'Catan' } });

    const state = await toggleOfferAction(
      idleState,
      form({ eventId: 'e1', gameId: 'g1', offering: 'true' }),
    );

    expect(state.message).toBe('Mark Catan as available in your library before offering it.');
    expect(prisma.eventGameOffer.upsert).not.toHaveBeenCalled();
  });

  it('withdraws an offer, and does so even when the game is now unavailable', async () => {
    prisma.userGame.findUnique.mockResolvedValue({ available: false, game: { name: 'Catan' } });
    prisma.eventGameOffer.deleteMany.mockResolvedValue({ count: 1 });

    const state = await toggleOfferAction(
      idleState,
      form({ eventId: 'e1', gameId: 'g1', offering: 'false' }),
    );

    expect(prisma.eventGameOffer.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'e1', userId: 'u1', gameId: 'g1' },
    });
    expect(state).toMatchObject({ status: 'success', message: 'No longer bringing Catan.' });
  });

  it('refuses a non-member before looking at their library', async () => {
    assertMember.mockRejectedValue(
      new AuthorizationError('Event not found, or you are not a member of it.', 404),
    );

    const state = await toggleOfferAction(
      idleState,
      form({ eventId: 'e1', gameId: 'g1', offering: 'true' }),
    );

    expect(state.status).toBe('error');
    expect(prisma.userGame.findUnique).not.toHaveBeenCalled();
  });
});

describe('savePreferencesAction', () => {
  it('upserts the caller\'s preferences for the event', async () => {
    prisma.eventPreference.upsert.mockResolvedValue({ id: 'p1' });

    const state = await savePreferencesAction(
      idleState,
      form({ eventId: 'e1', minComplexity: '1.5', maxComplexity: '3', maxPlayTime: '120', noveltyPreference: 'NEW' }),
    );

    expect(prisma.eventPreference.upsert).toHaveBeenCalledWith({
      where: { eventId_userId: { eventId: 'e1', userId: 'u1' } },
      create: {
        eventId: 'e1',
        userId: 'u1',
        minComplexity: 1.5,
        maxComplexity: 3,
        maxPlayTime: 120,
        noveltyPreference: 'NEW',
        note: null,
      },
      update: {
        minComplexity: 1.5,
        maxComplexity: 3,
        maxPlayTime: 120,
        noveltyPreference: 'NEW',
        note: null,
      },
    });
    expect(state).toMatchObject({ status: 'success', message: 'Preferences saved.' });
  });

  it('defaults novelty to EITHER when the form omits it', async () => {
    prisma.eventPreference.upsert.mockResolvedValue({ id: 'p1' });

    await savePreferencesAction(idleState, form({ eventId: 'e1' }));

    expect(prisma.eventPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ noveltyPreference: 'EITHER' }) }),
    );
  });

  it('rejects a minimum complexity above the maximum', async () => {
    const state = await savePreferencesAction(
      idleState,
      form({ eventId: 'e1', minComplexity: '4', maxComplexity: '2' }),
    );

    expect(state.fieldErrors.maxComplexity).toEqual([
      'Minimum complexity cannot be above the maximum.',
    ]);
    expect(prisma.eventPreference.upsert).not.toHaveBeenCalled();
  });

  it('validates before authorizing is even attempted', async () => {
    await savePreferencesAction(idleState, form({ eventId: '' }));

    expect(assertMember).not.toHaveBeenCalled();
  });

  it('refuses a non-member', async () => {
    assertMember.mockRejectedValue(new AuthorizationError('Not a member.', 404));

    const state = await savePreferencesAction(idleState, form({ eventId: 'e1' }));

    expect(state.status).toBe('error');
    expect(prisma.eventPreference.upsert).not.toHaveBeenCalled();
  });
});

describe('toggleRequestAction', () => {
  it('records a request for a game that exists', async () => {
    prisma.game.findUnique.mockResolvedValue({ id: 'g1' });
    prisma.gameRequest.upsert.mockResolvedValue({ id: 'r1' });

    const state = await toggleRequestAction(
      idleState,
      form({ eventId: 'e1', gameId: 'g1', requesting: 'true' }),
    );

    expect(prisma.gameRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_userId_gameId: { eventId: 'e1', userId: 'u1', gameId: 'g1' } },
      }),
    );
    expect(state).toMatchObject({ status: 'success', message: 'Added to your requests.' });
  });

  it('refuses to request a game that does not exist', async () => {
    prisma.game.findUnique.mockResolvedValue(null);

    const state = await toggleRequestAction(
      idleState,
      form({ eventId: 'e1', gameId: 'ghost', requesting: 'true' }),
    );

    expect(state).toMatchObject({ status: 'error', message: 'That game could not be found.' });
    expect(prisma.gameRequest.upsert).not.toHaveBeenCalled();
  });

  it('removes a request without needing the game to still exist', async () => {
    prisma.gameRequest.deleteMany.mockResolvedValue({ count: 1 });

    const state = await toggleRequestAction(
      idleState,
      form({ eventId: 'e1', gameId: 'g1', requesting: 'false' }),
    );

    expect(prisma.game.findUnique).not.toHaveBeenCalled();
    expect(prisma.gameRequest.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'e1', userId: 'u1', gameId: 'g1' },
    });
    expect(state.message).toBe('Request removed.');
  });
});

describe('lockSelectionAction', () => {
  beforeEach(() => {
    getEventRecommendations.mockResolvedValue({
      recommendations: [
        recommendation('g1', 'Catan', 91),
        recommendation('g2', 'Azul', 84),
        recommendation('g3', 'Wingspan', 78),
      ],
    });
  });

  it('locks a primary and two backups, snapshotting the primary score', async () => {
    prisma.eventSelection.upsert.mockResolvedValue({ id: 's1' });

    const state = await lockSelectionAction(
      idleState,
      form({ eventId: 'e1', primaryGameId: 'g1', backup1GameId: 'g2', backup2GameId: 'g3' }),
    );

    const call = prisma.eventSelection.upsert.mock.calls[0]?.[0] as {
      where: unknown;
      create: Record<string, unknown>;
    };
    expect(call.where).toEqual({ eventId: 'e1' });
    expect(call.create).toMatchObject({
      primaryGameId: 'g1',
      backup1GameId: 'g2',
      backup2GameId: 'g3',
      method: 'MANUAL',
      selectedById: 'u1',
      primaryScoreSnapshot: 91,
    });
    expect(state).toMatchObject({ status: 'success', message: 'Locked in Catan.' });
  });

  it('re-runs the engine rather than trusting the submitted game', async () => {
    prisma.eventSelection.upsert.mockResolvedValue({ id: 's1' });

    await lockSelectionAction(idleState, form({ eventId: 'e1', primaryGameId: 'g1' }));

    expect(getEventRecommendations).toHaveBeenCalledWith('e1');
  });

  it('refuses a primary game the engine no longer considers eligible', async () => {
    const state = await lockSelectionAction(
      idleState,
      form({ eventId: 'e1', primaryGameId: 'not-eligible' }),
    );

    expect(state.status).toBe('error');
    expect(state.message).toContain('no longer eligible');
    expect(prisma.eventSelection.upsert).not.toHaveBeenCalled();
  });

  it('refuses an ineligible backup too', async () => {
    const state = await lockSelectionAction(
      idleState,
      form({ eventId: 'e1', primaryGameId: 'g1', backup1GameId: 'not-eligible' }),
    );

    expect(state.status).toBe('error');
    expect(prisma.eventSelection.upsert).not.toHaveBeenCalled();
  });

  it('rejects the same game listed twice', async () => {
    const state = await lockSelectionAction(
      idleState,
      form({ eventId: 'e1', primaryGameId: 'g1', backup1GameId: 'g1' }),
    );

    expect(state.fieldErrors.backup1GameId).toEqual(['Pick three different games.']);
    expect(getEventRecommendations).not.toHaveBeenCalled();
  });

  it('treats omitted backups as null rather than empty strings', async () => {
    prisma.eventSelection.upsert.mockResolvedValue({ id: 's1' });

    await lockSelectionAction(
      idleState,
      form({ eventId: 'e1', primaryGameId: 'g1', backup1GameId: '', backup2GameId: '' }),
    );

    const call = prisma.eventSelection.upsert.mock.calls[0]?.[0] as {
      create: { backup1GameId: string | null; backup2GameId: string | null };
    };
    expect(call.create.backup1GameId).toBeNull();
    expect(call.create.backup2GameId).toBeNull();
  });

  it('refuses a non-organizer', async () => {
    assertOrganizer.mockRejectedValue(new AuthorizationError('Only the organizer can do that.'));

    const state = await lockSelectionAction(idleState, form({ eventId: 'e1', primaryGameId: 'g1' }));

    expect(state.message).toBe('Only the organizer can do that.');
    expect(prisma.eventSelection.upsert).not.toHaveBeenCalled();
  });
});

describe('pickForUsAction', () => {
  it('returns the draw as payload without saving it', async () => {
    getEventRecommendations.mockResolvedValue({ recommendations: [recommendation('g1', 'Catan', 91)] });
    pickForUs.mockReturnValue({
      picked: recommendation('g1', 'Catan', 91),
      pool: [{ gameId: 'g1', name: 'Catan', probability: 1 }],
    });

    const state = await pickForUsAction(idleState, form({ eventId: 'e1' }));

    expect(state).toMatchObject({ status: 'success', message: 'How about Catan?' });
    expect(state.data).toEqual({
      gameId: 'g1',
      name: 'Catan',
      total: 91,
      pool: [{ gameId: 'g1', name: 'Catan', probability: 1 }],
    });
    expect(prisma.eventSelection.upsert).not.toHaveBeenCalled();
  });

  it('explains why there is nothing to draw from, using the engine\'s reason', async () => {
    getEventRecommendations.mockResolvedValue({
      recommendations: [],
      noEligibleGamesReason: 'Nobody has offered a game yet.',
    });
    pickForUs.mockReturnValue(null);

    const state = await pickForUsAction(idleState, form({ eventId: 'e1' }));

    expect(state).toMatchObject({ status: 'error', message: 'Nobody has offered a game yet.' });
  });

  it('falls back to a generic reason when the engine gives none', async () => {
    getEventRecommendations.mockResolvedValue({ recommendations: [] });
    pickForUs.mockReturnValue(null);

    const state = await pickForUsAction(idleState, form({ eventId: 'e1' }));

    expect(state.message).toBe('There is nothing eligible to pick from yet.');
  });

  it('refuses a non-organizer', async () => {
    assertOrganizer.mockRejectedValue(new AuthorizationError('Only the organizer can do that.'));

    const state = await pickForUsAction(idleState, form({ eventId: 'e1' }));

    expect(state.status).toBe('error');
    expect(getEventRecommendations).not.toHaveBeenCalled();
  });
});

describe('lockPickAction', () => {
  beforeEach(() => {
    getEventRecommendations.mockResolvedValue({
      recommendations: [
        recommendation('g1', 'Catan', 91),
        recommendation('g2', 'Azul', 84),
        recommendation('g3', 'Wingspan', 78),
        recommendation('g4', 'Dune', 70),
      ],
    });
  });

  it('locks the drawn game and promotes the next two as backups', async () => {
    prisma.eventSelection.upsert.mockResolvedValue({ id: 's1' });

    const state = await lockPickAction(idleState, form({ eventId: 'e1', gameId: 'g2' }));

    const call = prisma.eventSelection.upsert.mock.calls[0]?.[0] as {
      create: Record<string, unknown>;
    };
    expect(call.create).toMatchObject({
      primaryGameId: 'g2',
      backup1GameId: 'g1',
      backup2GameId: 'g3',
      method: 'PICK_FOR_US',
      primaryScoreSnapshot: 84,
    });
    expect(state).toMatchObject({ status: 'success', message: 'Locked in Azul.' });
  });

  it('leaves backups null when there is nothing else eligible', async () => {
    getEventRecommendations.mockResolvedValue({ recommendations: [recommendation('g1', 'Catan')] });
    prisma.eventSelection.upsert.mockResolvedValue({ id: 's1' });

    await lockPickAction(idleState, form({ eventId: 'e1', gameId: 'g1' }));

    const call = prisma.eventSelection.upsert.mock.calls[0]?.[0] as {
      create: { backup1GameId: string | null; backup2GameId: string | null };
    };
    expect(call.create.backup1GameId).toBeNull();
    expect(call.create.backup2GameId).toBeNull();
  });

  it('refuses a game that is no longer eligible', async () => {
    const state = await lockPickAction(idleState, form({ eventId: 'e1', gameId: 'ghost' }));

    expect(state).toMatchObject({
      status: 'error',
      message: 'That game is no longer eligible. Draw again.',
    });
    expect(prisma.eventSelection.upsert).not.toHaveBeenCalled();
  });

  it('refuses a non-organizer', async () => {
    assertOrganizer.mockRejectedValue(new AuthorizationError('Only the organizer can do that.'));

    const state = await lockPickAction(idleState, form({ eventId: 'e1', gameId: 'g1' }));

    expect(state.status).toBe('error');
    expect(getEventRecommendations).not.toHaveBeenCalled();
  });
});

describe('clearSelectionAction', () => {
  it('clears the selection for the organizer', async () => {
    prisma.eventSelection.deleteMany.mockResolvedValue({ count: 1 });

    const state = await clearSelectionAction(idleState, form({ eventId: 'e1' }));

    expect(prisma.eventSelection.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'e1' } });
    expect(state).toMatchObject({ status: 'success', message: 'Selection cleared.' });
  });

  it('refuses a non-organizer', async () => {
    assertOrganizer.mockRejectedValue(new AuthorizationError('Only the organizer can do that.'));

    const state = await clearSelectionAction(idleState, form({ eventId: 'e1' }));

    expect(state.status).toBe('error');
    expect(prisma.eventSelection.deleteMany).not.toHaveBeenCalled();
  });
});
