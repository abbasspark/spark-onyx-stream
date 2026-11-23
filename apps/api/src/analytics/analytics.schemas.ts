// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.js';

/** The longest stretch of days one question can be about. */
export const MAX_RANGE_DAYS = 400;

const day = z.iso.date();

const timezone = z
  .string()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Not a time zone such as "Europe/Berlin"')
  .default('UTC');

const range = {
  /** The first and the last day, both included, as days of the time zone. */
  from: day,
  to: day,
  /** Where days begin and end: the time zone of whoever asks. */
  timezone,
  type: z.enum(['MOVIE', 'SERIES']).optional(),
};

const checked = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object(shape).superRefine((value, context) => {
    const { from, to } = value as unknown as { from: string; to: string };
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
    if (days < 1) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'The last day is before the first',
      });
    } else if (days > MAX_RANGE_DAYS) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Ask for ${MAX_RANGE_DAYS} days at most`,
      });
    }
  });

export const summarySchema = checked(range);
export type SummaryInput = z.infer<typeof summarySchema>;

export const TITLE_RANKINGS = ['views', 'viewers', 'watchSeconds', 'completion'] as const;

export const titlesSchema = checked({
  ...range,
  ...paginationSchema.shape,
  sort: z.enum(TITLE_RANKINGS).default('views'),
});
export type TitlesInput = z.infer<typeof titlesSchema>;

export const titleSchema = checked({ from: range.from, to: range.to, timezone: range.timezone });
export type TitleInput = z.infer<typeof titleSchema>;
