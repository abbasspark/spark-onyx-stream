// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { displayNameSchema, emailSchema, MAX_PASSWORD_LENGTH } from '../auth/auth.schemas.js';
import { paginationSchema } from '../common/pagination.js';

/** Shorter than for admins: a viewer protects their own account, not the installation. */
export const MIN_VIEWER_PASSWORD_LENGTH = 8;

export const viewerPasswordSchema = z
  .string()
  .min(
    MIN_VIEWER_PASSWORD_LENGTH,
    `Password must be at least ${MIN_VIEWER_PASSWORD_LENGTH} characters`,
  )
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`);

export const registerViewerSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: viewerPasswordSchema,
});
export type RegisterViewerInput = z.infer<typeof registerViewerSchema>;

export const loginViewerSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(MAX_PASSWORD_LENGTH),
});
export type LoginViewerInput = z.infer<typeof loginViewerSchema>;

export const updateOwnViewerSchema = z.object({ displayName: displayNameSchema });
export type UpdateOwnViewerInput = z.infer<typeof updateOwnViewerSchema>;

export const changeViewerPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: viewerPasswordSchema,
});
export type ChangeViewerPasswordInput = z.infer<typeof changeViewerPasswordSchema>;

export const deleteOwnViewerSchema = z.object({
  password: z.string().min(1, 'Enter your password').max(MAX_PASSWORD_LENGTH),
});
export type DeleteOwnViewerInput = z.infer<typeof deleteOwnViewerSchema>;

// --- For admins --------------------------------------------------------------

export const VIEWER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export const VIEWER_SORT_FIELDS = ['createdAt', 'lastLoginAt', 'email', 'displayName'] as const;

export const listViewersSchema = paginationSchema.extend({
  status: z.enum(VIEWER_STATUSES).optional(),
  /** Matches the email address and the name, ignoring case. */
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(VIEWER_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListViewersInput = z.infer<typeof listViewersSchema>;

export const createViewerSchema = registerViewerSchema;
export type CreateViewerInput = z.infer<typeof createViewerSchema>;

export const updateViewerSchema = z
  .object({
    email: emailSchema,
    displayName: displayNameSchema,
    status: z.enum(VIEWER_STATUSES),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change');
export type UpdateViewerInput = z.infer<typeof updateViewerSchema>;

export const resetViewerPasswordSchema = z.object({ newPassword: viewerPasswordSchema });
export type ResetViewerPasswordInput = z.infer<typeof resetViewerPasswordSchema>;
