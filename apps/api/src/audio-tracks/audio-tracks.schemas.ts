// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { normalizeLanguage } from '../catalog/language.js';

/** A language tag such as "de", or "und" for a track whose language is not known. */
export const trackLanguage = z
  .string()
  .max(20)
  .transform((value, context) => {
    if (value.trim().toLowerCase() === 'und') {
      return 'und';
    }
    const tag = normalizeLanguage(value);
    if (!tag) {
      context.addIssue({ code: 'custom', message: 'Write the language as a tag such as "de"' });
      return z.NEVER;
    }
    return tag;
  });

const label = z.string().trim().min(1).max(80);

/** What is said about an uploaded file in the address. The body is the file itself. */
export const addAudioQuerySchema = z.object({
  /** Left out, it is read from the name of the file. */
  language: trackLanguage.optional(),
  label: label.optional(),
  /** The name of the file, such as "film.de.m4a". */
  filename: z.string().max(300).optional(),
});
export type AddAudioQuery = z.infer<typeof addAudioQuerySchema>;

export const updateAudioSchema = z
  .object({
    language: trackLanguage,
    label,
    /** True makes this the track players start with. It cannot be taken back, only given to another. */
    isDefault: z.literal(true),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdateAudioBody = z.infer<typeof updateAudioSchema>;
