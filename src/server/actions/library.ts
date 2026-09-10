'use server';

import { revalidatePath } from 'next/cache';

import { CatalogNotFoundError, CatalogUnavailableError } from '@/domain/catalog/types';
import { requireUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { consumeRateLimit } from '@/lib/rate-limit';
import { bggUsernameSchema, manualGameSchema, userGameSchema } from '@/lib/validation';
import {
  addCatalogGameToLibrary,
  createManualGame,
  importCollection,
} from '@/server/games';

import {
  failure,
  fieldErrorsFrom,
  firstMessage,
  runAction,
  success,
  type ActionState,
} from './shared';

export async function addCatalogGameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser('/library');
    const bggId = Number(formData.get('bggId'));
    if (!Number.isInteger(bggId) || bggId <= 0) return failure('That game could not be added.');

    try {
      const result = await addCatalogGameToLibrary(user.id, bggId);
      revalidatePath('/library');
      return success(
        result.alreadyOwned ? 'That game is already in your library.' : 'Added to your library.',
      );
    } catch (error) {
      if (error instanceof CatalogUnavailableError) {
        return failure(`${error.message} You can still add the game manually.`);
      }
      throw error;
    }
  });
}

export async function importCollectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser('/library');

    const parsed = bggUsernameSchema.safeParse(formData.get('bggUsername'));
    if (!parsed.success) {
      const fieldErrors = fieldErrorsFrom(parsed.error);
      return failure(firstMessage(fieldErrors), { bggUsername: fieldErrors._form ?? [] });
    }

    // Collection imports are the most expensive outbound call we make, so they
    // get their own tight per-user limit.
    const limit = await consumeRateLimit({
      bucket: 'bgg-import',
      key: user.id,
      limit: 5,
      windowSeconds: 600,
    });
    if (!limit.allowed) {
      return failure(
        `You have run several imports recently. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      );
    }

    try {
      const result = await importCollection(user.id, parsed.data);
      revalidatePath('/library');

      if (result.total === 0) {
        return failure(
          `BoardGameGeek reports no owned games for "${parsed.data}". Check the username, or add games manually.`,
        );
      }
      const parts = [`Imported ${result.imported} of ${result.total} owned games`];
      if (result.alreadyOwned > 0) parts.push(`${result.alreadyOwned} were already in your library`);
      if (result.skipped > 0) parts.push(`${result.skipped} could not be looked up`);
      return success(`${parts.join('. ')}.`);
    } catch (error) {
      if (error instanceof CatalogNotFoundError) return failure(error.message);
      if (error instanceof CatalogUnavailableError) {
        return failure(`${error.message} You can still add games manually.`);
      }
      throw error;
    }
  });
}

export async function createManualGameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser('/library');

    const parsed = manualGameSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors = fieldErrorsFrom(parsed.error);
      return failure(firstMessage(fieldErrors), fieldErrors);
    }

    await createManualGame(user.id, parsed.data);
    revalidatePath('/library');
    return success(`${parsed.data.name} added to your library.`);
  });
}

export async function updateUserGameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser('/library');

    const parsed = userGameSchema.safeParse({
      userGameId: formData.get('userGameId'),
      // An unchecked checkbox sends nothing at all.
      available: formData.get('available') != null,
      familiarity: formData.get('familiarity'),
      notes: formData.get('notes') ?? undefined,
    });
    if (!parsed.success) {
      const fieldErrors = fieldErrorsFrom(parsed.error);
      return failure(firstMessage(fieldErrors), fieldErrors);
    }

    // Scoping by userId is what stops one user editing another's library row.
    const result = await prisma.userGame.updateMany({
      where: { id: parsed.data.userGameId, userId: user.id },
      data: {
        available: parsed.data.available,
        familiarity: parsed.data.familiarity,
        notes: parsed.data.notes,
      },
    });
    if (result.count === 0) return failure('That game is not in your library.');

    revalidatePath('/library');
    return success('Saved.');
  });
}

export async function removeUserGameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser('/library');
    const userGameId = String(formData.get('userGameId') ?? '');

    const owned = await prisma.userGame.findFirst({
      where: { id: userGameId, userId: user.id },
      select: { gameId: true },
    });
    if (!owned) return failure('That game is not in your library.');

    // Removing a game from the library withdraws any outstanding offers of it,
    // so an event never plans around a game nobody has any more.
    await prisma.$transaction([
      prisma.eventGameOffer.deleteMany({ where: { userId: user.id, gameId: owned.gameId } }),
      prisma.userGame.delete({ where: { id: userGameId } }),
    ]);

    revalidatePath('/library');
    return success('Removed from your library.');
  });
}
