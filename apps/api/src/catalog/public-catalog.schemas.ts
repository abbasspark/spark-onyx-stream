// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.js';
import { TITLE_TYPES } from './catalog.schemas.js';
import { normalizeLanguage } from './language.js';
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from './slug.js';

export const PUBLIC_SORTS = ['newest', 'name', 'year', 'rating'] as const;

const slug = z.string().trim().min(1).max(MAX_SLUG_LENGTH).regex(SLUG_PATTERN, 'Not a valid slug');

/**
 * The language texts are wanted in, such as "de" or "pt-BR". Titles without a
 * translation into it come in the language of the catalog.
 */
const language = z
  .string()
  .max(20)
  .transform((value) => normalizeLanguage(value) ?? undefined)
  .optional();

export const listPublicTitlesSchema = paginationSchema.extend({
  type: z.enum(TITLE_TYPES).optional(),
  /** Slug of a category. */
  category: slug.optional(),
  /** Slug of a genre. */
  genre: slug.optional(),
  /** Slug of a person who has a part in the title. */
  person: slug.optional(),
  /** Slug of a collection. */
  collection: slug.optional(),
  /** "true" keeps only featured titles. */
  featured: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  /** Matches the name and the original name, ignoring case. */
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(PUBLIC_SORTS).default('newest'),
  language,
});
export type ListPublicTitlesInput = z.infer<typeof listPublicTitlesSchema>;

export const languageQuerySchema = z.object({ language });
export type LanguageQuery = z.infer<typeof languageQuerySchema>;

export const slugParamSchema = slug;
