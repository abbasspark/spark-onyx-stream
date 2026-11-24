// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { MAX_RANGE_DAYS } from '../analytics/analytics.schemas.js';
import { paginationSchema } from '../common/pagination.js';
import { ERROR_CODE_PATTERN, MAX_MESSAGE_LENGTH } from './report-rules.js';

const count = z.number().min(0).max(1_000_000_000);

/**
 * What a player counted since the playback began. Every report holds the
 * whole count so far, so a report that gets lost costs nothing.
 */
export const reportSchema = z.object({
  /**
   * Milliseconds from the wish to play (the press on "Play", or the page
   * opening for a video that starts by itself) to the first picture. Left
   * out until the video started.
   */
  startupMs: z.number().min(0).max(3_600_000).optional(),
  /** Seconds the video actually played. */
  played: count,
  /**
   * How often playback stopped to load after it had started, and for how
   * many milliseconds in all. Loading after the viewer jumped to another
   * place is not counted.
   */
  stalls: count,
  stallMs: count,
  /** How often the quality changed, by itself or by the viewer's choice. */
  qualityChanges: count,
  /** The average bitrate of the picture so far, in kilobits per second. */
  bitrateKbps: z.number().min(0).max(1_000_000).optional(),
  /** The height of the picture it played in for the longest time, such as 1080. */
  height: z.number().min(0).max(16_000).optional(),
  droppedFrames: count.optional(),
  /** Problems the player got over by itself, such as a piece loaded at the second try. */
  recoveredErrors: count.optional(),
  /**
   * The problem that ended playback. `code` is one of "network", "media",
   * "unsupported", "expired", "key", "timeout" or "other"; an app may send a
   * short word of its own. `position` is where in the video it was, in seconds.
   */
  error: z
    .object({
      code: z.string().regex(ERROR_CODE_PATTERN, 'A short word of small letters'),
      message: z
        .string()
        .max(MAX_MESSAGE_LENGTH * 4)
        .optional(),
      position: z.number().min(0).max(1_000_000).optional(),
    })
    .optional(),
  /** True in the last report: the video ended, or the viewer left. */
  ended: z.boolean().optional(),
  /** What the player is, such as "web", "android-tv" or "ios", and its version. */
  player: z
    .object({
      name: z.string().trim().min(1).max(40),
      version: z.string().trim().min(1).max(40).optional(),
    })
    .optional(),
});
export type ReportBody = z.infer<typeof reportSchema>;

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

const filters = {
  /** The first and the last day, both included, as days of the time zone. */
  from: day,
  to: day,
  timezone,
  /** Only videos, or only live channels. */
  kind: z.enum(['VIDEO', 'LIVE']).optional(),
  device: z.enum(['DESKTOP', 'MOBILE', 'TABLET', 'TV', 'OTHER']).optional(),
  /** "origin" for the main server, or the host of an edge. */
  server: z.string().trim().min(1).max(200).optional(),
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

export const qualitySchema = checked(filters);
export type QualityInput = z.infer<typeof qualitySchema>;

export const failuresSchema = checked({
  ...filters,
  ...paginationSchema.shape,
  /** Only failures with this code. */
  code: z.string().regex(ERROR_CODE_PATTERN).optional(),
});
export type FailuresInput = z.infer<typeof failuresSchema>;
