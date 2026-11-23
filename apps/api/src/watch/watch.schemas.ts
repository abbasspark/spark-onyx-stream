// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.js';
import { localConfigSchema, s3ConfigInputSchema } from '../storage/storage-pool.config.js';

export const WATCHED_FILE_STATES = [
  'WAITING',
  'UNRECOGNISED',
  'QUEUED',
  'IMPORTING',
  'IMPORTED',
  'CONFLICT',
  'FAILED',
  'IGNORED',
] as const;
export const AFTER_IMPORT = ['MOVE', 'KEEP', 'DELETE'] as const;
const PROCESSING_MODES = ['COPY', 'TRANSCODE', 'PASSTHROUGH'] as const;

const name = z.string().trim().min(1, 'Enter a name').max(64);

const settings = {
  name,
  isActive: z.boolean(),
  /** From every minute to once a day. */
  scanIntervalMinutes: z.number().int().min(1).max(1440),
  /** Where imported videos are stored. Null: the default pool. */
  storagePoolId: z.uuid().nullable(),
  /** How imported videos are processed. Null: decided per video, as for an upload. */
  processingMode: z.enum(PROCESSING_MODES).nullable(),
  encodingProfileId: z.uuid().nullable(),
  autoPublish: z.boolean(),
  afterImport: z.enum(AFTER_IMPORT),
};

const optionalSettings = {
  isActive: settings.isActive.default(true),
  scanIntervalMinutes: settings.scanIntervalMinutes.default(5),
  storagePoolId: settings.storagePoolId.default(null),
  processingMode: settings.processingMode.default(null),
  encodingProfileId: settings.encodingProfileId.default(null),
  autoPublish: settings.autoPublish.default(false),
  afterImport: settings.afterImport.default('MOVE'),
};

/** Where a location is: a folder on the server, or a bucket. */
export const locationPlaceSchema = z.discriminatedUnion('driver', [
  z.object({ driver: z.literal('LOCAL'), config: localConfigSchema }),
  z.object({ driver: z.literal('S3'), config: s3ConfigInputSchema }),
]);
export type LocationPlace = z.infer<typeof locationPlaceSchema>;

export const createLocationSchema = z.discriminatedUnion('driver', [
  z.object({ name, ...optionalSettings, driver: z.literal('LOCAL'), config: localConfigSchema }),
  z.object({ name, ...optionalSettings, driver: z.literal('S3'), config: s3ConfigInputSchema }),
]);
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = z
  .object({
    ...settings,
    /** Settings of the place to change. Checked against the kind of the location. */
    config: z.record(z.string(), z.unknown()),
  })
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to change',
  });
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const listFilesSchema = paginationSchema.extend({
  locationId: z.uuid().optional(),
  state: z.enum(WATCHED_FILE_STATES).optional(),
  /** Matches the path, ignoring case. */
  q: z.string().trim().min(1).max(200).optional(),
});
export type ListFilesInput = z.infer<typeof listFilesSchema>;

/** What a file is, said by an admin. A season and an episode make it an episode. */
export const matchFileSchema = z
  .object({
    kind: z.enum(['MOVIE', 'SERIES']),
    /** The id of the movie or the series at TMDB. */
    tmdbId: z.number().int().min(1).max(999_999_999),
    seasonNumber: z.number().int().min(0).max(999).optional(),
    episodeNumber: z.number().int().min(1).max(9999).optional(),
  })
  .refine(
    (value) =>
      value.kind === 'MOVIE'
        ? value.seasonNumber === undefined && value.episodeNumber === undefined
        : value.seasonNumber !== undefined && value.episodeNumber !== undefined,
    'An episode needs its season and its number, and a movie has neither',
  );
export type MatchFileInput = z.infer<typeof matchFileSchema>;

export const retryFileSchema = z.object({
  /** Lets the file take the place of the video the title or episode has. */
  replace: z.boolean().default(false),
});
export type RetryFileInput = z.infer<typeof retryFileSchema>;

export const retryAllSchema = z.object({ locationId: z.uuid().optional() });
export type RetryAllInput = z.infer<typeof retryAllSchema>;
