// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { localConfigSchema, s3ConfigInputSchema } from './storage-pool.config.js';

const nameSchema = z.string().trim().min(1, 'Enter a name').max(64);

/**
 * Byte counts can exceed what a JSON number holds exactly, so they are
 * accepted as an integer or a string of digits and handled as BigInt.
 */
const quotaBytesSchema = z
  .union([
    z.number().int().positive(),
    z.string().regex(/^[1-9]\d*$/, 'Enter a whole number of bytes'),
  ])
  .transform((value) => BigInt(value));

const sharedCreateShape = {
  name: nameSchema,
  isDefault: z.boolean().default(false),
  /** Leave out for no limit. */
  quotaBytes: quotaBytesSchema.optional(),
};

export const createStoragePoolSchema = z.discriminatedUnion('driver', [
  z.object({ ...sharedCreateShape, driver: z.literal('LOCAL'), config: localConfigSchema }),
  z.object({ ...sharedCreateShape, driver: z.literal('S3'), config: s3ConfigInputSchema }),
]);
export type CreateStoragePoolInput = z.infer<typeof createStoragePoolSchema>;

export const updateStoragePoolSchema = z
  .object({
    name: nameSchema.optional(),
    isActive: z.boolean().optional(),
    /** Only true is accepted: a pool stops being the default when another one is made default. */
    isDefault: z
      .literal(true, 'To change the default, set isDefault to true on another pool')
      .optional(),
    /** null removes the limit. */
    quotaBytes: quotaBytesSchema.nullable().optional(),
    /** Driver settings to change. Validated against the pool's driver. */
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to change',
  });
export type UpdateStoragePoolInput = z.infer<typeof updateStoragePoolSchema>;
