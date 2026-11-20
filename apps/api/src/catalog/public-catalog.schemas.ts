// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.js';
import { TITLE_TYPES } from './catalog.schemas.js';
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from './slug.js';

export const PUBLIC_SORTS = ['newest', 'name', 'year'] as const;

const slug = z.string().trim().min(1).max(MAX_SLUG_LENGTH).regex(SLUG_PATTERN, 'Not a valid slug');

export const listPublicTitlesSchema = paginationSchema.extend({
  type: z.enum(TITLE_TYPES).optional(),
  /** Slug of a category. */
  category: slug.optional(),
  /** "true" keeps only featured titles. */
  featured: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  /** Matches the name and the original name, ignoring case. */
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(PUBLIC_SORTS).default('newest'),
});
export type ListPublicTitlesInput = z.infer<typeof listPublicTitlesSchema>;

export const slugParamSchema = slug;
