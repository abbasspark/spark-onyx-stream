// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { NON_DELEGABLE_PERMISSIONS, PERMISSIONS } from '../auth/permissions.js';

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(100),
  scopes: z
    .array(z.enum(PERMISSIONS))
    .min(1, 'Choose at least one scope')
    .refine((scopes) => new Set(scopes).size === scopes.length, 'Scopes must not repeat')
    .refine(
      (scopes) => scopes.every((scope) => !NON_DELEGABLE_PERMISSIONS.includes(scope)),
      `These scopes cannot be given to an API key: ${NON_DELEGABLE_PERMISSIONS.join(', ')}`,
    ),
  expiresAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .refine((date) => date.getTime() > Date.now(), 'The expiry time must be in the future')
    .optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
