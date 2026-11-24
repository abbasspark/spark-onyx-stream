// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

export const HOME_KINDS = [
  'HERO',
  'CONTINUE_WATCHING',
  'MY_LIST',
  'BECAUSE_YOU_WATCHED',
  'TITLES',
] as const;
export const HOME_SOURCES = [
  'ALL',
  'FEATURED',
  'CATEGORY',
  'GENRE',
  'COLLECTION',
  'MANUAL',
] as const;
export const HOME_SORTS = ['CURATED', 'NEWEST', 'RELEASED', 'RATING', 'NAME'] as const;
export const HOME_LAYOUTS = ['POSTER', 'LANDSCAPE', 'NUMBERED'] as const;

/** The most titles the hero lets take turns. */
export const MAX_HERO_TITLES = 8;
/** The fewest and the most titles of a row. */
export const MIN_ROW_TITLES = 4;
export const MAX_ROW_TITLES = 40;
/** The most sections a home page has. */
export const MAX_SECTIONS = 40;

const moment = z.iso.datetime({ offset: true }).nullable();

const fields = {
  /** The heading. Null or empty: named after what the section shows. */
  name: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .transform((value) => value || null),
  source: z.enum(HOME_SOURCES),
  categoryId: z.uuid().nullable(),
  genreId: z.uuid().nullable(),
  collectionId: z.uuid().nullable(),
  /** Only movies or only series. Null: both. */
  titleType: z.enum(['MOVIE', 'SERIES']).nullable(),
  sort: z.enum(HOME_SORTS),
  limit: z.number().int().min(1).max(MAX_ROW_TITLES),
  layout: z.enum(HOME_LAYOUTS),
  visible: z.boolean(),
  visibleFrom: moment,
  visibleUntil: moment,
  /** For the source MANUAL: the titles, in their order. Replaces the ones before. */
  titleIds: z.array(z.uuid()).max(MAX_ROW_TITLES),
};

export const createSectionSchema = z
  .object({ kind: z.enum(HOME_KINDS) })
  .extend(z.object(fields).partial().shape);
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = z
  .object(fields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;

export const orderSectionsSchema = z.object({ ids: z.array(z.uuid()).min(1).max(MAX_SECTIONS) });
export type OrderSectionsInput = z.infer<typeof orderSectionsSchema>;
