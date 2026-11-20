// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.js';

const titleSchema = z.string().trim().min(1, 'Enter a title').max(200);

export const ASSET_STATUSES = [
  'UPLOADING',
  'UPLOADED',
  'PROCESSING',
  'READY',
  'FAILED',
  'DELETED',
] as const;

export const createAssetSchema = z.object({
  title: titleSchema,
  /** Pool to store the asset in. Defaults to the default pool. */
  storagePoolId: z.uuid().optional(),
  /** Forces a processing mode. Left out, the mode is chosen after probing. */
  processingMode: z.enum(['COPY', 'TRANSCODE', 'PASSTHROUGH']).optional(),
  p2pEnabled: z.boolean().optional(),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const updateAssetSchema = z
  .object({
    title: titleSchema.optional(),
    p2pEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to change',
  });
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;

export const reprocessAssetSchema = z
  .object({
    processingMode: z.enum(['COPY', 'TRANSCODE', 'PASSTHROUGH']).optional(),
    encodingProfileId: z.uuid().optional(),
  })
  // A request without a body means "choose again".
  .default({});
export type ReprocessAssetInput = z.infer<typeof reprocessAssetSchema>;

export const listAssetsSchema = paginationSchema.extend({
  /** Left out, deleted assets are hidden. */
  status: z.enum(ASSET_STATUSES).optional(),
  /** Matches part of the title, ignoring case. */
  q: z.string().trim().min(1).max(200).optional(),
});
export type ListAssetsInput = z.infer<typeof listAssetsSchema>;
