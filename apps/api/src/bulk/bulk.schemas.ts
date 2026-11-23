// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { titleFiltersSchema } from '../catalog/catalog.schemas.js';
import { normalizeLanguage } from '../catalog/language.js';

/** The most titles named one by one in a request. */
export const MAX_IDS = 500;
/** The most titles one request changes, also when it means "all that match". */
export const MAX_TITLES = 5000;

const ids = z.array(z.uuid()).max(50);
const moment = z.iso.datetime({ offset: true }).nullable();

const language = z
  .string()
  .max(20)
  .transform((value, context) => {
    const tag = normalizeLanguage(value);
    if (!tag) {
      context.addIssue({ code: 'custom', message: 'Write the language as a tag such as "de"' });
      return z.NEVER;
    }
    return tag;
  });

/** What is done to every title of the selection. */
export const bulkActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('publish') }),
  z.object({ type: z.literal('unpublish') }),
  z.object({ type: z.literal('archive') }),
  z.object({ type: z.literal('delete') }),
  z.object({ type: z.literal('feature'), value: z.boolean() }),
  /** Puts the titles on shelves, or takes them off. Other shelves of a title stay as they are. */
  z.object({ type: z.literal('categories'), add: ids.default([]), remove: ids.default([]) }),
  z.object({ type: z.literal('genres'), add: ids.default([]), remove: ids.default([]) }),
  z.object({ type: z.literal('collections'), add: ids.default([]), remove: ids.default([]) }),
  /** Sets the dates a title is shown between. A date left out stays as it is, null clears it. */
  z.object({
    type: z.literal('availability'),
    availableFrom: moment.optional(),
    availableUntil: moment.optional(),
  }),
  /** Starts a job that fills in the texts of the titles in a language, from the source. */
  z.object({ type: z.literal('translate'), language, overwrite: z.boolean().default(false) }),
]);
export type BulkAction = z.infer<typeof bulkActionSchema>;

/**
 * Which titles: named one by one, or everything a set of filters means. The
 * second is what "select all 240 that match" in the panel sends, so that what
 * is on other pages of the list is meant as well.
 */
export const bulkSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(MAX_IDS).optional(),
    filter: titleFiltersSchema.optional(),
    action: bulkActionSchema,
  })
  .refine((value) => (value.ids === undefined) !== (value.filter === undefined), {
    message: 'Name the titles by "ids" or by "filter", not both',
  });
export type BulkInput = z.infer<typeof bulkSchema>;

export const listJobsSchema = z.object({
  /** "true" keeps only jobs that are waiting or running. */
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type ListJobsInput = z.infer<typeof listJobsSchema>;
