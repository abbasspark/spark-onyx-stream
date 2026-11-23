// SPDX-License-Identifier: AGPL-3.0-only
import type { Prisma } from '@onyx/database';

/**
 * Whether a video can be streamed: it is processed and has a stream.
 * A video stored without processing is ready too, but has nothing to play.
 */
export function isPlayable(
  asset: { status: string; manifestPath: string | null } | null | undefined,
): boolean {
  return asset?.status === 'READY' && asset.manifestPath !== null;
}

/** The same rule as a database filter. */
export const PLAYABLE_ASSET = {
  status: 'READY',
  manifestPath: { not: null },
} satisfies Prisma.AssetWhereInput;

/** Episodes viewers can watch: published, with a video that plays. */
export const VISIBLE_EPISODE = {
  status: 'PUBLISHED',
  asset: PLAYABLE_ASSET,
} satisfies Prisma.EpisodeWhereInput;

/**
 * The dates between which a published title is shown. Either end may be open.
 * The start counts, the end does not: a title that ends at midnight is gone at midnight.
 */
export function availableAt(now: Date = new Date()) {
  return [
    { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
    { OR: [{ availableUntil: null }, { availableUntil: { gt: now } }] },
  ] satisfies Prisma.TitleWhereInput[];
}

/** The same rule for one title in hand. */
export function isAvailable(
  title: { availableFrom: Date | null; availableUntil: Date | null },
  now: Date = new Date(),
): boolean {
  return (
    (title.availableFrom === null || title.availableFrom <= now) &&
    (title.availableUntil === null || title.availableUntil > now)
  );
}

/**
 * Titles viewers can see: published, inside their dates, and with something to
 * watch. A published title whose video was deleted in the library, or is being
 * processed again, is left out until it plays again.
 */
export function visibleTitle(now: Date = new Date()) {
  return {
    status: 'PUBLISHED',
    OR: [
      { type: 'MOVIE', asset: PLAYABLE_ASSET },
      { type: 'SERIES', seasons: { some: { episodes: { some: VISIBLE_EPISODE } } } },
    ],
    AND: availableAt(now),
  } satisfies Prisma.TitleWhereInput;
}
