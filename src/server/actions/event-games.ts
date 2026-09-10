'use server';

import { revalidatePath } from 'next/cache';

import { pickForUs } from '@/domain/recommendation';
import { assertMember, assertOrganizer, requireUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { preferencesSchema, selectionSchema } from '@/lib/validation';
import { getEventRecommendations } from '@/server/recommendations';

import {
  failure,
  fieldErrorsFrom,
  firstMessage,
  runAction,
  success,
  type ActionState,
} from './shared';

function revalidateEvent(eventId: string): void {
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/offers`);
  revalidatePath(`/events/${eventId}/preferences`);
  revalidatePath(`/events/${eventId}/recommendations`);
  revalidatePath(`/events/${eventId}/tonight`);
}

// ---------------------------------------------------------------------------
// Offering games
// ---------------------------------------------------------------------------

export async function toggleOfferAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const eventId = String(formData.get('eventId') ?? '');
    const gameId = String(formData.get('gameId') ?? '');
    const offering = String(formData.get('offering') ?? '') === 'true';

    await assertMember(eventId, user.id);

    // You can only offer a game you actually own. This is the server-side
    // guarantee behind "owning a game does not mean it will be brought".
    const owned = await prisma.userGame.findUnique({
      where: { userId_gameId: { userId: user.id, gameId } },
      select: { available: true, game: { select: { name: true } } },
    });
    if (!owned) return failure('You can only offer games from your own library.');

    if (offering) {
      if (!owned.available) {
        return failure(
          `Mark ${owned.game.name} as available in your library before offering it.`,
        );
      }
      // Offering twice is a no-op rather than an error.
      await prisma.eventGameOffer.upsert({
        where: { eventId_userId_gameId: { eventId, userId: user.id, gameId } },
        create: { eventId, userId: user.id, gameId },
        update: {},
      });
    } else {
      await prisma.eventGameOffer.deleteMany({ where: { eventId, userId: user.id, gameId } });
    }

    revalidateEvent(eventId);
    return success(
      offering ? `You are bringing ${owned.game.name}.` : `No longer bringing ${owned.game.name}.`,
    );
  });
}

// ---------------------------------------------------------------------------
// Preferences and requests
// ---------------------------------------------------------------------------

export async function savePreferencesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();

    const parsed = preferencesSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors = fieldErrorsFrom(parsed.error);
      return failure(firstMessage(fieldErrors), fieldErrors);
    }

    const { eventId, ...preference } = parsed.data;
    await assertMember(eventId, user.id);

    await prisma.eventPreference.upsert({
      where: { eventId_userId: { eventId, userId: user.id } },
      create: { eventId, userId: user.id, ...preference },
      update: preference,
    });

    revalidateEvent(eventId);
    return success('Preferences saved.');
  });
}

export async function toggleRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const eventId = String(formData.get('eventId') ?? '');
    const gameId = String(formData.get('gameId') ?? '');
    const requesting = String(formData.get('requesting') ?? '') === 'true';

    await assertMember(eventId, user.id);

    if (requesting) {
      const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
      if (!game) return failure('That game could not be found.');

      await prisma.gameRequest.upsert({
        where: { eventId_userId_gameId: { eventId, userId: user.id, gameId } },
        create: { eventId, userId: user.id, gameId },
        update: {},
      });
    } else {
      await prisma.gameRequest.deleteMany({ where: { eventId, userId: user.id, gameId } });
    }

    revalidateEvent(eventId);
    return success(requesting ? 'Added to your requests.' : 'Request removed.');
  });
}

// ---------------------------------------------------------------------------
// Organizer selection
// ---------------------------------------------------------------------------

export async function lockSelectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();

    const parsed = selectionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors = fieldErrorsFrom(parsed.error);
      return failure(firstMessage(fieldErrors), fieldErrors);
    }

    const { eventId, primaryGameId, backup1GameId, backup2GameId, notes } = parsed.data;
    await assertOrganizer(eventId, user.id);

    // Re-run the engine server-side: the browser does not get to nominate a
    // game that is not actually eligible, however the form was submitted.
    const result = await getEventRecommendations(eventId);
    const eligible = new Map(result.recommendations.map((r) => [r.gameId, r]));

    const chosen = [primaryGameId, backup1GameId, backup2GameId].filter(
      (id): id is string => Boolean(id),
    );
    const ineligible = chosen.filter((id) => !eligible.has(id));
    if (ineligible.length > 0) {
      return failure(
        'One of those games is no longer eligible — the group or your settings may have changed. Reload the recommendations and try again.',
      );
    }

    await prisma.eventSelection.upsert({
      where: { eventId },
      create: {
        eventId,
        primaryGameId,
        backup1GameId,
        backup2GameId,
        notes,
        method: 'MANUAL',
        selectedById: user.id,
        primaryScoreSnapshot: eligible.get(primaryGameId)?.total ?? null,
      },
      update: {
        primaryGameId,
        backup1GameId,
        backup2GameId,
        notes,
        method: 'MANUAL',
        selectedById: user.id,
        lockedAt: new Date(),
        primaryScoreSnapshot: eligible.get(primaryGameId)?.total ?? null,
      },
    });

    revalidateEvent(eventId);
    return success(`Locked in ${eligible.get(primaryGameId)?.name}.`);
  });
}

export type PickForUsPayload = {
  gameId: string;
  name: string;
  total: number;
  pool: { gameId: string; name: string; probability: number }[];
};

/**
 * Draws a game at random from the top eligible recommendations, weighted by
 * score. It returns the draw rather than saving it, so the organizer can
 * reroll before locking it in.
 */
export async function pickForUsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const eventId = String(formData.get('eventId') ?? '');
    await assertOrganizer(eventId, user.id);

    const result = await getEventRecommendations(eventId);
    const pick = pickForUs(result.recommendations);
    if (!pick) {
      return failure(
        result.noEligibleGamesReason ??
          'There is nothing eligible to pick from yet.',
      );
    }

    const payload: PickForUsPayload = {
      gameId: pick.picked.gameId,
      name: pick.picked.name,
      total: pick.picked.total,
      pool: pick.pool,
    };
    return success(`How about ${pick.picked.name}?`, payload);
  });
}

/** Locks whatever "Pick for us" landed on, recording how it was chosen. */
export async function lockPickAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const eventId = String(formData.get('eventId') ?? '');
    const gameId = String(formData.get('gameId') ?? '');
    await assertOrganizer(eventId, user.id);

    const result = await getEventRecommendations(eventId);
    const chosen = result.recommendations.find((r) => r.gameId === gameId);
    if (!chosen) {
      return failure('That game is no longer eligible. Draw again.');
    }

    // The next two eligible games become backups, which is what an organizer
    // reaching for "Pick for us" almost always wants anyway.
    const backups = result.recommendations.filter((r) => r.gameId !== gameId).slice(0, 2);

    await prisma.eventSelection.upsert({
      where: { eventId },
      create: {
        eventId,
        primaryGameId: gameId,
        backup1GameId: backups[0]?.gameId ?? null,
        backup2GameId: backups[1]?.gameId ?? null,
        method: 'PICK_FOR_US',
        selectedById: user.id,
        primaryScoreSnapshot: chosen.total,
      },
      update: {
        primaryGameId: gameId,
        backup1GameId: backups[0]?.gameId ?? null,
        backup2GameId: backups[1]?.gameId ?? null,
        method: 'PICK_FOR_US',
        selectedById: user.id,
        lockedAt: new Date(),
        primaryScoreSnapshot: chosen.total,
      },
    });

    revalidateEvent(eventId);
    return success(`Locked in ${chosen.name}.`);
  });
}

export async function clearSelectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const eventId = String(formData.get('eventId') ?? '');
    await assertOrganizer(eventId, user.id);

    await prisma.eventSelection.deleteMany({ where: { eventId } });
    revalidateEvent(eventId);
    return success('Selection cleared.');
  });
}
