// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { normalizeLanguage } from '../catalog/language.js';
import { SUBTITLE_ENCODINGS } from './subtitle-file.js';

/** A language tag such as "de", or "und" for a track whose language is not known. */
const language = z
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
export const addSubtitleQuerySchema = z.object({
  /** Left out, it is read from the name of the file. */
  language: language.optional(),
  label: label.optional(),
  forced: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  /** The name of the file, such as "film.de.srt". */
  filename: z.string().max(300).optional(),
  /** For files that are not Unicode, when the guess from the language is wrong. */
  encoding: z.enum(SUBTITLE_ENCODINGS).optional(),
});
export type AddSubtitleQuery = z.infer<typeof addSubtitleQuerySchema>;

export const updateSubtitleSchema = z
  .object({ language, label, isForced: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdateSubtitleBody = z.infer<typeof updateSubtitleSchema>;
