// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254));

export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`);

export const displayNameSchema = z.string().trim().min(1, 'Enter a name').max(100);

export const loginSchema = z.object({
  email: emailSchema,
  // No length rule on login: the rule may have changed since the password was set.
  password: z.string().min(1, 'Enter your password').max(MAX_PASSWORD_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const setupSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: newPasswordSchema,
});
export type SetupInput = z.infer<typeof setupSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: newPasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
