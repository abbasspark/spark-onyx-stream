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

export const AVAILABILITIES = ['scheduled', 'current', 'ended'] as const;
export const EXTRA_KINDS = [
  'TRAILER',
  'TEASER',
  'CLIP',
  'FEATURETTE',
  'BEHIND_THE_SCENES',
  'INTERVIEW',
  'BLOOPERS',
] as const;

/** A moment, such as "2026-12-24T18:00:00.000Z". */
const moment = z.iso.datetime({ offset: true }).nullable();

/** A day without a time, such as "1999-03-31". */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date such as 1999-03-31')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'This day does not exist')
  .nullable();
const minutes = z.number().int().min(1, 'At least one minute').max(1500).nullable();
/** A list of short names without repeats: studios, keywords. */
const nameList = (maxItems: number, maxLength: number) =>
  z
    .array(z.string().trim().min(1).max(maxLength))
    .max(maxItems)
    .transform((names) => [...new Set(names)]);

export const TITLE_TYPES = ['MOVIE', 'SERIES'] as const;
export const SERIES_STATUSES = ['UPCOMING', 'RUNNING', 'ENDED', 'CANCELLED'] as const;
export const CREDIT_KINDS = ['CAST', 'CREW'] as const;
export const PUBLISH_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const IMAGE_KINDS = ['POSTER', 'BACKDROP', 'STILL', 'LOGO', 'PORTRAIT'] as const;
export const TITLE_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'releaseYear',
  'publishedAt',
  'releaseDate',
  'rating',
  'runtimeMinutes',
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

const price = z
  .number()
  .int('Use the smallest unit of the currency, without a decimal point')
  .min(1, 'A price is at least 1')
  .max(100_000_000)
  .nullable();

/** What narrows a list of titles down. Also says which titles something is done to in bulk. */
export const titleFiltersSchema = z.object({
  type: z.enum(TITLE_TYPES).optional(),
  status: z.enum(PUBLISH_STATUSES).optional(),
  categoryId: z.uuid().optional(),
  genreId: z.uuid().optional(),
  /** Titles this person has a part in. */
  personId: z.uuid().optional(),
  seriesStatus: z.enum(SERIES_STATUSES).optional(),
  /**
   * "ready": a movie whose video plays, a series where every episode has one.
   * "missing": a movie without a video that plays, a series with an episode that lacks one.
   */
  video: z.enum(['ready', 'missing']).optional(),
  collectionId: z.uuid().optional(),
  /** By the dates a title is shown between: not yet, right now, or no longer. */
  availability: z.enum(AVAILABILITIES).optional(),
  access: z.enum(TITLE_ACCESS).optional(),
  /** Titles in this package. */
  packageId: z.uuid().optional(),
  /** "none": paid titles in no package, which only plans that open everything show. */
  packaged: z.enum(['none']).optional(),
  /** Matches the name and the original name, ignoring case. */
  q: z.string().trim().min(1).max(200).optional(),
});
export type TitleFilters = z.infer<typeof titleFiltersSchema>;

export const listTitlesSchema = paginationSchema.extend({
  ...titleFiltersSchema.shape,
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
    /** The day of the premiere. */
    releaseDate: day,
    /** A published title is shown from this moment, and until that one. Null leaves the end open. */
    availableFrom: moment,
    availableUntil: moment,
    collectionIds: z.array(z.uuid()).max(50),
    /** Movies: the length of the film. Series: the usual length of an episode. */
    runtimeMinutes: minutes,
    /** Where it was made, as ISO 3166 codes such as "US". */
    countries: z
      .array(
        z.string().regex(/^[A-Z]{2}$/, 'Use country codes of two capital letters, such as "US"'),
      )
      .max(8)
      .transform((codes) => [...new Set(codes)]),
    studios: nameList(8, 120),
    keywords: nameList(30, 60),
    imdbId: z
      .string()
      .trim()
      .regex(/^tt\d{6,10}$/, 'An IMDb id looks like tt0133093')
      .nullable(),
    /** Series only. */
    seriesStatus: z.enum(SERIES_STATUSES).nullable(),
    /** Replaces the title's genres. */
    genreIds: z.array(z.uuid()).max(30),
    isFeatured: z.boolean(),
    /** FREE: open to everyone the installation lets watch. PAID: needs a subscription. */
    access: z.enum(TITLE_ACCESS),
    /** What renting and buying cost, in the smallest unit of the currency. Null: not on offer. */
    rentAmount: price,
    buyAmount: price,
    /** True when no subscription opens the title: it is rented or bought only. */
    purchaseOnly: z.boolean(),
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
  .object({
    number,
    name: optionalText(200),
    synopsis: optionalText(5000),
    /** The day its first episode was first shown. */
    airDate: day,
    posterId: z.uuid().nullable(),
  })
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
    airDate: day,
    runtimeMinutes: minutes,
    assetId: z.uuid().nullable(),
    stillId: z.uuid().nullable(),
    status: z.enum(['DRAFT', 'PUBLISHED']),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdateEpisodeInput = z.infer<typeof updateEpisodeSchema>;

// --- Genres ----------------------------------------------------------------------------

export const createGenreSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80),
  /** Left out, the slug is made from the name. */
  slug: slug.optional(),
});
export type CreateGenreInput = z.infer<typeof createGenreSchema>;

