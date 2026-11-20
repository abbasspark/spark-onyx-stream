// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

/** libx264 presets, from fastest with the largest files to slowest with the smallest. */
export const ENCODER_PRESETS = [
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
] as const;

const renditionSchema = z.object({
  /** Used as a folder name and shown in players, for example "720p". */
  name: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,32}$/, 'Use up to 32 letters, digits, dashes or underscores'),
  height: z
    .number()
    .int()
    .min(144)
    .max(4320)
    .refine((value) => value % 2 === 0, 'The height must be an even number'),
  /** Bits per second. */
  videoBitrate: z.number().int().min(100_000).max(50_000_000),
  /** Bits per second. */
  audioBitrate: z.number().int().min(32_000).max(512_000),
  preset: z.enum(ENCODER_PRESETS).default('medium'),
});

const renditionsSchema = z
  .array(renditionSchema)
  .min(1, 'Add at least one quality')
  .max(8, 'A profile can have at most 8 qualities')
  .refine(
    (renditions) => new Set(renditions.map((r) => r.name)).size === renditions.length,
    'Quality names must differ',
  )
  .refine(
    (renditions) => new Set(renditions.map((r) => r.height)).size === renditions.length,
    'Each quality needs its own height',
  );

const nameSchema = z.string().trim().min(1, 'Enter a name').max(64);
const segmentSecondsSchema = z.number().int().min(2).max(10);
const keyframeSecondsSchema = z.number().int().min(1).max(10);

const KEYFRAME_MESSAGE = 'The keyframe interval must divide the segment length evenly';

export const createEncodingProfileSchema = z
  .object({
    name: nameSchema,
    description: z.string().trim().max(500).optional(),
    isDefault: z.boolean().default(false),
    segmentSeconds: segmentSecondsSchema.default(4),
    keyframeSeconds: keyframeSecondsSchema.default(2),
    renditions: renditionsSchema,
  })
  .refine((value) => value.segmentSeconds % value.keyframeSeconds === 0, {
    message: KEYFRAME_MESSAGE,
    path: ['keyframeSeconds'],
  });
export type CreateEncodingProfileInput = z.infer<typeof createEncodingProfileSchema>;

export const updateEncodingProfileSchema = z
  .object({
    name: nameSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    /** Only true is accepted: a profile stops being the default when another one is made default. */
    isDefault: z
      .literal(true, 'To change the default, set isDefault to true on another profile')
      .optional(),
    segmentSeconds: segmentSecondsSchema.optional(),
    keyframeSeconds: keyframeSecondsSchema.optional(),
    /** Replaces the whole list of qualities. */
    renditions: renditionsSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to change',
  });
export type UpdateEncodingProfileInput = z.infer<typeof updateEncodingProfileSchema>;

export { KEYFRAME_MESSAGE };
