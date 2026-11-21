// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

/** Longer than any video: 100 hours. */
const MAX_SECONDS = 360_000;
/** Positions sent at once, for a device that hands over what it kept while signed out. */
export const MAX_ITEMS_PER_REQUEST = 50;

export const watchPositionSchema = z.object({
  /** Slug of the movie or the series. */
  title: z.string().trim().min(1).max(200),
  /** For an episode of a series. */
  episodeId: z.string().uuid().optional(),
  /** Seconds watched and seconds in total. */
  position: z.number().finite().min(0).max(MAX_SECONDS),
  duration: z.number().finite().positive().max(MAX_SECONDS),
  /** When this was watched, if not right now. */
  watchedAt: z.coerce.date().optional(),
});
export type WatchPositionInput = z.infer<typeof watchPositionSchema>;

export const saveWatchPositionsSchema = z.object({
  items: z.array(watchPositionSchema).min(1).max(MAX_ITEMS_PER_REQUEST),
});
export type SaveWatchPositionsInput = z.infer<typeof saveWatchPositionsSchema>;
