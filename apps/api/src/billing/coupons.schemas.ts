// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.js';
import { normalizeCode } from './coupon-rules.js';

/** Capital letters, digits and hyphens: easy to read out and to type. */
export const couponCode = z
  .string()
  .transform(normalizeCode)
  .pipe(
    z
      .string()
      .min(3, 'A code has at least 3 characters')
      .max(40, 'A code has at most 40 characters')
      .regex(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, 'Use letters, digits and single hyphens between them'),
  );

const moment = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .nullable();

const fields = {
  code: couponCode,
  note: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .transform((value) => value || null),
  kind: z.enum(['PERCENT', 'AMOUNT']),
  percentOff: z.number().int().min(1).max(100).nullable(),
  amountOff: z
    .number()
    .int('Use the smallest unit of the currency, without a decimal point')
    .min(1)
    .max(100_000_000)
    .nullable(),
  scope: z.enum(['EVERYTHING', 'SUBSCRIPTIONS', 'TITLES']),
  duration: z.enum(['ONCE', 'REPEATING', 'FOREVER']),
  durationMonths: z.number().int().min(1).max(36).nullable(),
  /** The plans the code is for. Empty: every plan. */
  planIds: z.array(z.uuid()).max(50),
  startsAt: moment,
  endsAt: moment,
  maxRedemptions: z.number().int().min(1).max(10_000_000).nullable(),
  oncePerViewer: z.boolean(),
  newCustomersOnly: z.boolean(),
  isActive: z.boolean(),
};

export const createCouponSchema = z.object({
  code: fields.code,
  kind: fields.kind,
  ...z.object(fields).omit({ code: true, kind: true }).partial().shape,
});
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

export const updateCouponSchema = z
  .object(fields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

export const listRedemptionsSchema = paginationSchema;
export type ListRedemptionsInput = z.infer<typeof listRedemptionsSchema>;

/** What a viewer wants to pay for with a code: a plan, a title, or whichever plan it fits. */
export const checkCouponSchema = z.union([
  z.object({ code: couponCode, planId: z.uuid(), interval: z.enum(['MONTH', 'YEAR']) }),
  z.object({ code: couponCode, titleId: z.uuid(), kind: z.enum(['RENT', 'BUY']) }),
  /** Every plan on offer, for the page of plans. */
  z.object({ code: couponCode, plans: z.literal(true) }),
]);
export type CheckCouponInput = z.infer<typeof checkCouponSchema>;
