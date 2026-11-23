// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

/** How much of the seasons of a series a copy gets. */
export const SEASON_MODES = ['none', 'structure', 'full'] as const;
export type SeasonMode = (typeof SEASON_MODES)[number];

/**
 * What a copy of a title takes along. The texts and facts always come; each
 * of these is a choice, with a default that makes a safe starting point.
 */
const partsSchema = z.object({
  /** Poster, backdrop and logo, and with seasons their posters and stills. The same pictures, not new files. */
  artwork: z.boolean().default(true),
  /** Genres, categories and keywords. */
  classification: z.boolean().default(true),
  /** A place at the end of every collection the title is in. */
  collections: z.boolean().default(false),
  /** Cast and crew. */
  credits: z.boolean().default(true),
  /** Every language, and with seasons those of seasons and episodes. */
  translations: z.boolean().default(true),
  /** Who may watch, the prices for renting and buying, and the packages. */
  pricing: z.boolean().default(true),
  /** The dates it is shown between. */
  availability: z.boolean().default(false),
  /** The film, the trailer and the extras: the same videos, not new files. */
  videos: z.boolean().default(false),
  /**
   * Series: "structure" copies seasons and episodes without their videos,
   * "full" with them, "none" leaves the copy without seasons.
   */
  seasons: z.enum(SEASON_MODES).default('structure'),
  /** The link to the metadata source, so the copy can be refreshed from it. */
  metadataLink: z.boolean().default(false),
});
export type DuplicateParts = z.infer<typeof partsSchema>;

export const duplicateTitleSchema = z.object({
  /** Left out, the copy is called after the title, with "(copy)". */
  name: z.string().trim().min(1, 'Enter a name').max(200).optional(),
  parts: partsSchema.prefault({}),
});
export type DuplicateTitleInput = z.infer<typeof duplicateTitleSchema>;

/** How many of each thing a copy got, for the message after it. */
export interface DuplicateReport {
  genres: number;
  categories: number;
  collections: number;
  credits: number;
  translations: number;
  packages: number;
  extras: number;
  seasons: number;
  episodes: number;
  /** Videos the copy points at: the film, the trailer, extras and episodes. */
  videos: number;
}

const COPY_SUFFIX = ' (copy)';

/**
 * The name a copy gets when none is given: the name with "(copy)", cut so it
 * still fits. A copy of a copy does not grow a second "(copy)".
 */
export function copyName(name: string, maxLength = 200): string {
  const base = name.endsWith(COPY_SUFFIX) ? name.slice(0, -COPY_SUFFIX.length) : name;
  return `${base.slice(0, maxLength - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`;
}
