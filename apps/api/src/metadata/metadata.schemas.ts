// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { TITLE_TYPES } from '../catalog/catalog.schemas.js';
import { METADATA_ID_PATTERN } from './tmdb.mapper.js';

/** A language as TMDB takes it: "en" or "en-US". */
const language = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Use a language such as "en" or "en-US"');

const metadataId = z.string().regex(METADATA_ID_PATTERN, 'Not an id of a title at the source');

/** Query values arrive as text. */
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

export const searchMetadataSchema = z.object({
  type: z.enum(TITLE_TYPES),
  q: z.string().trim().min(1, 'Enter a name to search for').max(200),
  year: z.coerce.number().int().min(1888).max(2200).optional(),
  language: language.optional(),
});
export type SearchMetadataInput = z.infer<typeof searchMetadataSchema>;

export const previewMetadataSchema = z.object({
  id: metadataId,
  language: language.optional(),
  specials: flag.optional(),
});
export type PreviewMetadataInput = z.infer<typeof previewMetadataSchema>;

/** What an import brings. Everything is on unless it is turned off. */
const parts = {
  id: metadataId,
  language: language.optional(),
  /** Names, tagline, synopsis, year, age rating, language. */
  text: z.boolean().default(true),
  /** Genres become categories. */
  categories: z.boolean().default(true),
  /** Creates a category for a genre that has none of the same name. */
  createCategories: z.boolean().default(true),
  /** Poster, backdrop and logo. */
  artwork: z.boolean().default(true),
  /** Seasons and episodes of a series. */
  episodes: z.boolean().default(true),
  /** A still for each episode. */
  stills: z.boolean().default(true),
  /** Specials, which are season 0. */
  specials: z.boolean().default(false),
};

export const importMetadataSchema = z.object({
  ...parts,
  /** Imports although the catalog already has a title from this entry. */
  allowDuplicate: z.boolean().default(false),
});
export type ImportMetadataInput = z.infer<typeof importMetadataSchema>;

export const applyMetadataSchema = z.object({
  ...parts,
  /**
   * Replaces what the title already has. Off, only what is empty is filled
   * and only what is missing is added, so nothing typed by hand is lost.
   */
  overwrite: z.boolean().default(false),
});
export type ApplyMetadataInput = z.infer<typeof applyMetadataSchema>;

export type MetadataParts = Omit<ApplyMetadataInput, 'overwrite'>;
