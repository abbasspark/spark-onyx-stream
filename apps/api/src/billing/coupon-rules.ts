// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';

/**
 * The least a card payment can be over, in the smallest unit of the currency.
 * Stripe refuses smaller sums in most currencies, so a code may make
 * something free, and may not leave a few cents to pay.
 */
export const MIN_CHARGE = 50;

/** What of a coupon the rules look at. */
export interface CouponTerms {
  id: string;
  kind: 'PERCENT' | 'AMOUNT';
  percentOff: number | null;
  amountOff: number | null;
  scope: 'EVERYTHING' | 'SUBSCRIPTIONS' | 'TITLES';
  duration: 'ONCE' | 'REPEATING' | 'FOREVER';
  durationMonths: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  isActive: boolean;
}

export type CouponState = 'ACTIVE' | 'SCHEDULED' | 'ENDED' | 'USED_UP' | 'OFF';

/** A code as it is stored and compared: without spaces around it, in capitals. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Where a coupon stands at a moment. Switched off wins over everything, then
 * its dates, then the number of uses.
 */
export function couponState(
  coupon: Pick<CouponTerms, 'isActive' | 'startsAt' | 'endsAt' | 'maxRedemptions'>,
  used: number,
  now: Date,
): CouponState {
  if (!coupon.isActive) {
    return 'OFF';
  }
  if (coupon.endsAt && coupon.endsAt <= now) {
    return 'ENDED';
  }
  if (coupon.maxRedemptions !== null && used >= coupon.maxRedemptions) {
    return 'USED_UP';
  }
  if (coupon.startsAt && coupon.startsAt > now) {
    return 'SCHEDULED';
  }
  return 'ACTIVE';
}

/**
 * What a coupon takes off a price. Never more than the price, and a share is
 * rounded to the smallest unit in favour of the viewer.
 */
export function discountFor(
  coupon: Pick<CouponTerms, 'kind' | 'percentOff' | 'amountOff'>,
  listAmount: number,
): number {
  const off =
    coupon.kind === 'PERCENT'
      ? Math.ceil((listAmount * (coupon.percentOff ?? 0)) / 100)
      : (coupon.amountOff ?? 0);
  return Math.max(0, Math.min(listAmount, off));
}

/** Whether a coupon is for a kind of thing that is paid for. */
export function coversKind(
  scope: CouponTerms['scope'],
  kind: 'SUBSCRIPTION' | 'RENTAL' | 'PURCHASE',
): boolean {
  return (
    scope === 'EVERYTHING' ||
    (scope === 'SUBSCRIPTIONS' ? kind === 'SUBSCRIPTION' : kind !== 'SUBSCRIPTION')
  );
}

/**
 * The id of the coupon at Stripe that stands for these terms. Stripe does not
 * let the terms of a coupon be changed, so the id names them: a coupon that is
 * changed here gets a new one there, and running subscriptions keep theirs.
 */
export function stripeCouponId(
  coupon: Pick<
    CouponTerms,
    'id' | 'kind' | 'percentOff' | 'amountOff' | 'duration' | 'durationMonths'
  >,
  currency: string,
  /** A single payment has no duration: the code counts once. */
  recurring: boolean,
): string {
  const terms = [
    coupon.kind,
    coupon.kind === 'PERCENT' ? coupon.percentOff : `${coupon.amountOff}${currency.toLowerCase()}`,
    recurring ? coupon.duration : 'ONCE',
    recurring && coupon.duration === 'REPEATING' ? coupon.durationMonths : '',
  ].join(':');
  const mark = createHash('sha256').update(terms).digest('hex').slice(0, 10);
  return `onyx_c_${coupon.id.replace(/-/g, '')}_${mark}`;
}

/** "20 % off", "5.00 off" without the currency: the caller knows how money is written. */
export function describeDuration(coupon: Pick<CouponTerms, 'duration' | 'durationMonths'>): string {
  if (coupon.duration === 'FOREVER') {
    return 'on every payment';
  }
  if (coupon.duration === 'REPEATING') {
    const months = coupon.durationMonths ?? 1;
    return months === 1 ? 'for the first month' : `for the first ${months} months`;
  }
  return 'on the first payment';
}
