// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { isPermission, normalizePermissions, PERMISSIONS } from '../auth/permissions.js';
import { isReservedRoleName, ROLE_COLORS } from './role.rules.js';

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Give the role a name of at least 2 characters')
  .max(40, 'Keep the name to 40 characters')
  .refine((name) => !isReservedRoleName(name), {
    message: 'This is the name of a built-in role. Choose another one.',
  });

const descriptionSchema = z.string().trim().max(200, 'Keep the description to 200 characters');

/**
 * A list of permissions. Unknown ones are refused by name, so a typing
 * mistake in a script does not quietly make a smaller role. Changing an area
 * includes seeing it.
 */
const permissionsSchema = z
  .array(z.string())
  .max(PERMISSIONS.length * 2)
  .superRefine((values, context) => {
    const unknown = values.filter((value) => !isPermission(value));
    if (unknown.length > 0) {
      context.addIssue({
        code: 'custom',
        message: `Unknown permissions: ${unknown.join(', ')}`,
      });
    }
  })
  .transform((values) => normalizePermissions(values))
  .refine((values) => values.length > 0, {
    message: 'Choose at least one thing this role may do',
  });

export const createRoleSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.default(''),
  color: z.enum(ROLE_COLORS).default('slate'),
  permissions: permissionsSchema,
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    color: z.enum(ROLE_COLORS).optional(),
    permissions: permissionsSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to change',
  });
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

/**
 * Where the holders of a deleted role go: a built-in role by its name, or
 * another custom role by its id. Owner is not offered: nobody becomes an
 * owner as a side effect.
 */
export const deleteRoleSchema = z.object({
  moveTo: z.union([z.enum(['ADMIN', 'EDITOR', 'VIEWER']), z.uuid()]).optional(),
});
export type DeleteRoleInput = z.infer<typeof deleteRoleSchema>;
