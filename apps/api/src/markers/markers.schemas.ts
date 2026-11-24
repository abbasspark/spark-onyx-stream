// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { MARKER_KINDS } from './marker.rules.js';

/** Thirty hours in milliseconds: longer than any video. */
const MAX_MS = 108_000_000;

const markerSchema = z.object({
  kind: z.enum(MARKER_KINDS),
  /** Milliseconds from the start of the video. */
  startMs: z.number().int().min(0).max(MAX_MS),
  /** Null for credits that run to the end. */
  endMs: z.number().int().min(0).max(MAX_MS).nullable(),
});

/** All the markers of a video. What is not named is removed. */
export const replaceMarkersSchema = z.object({
  markers: z.array(markerSchema).max(MARKER_KINDS.length),
});
export type ReplaceMarkersInput = z.infer<typeof replaceMarkersSchema>;

export const detectMarkersSchema = z.preprocess(
  (body) => body ?? {},
  z.object({
    /** True also replaces markers an admin set, where the search finds something. */
    overwrite: z.boolean().default(false),
  }),
);
export type DetectMarkersInput = z.infer<typeof detectMarkersSchema>;
