// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

const name = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Enter a name').max(60));

const description = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .transform((value) => value || null);

export const createPackageSchema = z.object({
  name,
  description: description.default(null),
});
export type CreatePackageInput = z.infer<typeof createPackageSchema>;

export const updatePackageSchema = z
  .object({ name, description })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;

export const orderPackagesSchema = z.object({
  /** Every package, in the order they are to be shown. */
  ids: z.array(z.uuid()).min(1).max(200),
});
export type OrderPackagesInput = z.infer<typeof orderPackagesSchema>;

/** Titles to put into a package and to take out of it, in one go. */
export const changePackageTitlesSchema = z
  .object({
    add: z.array(z.uuid()).max(500).default([]),
    remove: z.array(z.uuid()).max(500).default([]),
  })
  .refine((value) => value.add.length + value.remove.length > 0, { message: 'Nothing to change' });
export type ChangePackageTitlesInput = z.infer<typeof changePackageTitlesSchema>;
