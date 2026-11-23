// SPDX-License-Identifier: AGPL-3.0-only
//
// Coupon codes: what a code does to a price, asked of the site before paying.
import { formatMoney } from './plans';
import { call } from './viewer-api';

/** A price with and without a code, in the smallest unit of the currency. */
export interface CouponPrice {
  listAmount: number;
  discountAmount: number;
  finalAmount: number;
}

interface CouponTerms {
  code: string;
  kind: 'PERCENT' | 'AMOUNT';
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
}

/** What a code does to one plan or one title. */
export interface CouponQuote extends CouponTerms, CouponPrice {
  /** For a plan: for how long the price stays lower. Null for a title. */
  duration: 'ONCE' | 'REPEATING' | 'FOREVER' | null;
  durationMonths: number | null;
  lasts: string | null;
}

/** What a code does to the plans on offer. */
export interface CouponPlansQuote extends CouponTerms {
  duration: 'ONCE' | 'REPEATING' | 'FOREVER';
  durationMonths: number | null;
  lasts: string;
  plans: { planId: string; month: CouponPrice | null; year: CouponPrice | null }[];
}

export const couponsApi = {
  forPlans: (code: string) =>
    call<CouponPlansQuote>('POST', '/coupons/check', { code, plans: true }),
  forTitle: (code: string, titleId: string, kind: 'RENT' | 'BUY') =>
    call<CouponQuote>('POST', '/coupons/check', { code, titleId, kind }),
};

/** "20% off" or "€5 off". */
export function describeOff(terms: CouponTerms): string {
  return terms.kind === 'PERCENT'
    ? `${terms.percentOff ?? 0}% off`
    : `${formatMoney(terms.amountOff ?? 0, terms.currency)} off`;
}

/** What a code gives on a plan, in one line: "20% off for the first 3 months". */
export function describePlanCoupon(quote: CouponPlansQuote): string {
  return `${describeOff(quote)} ${quote.lasts}`;
}

/**
 * What a viewer pays once the code has run out, when it does: "then €7.99 a
 * month". Null for a code that lasts as long as the subscription.
 */
export function describeAfterwards(
  quote: Pick<CouponPlansQuote, 'duration' | 'durationMonths' | 'currency'>,
  price: CouponPrice,
  interval: 'month' | 'year',
): string | null {
  if (quote.duration === 'FOREVER' || price.discountAmount === 0) {
    return null;
  }
  const list = formatMoney(price.listAmount, quote.currency);
  // A year paid at once is one payment: a code for a few months covers it once.
  if (quote.duration === 'ONCE' || interval === 'year') {
    return `then ${list} a ${interval}`;
  }
  const months = quote.durationMonths ?? 1;
  return months === 1 ? `then ${list} a month` : `${list} a month after ${months} months`;
}

/** The price of a plan under a code, for the way of paying that is chosen. */
export function planPrice(
  quote: CouponPlansQuote | null,
  planId: string,
  interval: 'month' | 'year',
): CouponPrice | null {
  return quote?.plans.find((plan) => plan.planId === planId)?.[interval] ?? null;
}

/** A code as it is sent: capitals, no spaces around it. Empty when there is nothing to send. */
export function tidyCode(raw: string): string {
  return raw.trim().toUpperCase();
}
