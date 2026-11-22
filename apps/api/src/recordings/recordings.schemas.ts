// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.js';
import { MAX_PAST_START_MS, MAX_RECORDING_MS } from './recording-plan.js';

const moment = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const createRecordingSchema = z
  .object({
    channelId: z.uuid(),
    title: z.string().trim().min(1, 'Enter a title').max(200),
    startsAt: moment,
    endsAt: moment,
  })
  .superRefine((value, ctx) => {
    // A time that could not be read has its own message, and is not a date here.
    if (!(value.startsAt instanceof Date) || !(value.endsAt instanceof Date)) {
      return;
    }
    const problem = timesProblem(value.startsAt, value.endsAt);
    if (problem) {
      ctx.addIssue({ code: 'custom', path: [problem.field], message: problem.message });
    }
  });
export type CreateRecordingInput = z.infer<typeof createRecordingSchema>;

/** Why a recording cannot cover a stretch of time. Null when it can. */
export function timesProblem(
  startsAt: Date,
  endsAt: Date,
  now: Date = new Date(),
): { field: 'startsAt' | 'endsAt'; message: string } | null {
  if (endsAt <= startsAt) {
    return { field: 'endsAt', message: 'The end must be after the start' };
  }
  if (endsAt.getTime() - startsAt.getTime() > MAX_RECORDING_MS) {
    return { field: 'endsAt', message: 'A recording covers eight hours at most' };
  }
  if (endsAt <= now) {
    return {
      field: 'endsAt',
      message:
        'This is already over. Only what is still to come, or still kept by the channel, can be recorded',
    };
  }
  if (now.getTime() - startsAt.getTime() > MAX_PAST_START_MS) {
    return { field: 'startsAt', message: 'The start lies further back than any channel keeps' };
  }
  return null;
}

export const listRecordingsSchema = paginationSchema.extend({
  /** "open": waiting or being made. "finished": everything else. */
  show: z.enum(['all', 'open', 'finished']).default('all'),
});
export type ListRecordingsQuery = z.infer<typeof listRecordingsSchema>;