export const updateGenreSchema = createGenreSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdateGenreInput = z.infer<typeof updateGenreSchema>;

// --- People and credits ------------------------------------------------------------------

export const listPeopleSchema = paginationSchema.extend({
  /** Matches the name, ignoring case. */
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(['name', 'createdAt', 'credits']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type ListPeopleInput = z.infer<typeof listPeopleSchema>;

export const createPersonSchema = z.object({
  name,
  /** What they are mostly known as: "Acting", "Directing". */
  knownFor: optionalText(60).optional(),
  biography: optionalText(5000).optional(),
  portraitId: z.uuid().nullable().optional(),
});
export type CreatePersonInput = z.infer<typeof createPersonSchema>;

export const updatePersonSchema = z
  .object({
    name,
    slug,
    knownFor: optionalText(60),
    biography: optionalText(5000),
    portraitId: z.uuid().nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;

/** The whole cast and crew of a title, in the order they are shown. */
export const replaceCreditsSchema = z.object({
  credits: z
    .array(
      z.object({
        personId: z.uuid(),
        kind: z.enum(CREDIT_KINDS),
        /** Cast: the character played. Crew: the job. */
        role: optionalText(200),
      }),
    )
    .max(300),
});
export type ReplaceCreditsInput = z.infer<typeof replaceCreditsSchema>;

// --- Images ----------------------------------------------------------------------------

export const uploadImageQuerySchema = z.object({ kind: z.enum(IMAGE_KINDS) });
export type UploadImageQuery = z.infer<typeof uploadImageQuerySchema>;

// --- Extras ----------------------------------------------------------------------

const extraName = z.string().trim().min(1, 'Give the video a name').max(200);

export const createExtraSchema = z.object({
  kind: z.enum(EXTRA_KINDS).default('TRAILER'),
  name: extraName,
  assetId: z.uuid(),
});
export type CreateExtraInput = z.infer<typeof createExtraSchema>;

export const updateExtraSchema = z
  .object({ kind: z.enum(EXTRA_KINDS), name: extraName })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change');
export type UpdateExtraInput = z.infer<typeof updateExtraSchema>;

/** Every extra of the title exactly once, in the order wanted. */
export const orderExtrasSchema = z.object({ ids: z.array(z.uuid()).max(100) });
export type OrderExtrasInput = z.infer<typeof orderExtrasSchema>;

// --- Collections -----------------------------------------------------------------

const collectionFields = {
  name: z.string().trim().min(1, 'Give the collection a name').max(200),
  slug,
  synopsis: z.string().trim().max(4000),
  visible: z.boolean(),
  posterId: z.uuid().nullable(),
  backdropId: z.uuid().nullable(),
};

export const createCollectionSchema = z.object({
  name: collectionFields.name,
  slug: collectionFields.slug.optional(),
  synopsis: collectionFields.synopsis.optional(),
  visible: collectionFields.visible.optional(),
  titleIds: z.array(z.uuid()).max(500).optional(),
});
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

export const updateCollectionSchema = z
  .object(collectionFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change');
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

/** The titles of a collection, in their order. Titles left out leave the collection. */
export const collectionTitlesSchema = z.object({
  titleIds: z
    .array(z.uuid())
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, 'A title can be in a collection once'),
});
export type CollectionTitlesInput = z.infer<typeof collectionTitlesSchema>;

/** Every collection exactly once, in the order wanted. */
export const orderCollectionsSchema = z.object({ ids: z.array(z.uuid()).max(1000) });
export type OrderCollectionsInput = z.infer<typeof orderCollectionsSchema>;

// --- Translations ----------------------------------------------------------------

const translated = (maxLength: number) => z.string().trim().max(maxLength).nullable().optional();
const translatedPart = z.object({
  id: z.uuid(),
  name: translated(200),
  synopsis: translated(4000),
});

/** The texts of a title in one more language. Empty or left out: not translated. */
export const translationSchema = z.object({
  name: translated(200),
  tagline: translated(300),
  synopsis: translated(4000),
  seasons: z.array(translatedPart).max(200).optional(),
  episodes: z.array(translatedPart).max(5000).optional(),
});
export type TranslationInput = z.infer<typeof translationSchema>;
