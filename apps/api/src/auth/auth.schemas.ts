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

/** Six digits from an app, or a recovery code. Both are short. */
const secondFactorCode = z.string().trim().min(1, 'Enter the code').max(40);
const currentPassword = z.string().min(1, 'Enter your password').max(MAX_PASSWORD_LENGTH);

/** Starting to set up two-factor sign-in. */
export const twoFactorBeginSchema = z.object({ password: currentPassword });
export type TwoFactorBeginInput = z.infer<typeof twoFactorBeginSchema>;

/** The first code from the app, which switches it on. */
export const twoFactorConfirmSchema = z.object({ code: secondFactorCode });
export type TwoFactorConfirmInput = z.infer<typeof twoFactorConfirmSchema>;

/** Switching it off, or making new recovery codes. */
export const twoFactorProveSchema = z.object({ password: currentPassword, code: secondFactorCode });
export type TwoFactorProveInput = z.infer<typeof twoFactorProveSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // No length rule on login: the rule may have changed since the password was set.
  password: z.string().min(1, 'Enter your password').max(MAX_PASSWORD_LENGTH),
  /** For an admin with two-factor sign-in: a code from the app, or a recovery code. */
  code: secondFactorCode.optional(),
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
