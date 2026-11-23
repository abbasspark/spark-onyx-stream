// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { couponCode } from '../billing/coupons.schemas.js';

const kind = z.enum(['RENT', 'BUY']);

/** What a viewer chooses on the page of a title. */
export const startPurchaseSchema = z.object({
  titleId: z.uuid(),
  kind,
  /** A coupon code of this site. */
  code: couponCode.optional(),
});
export type StartPurchaseInput = z.infer<typeof startPurchaseSchema>;

/** A title an admin gives to a viewer by hand. */
export const grantPurchaseSchema = z.object({
  titleId: z.uuid(),
  kind,
  /** What the viewer paid by hand, for the books. Left out for a gift. */
  amount: z
    .number()
    .int('Use the smallest unit of the currency, without a decimal point')
    .min(1, 'An amount is at least 1')
    .max(100_000_000)
    .nullish()
    .transform((value) => value ?? null),
  note: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((value) => value || null),
});
export type GrantPurchaseInput = z.infer<typeof grantPurchaseSchema>;
