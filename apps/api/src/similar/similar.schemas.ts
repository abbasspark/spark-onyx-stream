// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { normalizeLanguage } from '../catalog/language.js';

/** How many similar titles are answered when a client does not say. */
export const DEFAULT_SIMILAR = 12;
export const MAX_SIMILAR = 30;

/** How many titles an editor can pin to one title, and how many they can hide from it. */
export const MAX_PINNED = 30;
export const MAX_HIDDEN = 200;

const language = z
  .string()
  .max(20)
  .transform((value) => normalizeLanguage(value) ?? undefined)
  .optional();

export const similarQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_SIMILAR).default(DEFAULT_SIMILAR),
  language,
});
export type SimilarQuery = z.infer<typeof similarQuerySchema>;

export const similarChoicesSchema = z
  .object({
    /** Ids of the titles always shown, in the order they are shown. */
    pinned: z.array(z.uuid()).max(MAX_PINNED),
    /** Ids of the titles never shown. */
    hidden: z.array(z.uuid()).max(MAX_HIDDEN),
  })
  .superRefine((value, context) => {
    const pinned = new Set(value.pinned);
    if (pinned.size !== value.pinned.length || new Set(value.hidden).size !== value.hidden.length) {
      context.addIssue({ code: 'custom', message: 'A title is named twice' });
    }
    if (value.hidden.some((id) => pinned.has(id))) {
      context.addIssue({ code: 'custom', message: 'A title cannot be pinned and hidden at once' });
    }
  });
export type SimilarChoicesInput = z.infer<typeof similarChoicesSchema>;
