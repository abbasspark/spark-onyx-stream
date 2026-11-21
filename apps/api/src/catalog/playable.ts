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
 * Titles viewers can see: published and with something to watch. A published
 * title whose video was deleted in the library, or is being processed again,
 * is left out until it plays again.
 */
export const VISIBLE_TITLE = {
  status: 'PUBLISHED',
  OR: [
    { type: 'MOVIE', asset: PLAYABLE_ASSET },
    { type: 'SERIES', seasons: { some: { episodes: { some: VISIBLE_EPISODE } } } },
  ],
} satisfies Prisma.TitleWhereInput;
