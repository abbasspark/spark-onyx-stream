// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

const name = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Enter a name').max(80));

/** Guide files are fetched over the web and nothing else. */
const url = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.hostname;
      } catch {
        return false;
      }
    },
    { message: 'Enter an address that starts with https:// or http://' },
  );

export const createSourceSchema = z.object({ name, url, enabled: z.boolean().default(true) });
export type CreateSourceInput = z.infer<typeof createSourceSchema>;

export const updateSourceSchema = z
  .object({ name, url, enabled: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>;

export const searchKnownSchema = z.object({ q: z.string().trim().max(100).default('') });

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

const moment = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

/** A programme lasts at most a day: longer is a mistake in the times. */
const MAX_LENGTH_MS = 24 * 60 * 60 * 1000;

function checkTimes(value: { startsAt?: Date; endsAt?: Date }, ctx: z.RefinementCtx): void {
  // A time that could not be read has its own message, and is not a date here.
  if (!(value.startsAt instanceof Date) || !(value.endsAt instanceof Date)) {
    return;
  }
  const length = value.endsAt.getTime() - value.startsAt.getTime();
  if (length <= 0) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The end must be after the start' });
  } else if (length > MAX_LENGTH_MS) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'A programme lasts a day at most',
    });
  }
}

const programmeFields = {
  title: z.string().trim().min(1, 'Enter a title').max(200),
  subtitle: text(200),
  description: text(2000),
  category: text(80),
  startsAt: moment,
  endsAt: moment,
};

export const createProgrammeSchema = z
  .object({
    ...programmeFields,
    subtitle: programmeFields.subtitle.default(null),
    description: programmeFields.description.default(null),
    category: programmeFields.category.default(null),
  })
  .superRefine(checkTimes);
export type CreateProgrammeInput = z.infer<typeof createProgrammeSchema>;

export const updateProgrammeSchema = z
  .object(programmeFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type UpdateProgrammeInput = z.infer<typeof updateProgrammeSchema>;

/** A stretch of time to list programmes for. A week at most. */
export const programmeWindowSchema = z
  .object({ from: moment, to: moment })
  .refine((value) => value.to > value.from, { message: 'The end must be after the start' })
  .refine((value) => value.to.getTime() - value.from.getTime() <= 8 * MAX_LENGTH_MS, {
    message: 'Ask for a week at most',
  });
export type ProgrammeWindow = z.infer<typeof programmeWindowSchema>;
