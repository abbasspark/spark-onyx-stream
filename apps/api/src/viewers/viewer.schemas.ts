// SPDX-License-Identifier: AGPL-3.0-only
import { normalizeLanguage } from '../catalog/language.js';
import { z } from 'zod';
import { displayNameSchema, emailSchema, MAX_PASSWORD_LENGTH } from '../auth/auth.schemas.js';
import { paginationSchema } from '../common/pagination.js';
import { MAX_PROFILE_AGE } from '../catalog/age-rating.js';
import { deviceInfoSchema } from './device.schemas.js';

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
  /** Sent by apps, so the sign-in is known as that device. Browsers leave it out. */
  device: deviceInfoSchema.optional(),
});
export type RegisterViewerInput = z.infer<typeof registerViewerSchema>;

export const loginViewerSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(MAX_PASSWORD_LENGTH),
  /** Sent by apps, so the sign-in is known as that device. Browsers leave it out. */
  device: deviceInfoSchema.optional(),
});
export type LoginViewerInput = z.infer<typeof loginViewerSchema>;

export const updateOwnViewerSchema = z.object({ displayName: displayNameSchema });
export type UpdateOwnViewerInput = z.infer<typeof updateOwnViewerSchema>;

export const changeViewerPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: viewerPasswordSchema,
});
export type ChangeViewerPasswordInput = z.infer<typeof changeViewerPasswordSchema>;

/** Kept in step with PROFILE_COLORS of the profiles service. */
const profileColorSchema = z.enum([
  'amber',
  'coral',
  'rose',
  'violet',
  'blue',
  'teal',
  'green',
  'slate',
]);
const profileNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Enter a name').max(40, 'Use at most 40 characters'));

/** The highest age a title may be for and still show. Null: no limit. */
const maxAgeSchema = z.number().int().min(0).max(MAX_PROFILE_AGE).nullable();
/**
 * A language a profile likes, as a tag such as "de" or "pt-BR". Null: none.
 * For sound that means each video in its own default, for subtitles "off".
 */
const preferredLanguageSchema = z
  .string()
  .max(20)
  .transform((value, context) => {
    const tag = normalizeLanguage(value);
    if (!tag) {
      context.addIssue({ code: 'custom', message: 'Write the language as a tag such as "de"' });
      return z.NEVER;
    }
    return tag;
  })
  .nullable();

/** Four to six digits. */
const pinSchema = z.string().regex(/^\d{4,6}$/, 'A PIN is four to six digits');

export const createProfileSchema = z.object({
  name: profileNameSchema,
  /** Left out, the profile gets a colour no other profile of the account has. */
  color: profileColorSchema.optional(),
  /** A profile for a child. Without a limit of its own it gets the one for children. */
  isKids: z.boolean().optional(),
  maxAge: maxAgeSchema.optional(),
  audioLanguage: preferredLanguageSchema.optional(),
  subtitleLanguage: preferredLanguageSchema.optional(),
});
export type CreateProfileInput = z.infer<typeof createProfileSchema>;

export const updateProfileSchema = z
  .object({
    name: profileNameSchema,
    color: profileColorSchema,
    isKids: z.boolean(),
    maxAge: maxAgeSchema,
    audioLanguage: preferredLanguageSchema,
    subtitleLanguage: preferredLanguageSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** The languages the profile in use likes to hear and to read. */
export const updatePreferencesSchema = z
  .object({ audioLanguage: preferredLanguageSchema, subtitleLanguage: preferredLanguageSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const selectProfileSchema = z.preprocess(
  // Apps from before PINs send nothing at all.
  (body) => body ?? {},
  z.object({
    /** Needed for a profile that has one. */
    pin: z.string().max(12).optional(),
  }),
);
export type SelectProfileInput = z.infer<typeof selectProfileSchema>;

export const setProfilePinSchema = z.object({
  /** The new PIN. Null takes the PIN off. */
  pin: pinSchema.nullable(),
  /** The password of the account: a PIN is set and lifted by whoever owns the account. */
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});
export type SetProfilePinInput = z.infer<typeof setProfilePinSchema>;

export const forgotViewerPasswordSchema = z.object({ email: emailSchema });
export type ForgotViewerPasswordInput = z.infer<typeof forgotViewerPasswordSchema>;

/** The token of a link from an email. */
const mailTokenSchema = z.string().min(20, 'This link is incomplete').max(200);

export const resetViewerPasswordByMailSchema = z.object({
  token: mailTokenSchema,
  newPassword: viewerPasswordSchema,
});
export type ResetViewerPasswordByMailInput = z.infer<typeof resetViewerPasswordByMailSchema>;

export const verifyViewerEmailSchema = z.object({ token: mailTokenSchema });
export type VerifyViewerEmailInput = z.infer<typeof verifyViewerEmailSchema>;

export const deleteOwnViewerSchema = z.object({
  password: z.string().min(1, 'Enter your password').max(MAX_PASSWORD_LENGTH),
});
export type DeleteOwnViewerInput = z.infer<typeof deleteOwnViewerSchema>;

// --- For admins --------------------------------------------------------------

export const VIEWER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export const VIEWER_SORT_FIELDS = ['createdAt', 'lastLoginAt', 'email', 'displayName'] as const;

export const listViewersSchema = paginationSchema.extend({
  status: z.enum(VIEWER_STATUSES).optional(),
  /** "yes": only viewers with a running subscription. "no": only those without. */
  subscribed: z.enum(['yes', 'no']).optional(),
  /** Matches the email address and the name, ignoring case. */
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(VIEWER_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListViewersInput = z.infer<typeof listViewersSchema>;

export const createViewerSchema = registerViewerSchema.extend({
  /** Whether the admin vouches for the address. Otherwise the viewer confirms it by email. */
  emailVerified: z.boolean().default(true),
});
export type CreateViewerInput = z.infer<typeof createViewerSchema>;

export const updateViewerSchema = z
  .object({
    email: emailSchema,
    displayName: displayNameSchema,
    status: z.enum(VIEWER_STATUSES),
    /** Marks the address as confirmed, or as not confirmed. */
    emailVerified: z.boolean(),
    /**
     * Devices this account plays on at the same time, whatever its plan says.
     * Null: the limit of the plan or the installation.
     */
    maxStreams: z.number().int().min(1).max(20).nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change');
export type UpdateViewerInput = z.infer<typeof updateViewerSchema>;

export const resetViewerPasswordSchema = z.object({ newPassword: viewerPasswordSchema });
export type ResetViewerPasswordInput = z.infer<typeof resetViewerPasswordSchema>;
