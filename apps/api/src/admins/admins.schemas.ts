// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { displayNameSchema, emailSchema, newPasswordSchema } from '../auth/auth.schemas.js';

const roleSchema = z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER', 'CUSTOM']);

/** A role and, for CUSTOM, which one. The two are checked together. */
interface RoleFields {
  role?: z.infer<typeof roleSchema> | undefined;
  customRoleId?: string | undefined;
}

function checkRole(value: RoleFields, context: z.RefinementCtx): void {
  if (value.role === 'CUSTOM' && !value.customRoleId) {
    context.addIssue({
      code: 'custom',
      path: ['customRoleId'],
      message: 'Say which custom role',
    });
  }
  if (value.customRoleId && value.role !== 'CUSTOM') {
    context.addIssue({
      code: 'custom',
      path: ['role'],
      message: 'Send role CUSTOM together with customRoleId',
    });
  }
}

export const createAdminSchema = z
  .object({
    email: emailSchema,
    displayName: displayNameSchema,
    password: newPasswordSchema,
    role: roleSchema,
    /** Which role made in the panel. Needed when role is CUSTOM. */
    customRoleId: z.uuid().optional(),
  })
  .superRefine(checkRole);
export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const updateAdminSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    role: roleSchema.optional(),
    /** Which role made in the panel. Needed when role is CUSTOM. */
    customRoleId: z.uuid().optional(),
    isActive: z.boolean().optional(),
    /** Sets a new password for another admin and signs them out everywhere. */
    password: newPasswordSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to change',
  })
  .superRefine(checkRole);
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
