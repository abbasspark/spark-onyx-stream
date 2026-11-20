// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { displayNameSchema, emailSchema, newPasswordSchema } from '../auth/auth.schemas.js';

const roleSchema = z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']);

export const createAdminSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: newPasswordSchema,
  role: roleSchema,
});
export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const updateAdminSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
    /** Sets a new password for another admin and signs them out everywhere. */
    password: newPasswordSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to change',
  });
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
