// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { AD_EVENTS, isWebAddress } from './ad-rules.js';

const address = (label: string) =>
  z
    .string()
    .trim()
    .max(2000)
    .refine(isWebAddress, `${label} must be a web address starting with https://`);

export const saveAdSettingsSchema = z.object({
  enabled: z.boolean(),
  preRoll: z.boolean(),
  postRoll: z.boolean(),
  midRollEveryMinutes: z.number().int().min(0).max(120),
  minDurationMinutes: z.number().int().min(0).max(240),
});
export type SaveAdSettingsInput = z.infer<typeof saveAdSettingsSchema>;

const baseSource = {
  name: z.string().trim().min(1).max(120),
  weight: z.number().int().min(1).max(100).default(1),
  isActive: z.boolean().default(true),
};

export const createAdSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    ...baseSource,
    kind: z.literal('VAST_TAG'),
    vastUrl: address('The VAST tag'),
  }),
  z.object({
    ...baseSource,
    kind: z.literal('HOUSE'),
    assetId: z.uuid(),
    clickUrl: address('The link').nullish().default(null),
    skipAfterSeconds: z.number().int().min(0).max(60).nullish().default(null),
  }),
]);
export type CreateAdSourceInput = z.infer<typeof createAdSourceSchema>;

export const updateAdSourceSchema = z
  .object({
    name: baseSource.name.optional(),
    weight: z.number().int().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
    vastUrl: address('The VAST tag').optional(),
    assetId: z.uuid().optional(),
    clickUrl: address('The link').nullable().optional(),
    skipAfterSeconds: z.number().int().min(0).max(60).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to change',
  });
export type UpdateAdSourceInput = z.infer<typeof updateAdSourceSchema>;

export const adReportQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type AdReportQuery = z.infer<typeof adReportQuerySchema>;

/** What a player reports about an ad it played. */
export const adEventSchema = z.object({
  sourceId: z.uuid(),
  event: z.enum(AD_EVENTS),
});
export type AdEventInput = z.infer<typeof adEventSchema>;

/** Which source a player asks an ad of. */
export const adResolveSchema = z.object({ sourceId: z.uuid() });
export type AdResolveInput = z.infer<typeof adResolveSchema>;
