// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

/** The highest price of a plan, in the smallest unit of the currency. */
const MAX_AMOUNT = 100_000_000;

const amount = z
  .number()
  .int('Use the smallest unit of the currency, without a decimal point')
  .min(1, 'A price is at least 1')
  .max(MAX_AMOUNT)
  .nullable();

const oneLine = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max));

const planFields = {
  name: oneLine(80).pipe(z.string().min(1, 'Enter a name')),
  description: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .transform((value) => value || null),
  /** Short lines shown under the price. Empty lines are dropped. */
  features: z
    .array(oneLine(120))
    .max(12)
    .transform((lines) => lines.filter((line) => line !== '')),
  monthlyAmount: amount,
  yearlyAmount: amount,
  trialDays: z.number().int().min(0).max(90),
  isOffered: z.boolean(),
  isRecommended: z.boolean(),
};

const NEEDS_PRICE = {
  message: 'Set a price per month, per year, or both',
  path: ['monthlyAmount'],
};

export const createPlanSchema = z
  .object({
    name: planFields.name,
    description: planFields.description.default(null),
    features: planFields.features.default([]),
    monthlyAmount: planFields.monthlyAmount.default(null),
    yearlyAmount: planFields.yearlyAmount.default(null),
    trialDays: planFields.trialDays.default(0),
    isOffered: planFields.isOffered.default(true),
    isRecommended: planFields.isRecommended.default(false),
  })
  .refine((plan) => plan.monthlyAmount !== null || plan.yearlyAmount !== null, NEEDS_PRICE);
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = z
  .object(planFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const orderPlansSchema = z.object({
  /** Every plan, in the order they are to be shown. */
  ids: z.array(z.string().uuid()).min(1).max(100),
});
export type OrderPlansInput = z.infer<typeof orderPlansSchema>;

const note = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .transform((value) => value || null);

/** Until when access lasts. Null means until an admin ends it. */
const endsAt = z.coerce
  .date()
  .nullable()
  .refine((date) => date === null || date.getTime() > Date.now(), {
    message: 'Choose a time that is still to come',
  });

export const grantSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  endsAt,
  note: note.default(null),
});
export type GrantSubscriptionInput = z.infer<typeof grantSubscriptionSchema>;

export const changeSubscriptionSchema = z
  .object({ planId: z.string().uuid(), endsAt, note })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type ChangeSubscriptionInput = z.infer<typeof changeSubscriptionSchema>;

/** What a viewer chooses on the page of plans. */
export const startCheckoutSchema = z.object({
  planId: z.uuid(),
  interval: z.enum(['MONTH', 'YEAR']),
});
export type StartCheckoutInput = z.infer<typeof startCheckoutSchema>;

/** The payment a viewer returns from, as Stripe names it in the address. */
export const confirmCheckoutSchema = z.object({
  sessionId: z
    .string()
    .regex(/^cs_(test|live)_[A-Za-z0-9]{8,200}$/, 'This is not a payment of this site'),
});
export type ConfirmCheckoutInput = z.infer<typeof confirmCheckoutSchema>;
