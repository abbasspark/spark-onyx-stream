// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.js';
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from './slug.js';

const name = z.string().trim().min(1, 'Enter a name').max(200);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();
const slug = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SLUG_LENGTH)
  .regex(SLUG_PATTERN, 'Use lowercase letters, digits and single dashes');
/** A BCP 47 language code in its simple forms, such as "en" or "pt-BR". */
const languageCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'Use a language code such as "en"');

export const TITLE_TYPES = ['MOVIE', 'SERIES'] as const;
export const PUBLISH_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const IMAGE_KINDS = ['POSTER', 'BACKDROP', 'STILL', 'LOGO'] as const;
export const TITLE_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'releaseYear',
  'publishedAt',
] as const;

// --- Categories ----------------------------------------------------------------

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80),
  /** Left out, the slug is made from the name. */
  slug: slug.optional(),
  description: optionalText(500).optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const reorderCategoriesSchema = z.object({
  /** Every category id, in the wanted order. */
  ids: z.array(z.uuid()).min(1).max(500),
});
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;

// --- Titles ----------------------------------------------------------------------

export const TITLE_ACCESS = ['FREE', 'PAID'] as const;

export const listTitlesSchema = paginationSchema.extend({
  type: z.enum(TITLE_TYPES).optional(),
  status: z.enum(PUBLISH_STATUSES).optional(),
  categoryId: z.uuid().optional(),
  access: z.enum(TITLE_ACCESS).optional(),
  /** Titles in this package. */
  packageId: z.uuid().optional(),
  /** "none": paid titles in no package, which only plans that open everything show. */
  packaged: z.enum(['none']).optional(),
  /** Matches the name and the original name, ignoring case. */
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(TITLE_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListTitlesInput = z.infer<typeof listTitlesSchema>;

export const createTitleSchema = z.object({
  type: z.enum(TITLE_TYPES),
  name,
  /** Left out, the slug is made from the name. */
  slug: slug.optional(),
});
export type CreateTitleInput = z.infer<typeof createTitleSchema>;

const currentYear = new Date().getUTCFullYear();

export const updateTitleSchema = z
  .object({
    name,
    slug,
    originalName: optionalText(200),
    tagline: optionalText(200),
    synopsis: optionalText(5000),
    releaseYear: z
      .number()
      .int()
      .min(1888)
      .max(currentYear + 10)
      .nullable(),
    ageRating: optionalText(16),
    originalLanguage: languageCode.nullable(),
    isFeatured: z.boolean(),
    /** FREE: open to everyone the installation lets watch. PAID: needs a subscription. */
    access: z.enum(TITLE_ACCESS),
    /** Replaces the title's categories. */
    categoryIds: z.array(z.uuid()).max(50),
    /** Replaces the packages the title is in. Plans open a paid title through them. */
    packageIds: z.array(z.uuid()).max(50),
    assetId: z.uuid().nullable(),
    trailerAssetId: z.uuid().nullable(),
    posterId: z.uuid().nullable(),
    backdropId: z.uuid().nullable(),
    logoId: z.uuid().nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdateTitleInput = z.infer<typeof updateTitleSchema>;

export const setStatusSchema = z.object({ status: z.enum(PUBLISH_STATUSES) });
export type SetStatusInput = z.infer<typeof setStatusSchema>;

// --- Seasons and episodes ------------------------------------------------------------

const number = z.number().int().min(0).max(10_000);

export const createSeasonSchema = z.object({
  /** Left out, the next free number is used. */
  number: number.optional(),
  name: optionalText(200).optional(),
  synopsis: optionalText(5000).optional(),
});
export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;

export const updateSeasonSchema = z
  .object({ number, name: optionalText(200), synopsis: optionalText(5000) })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdateSeasonInput = z.infer<typeof updateSeasonSchema>;

export const createEpisodeSchema = z.object({
  /** Left out, the next free number is used. */
  number: number.optional(),
  name,
  synopsis: optionalText(5000).optional(),
  assetId: z.uuid().nullable().optional(),
});
export type CreateEpisodeInput = z.infer<typeof createEpisodeSchema>;

export const updateEpisodeSchema = z
  .object({
    number,
    name,
    synopsis: optionalText(5000),
    assetId: z.uuid().nullable(),
    stillId: z.uuid().nullable(),
    status: z.enum(['DRAFT', 'PUBLISHED']),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdateEpisodeInput = z.infer<typeof updateEpisodeSchema>;

// --- Images ----------------------------------------------------------------------------

export const uploadImageQuerySchema = z.object({ kind: z.enum(IMAGE_KINDS) });
export type UploadImageQuery = z.infer<typeof uploadImageQuerySchema>;
