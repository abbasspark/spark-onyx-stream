// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.js';
import { isTimeZone } from './revenue.js';

const day = z.coerce.date();

const filters = {
  source: z.enum(['MANUAL', 'STRIPE']).optional(),
  status: z.enum(['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']).optional(),
  planId: z.uuid().optional(),
  kind: z.enum(['SUBSCRIPTION', 'RENTAL', 'PURCHASE']).optional(),
  /** Matches the email address, the invoice number and the note, ignoring case. */
  q: z.string().trim().min(1).max(200).optional(),
  /** Paid at or after this moment, and before that one. */
  from: day.optional(),
  to: day.optional(),
};

export const listPaymentsSchema = paginationSchema.extend(filters);
export type ListPaymentsInput = z.infer<typeof listPaymentsSchema>;

export const exportPaymentsSchema = z.object(filters);
export type ExportPaymentsInput = z.infer<typeof exportPaymentsSchema>;
export type PaymentFilters = ExportPaymentsInput;

export const revenueSchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
  /** The time zone months are cut in, such as "Europe/Berlin". */
  timeZone: z
    .string()
    .max(64)
    .default('UTC')
    .refine(isTimeZone, 'This is not a time zone, such as Europe/Berlin'),
});
export type RevenueInput = z.infer<typeof revenueSchema>;

/** Money an admin received outside the site and writes down. */
export const recordPaymentSchema = z.object({
  amount: z
    .number()
    .int('Use the smallest unit of the currency, without a decimal point')
    .min(1, 'An amount is at least 1')
    .max(100_000_000),
  /** When it was received. Left out, now. Not in the future. */
  paidAt: day
    .refine((value) => value.getTime() <= Date.now() + 60_000, 'This day has not come yet')
    .optional(),
  /** The plan it paid for. Left out, the plan the viewer has. */
  planId: z.uuid().optional(),
  note: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((value) => value || null),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
