// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from '../catalog/slug.js';
import { LIVE_QUALITIES, type LiveQuality } from './live-ladder.js';
import { InvalidSourceError, parseSource } from './live-source.js';

const name = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Enter a name').max(80));

const slug = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SLUG_LENGTH)
  .regex(SLUG_PATTERN, 'Use lowercase letters, digits and single dashes');

const number = z
  .number()
  .int('Use a whole number')
  .min(1, 'Channel numbers start at 1')
  .max(9999, 'Channel numbers go up to 9999')
  .nullable();

const description = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((value) => value || null);

/** The address of a source. The message of a refused address is written for the admin. */
const source = z
  .string()
  .trim()
  .min(1, 'Enter the address of the source')
  .max(2000)
  .superRefine((value, ctx) => {
    try {
      parseSource(value);
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof InvalidSourceError ? error.message : 'Enter a valid address',
      });
    }
  });

const mode = z.enum(['COPY', 'TRANSCODE']);

/** Picture heights to encode, without repeats, best first. */
const qualities = z
  .array(
    z
      .number()
      .refine(
        (value): value is LiveQuality => (LIVE_QUALITIES as readonly number[]).includes(value),
        {
          message: `Qualities are ${LIVE_QUALITIES.join(', ')}`,
        },
      ),
  )
  .min(1, 'Choose at least one quality')
  .transform((values) => [...new Set(values)].sort((a, b) => b - a));

export const createChannelSchema = z.object({
  name,
  /** Left out, the slug is made from the name. */
  slug: slug.optional(),
  number: number.default(null),
  description: description.default(null),
  source,
  mode: mode.default('COPY'),
  /** Left out, a transcoded channel gets the usual three. */
  qualities: qualities.optional(),
  /** Start pulling the source as soon as the channel exists. */
  start: z.boolean().default(false),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z
  .object({ name, slug, number, description, source, mode, qualities })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export const probeSourceSchema = z.object({ source });
export type ProbeSourceInput = z.infer<typeof probeSourceSchema>;
