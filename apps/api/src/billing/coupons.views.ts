// SPDX-License-Identifier: AGPL-3.0-only
import type { PaymentKind } from '@onyx/database';
import type { CouponState } from './coupon-rules.js';

/** A coupon as the panel shows it. */
export interface CouponView {
  id: string;
  code: string;
  note: string | null;
  kind: 'PERCENT' | 'AMOUNT';
  percentOff: number | null;
  amountOff: number | null;
  scope: 'EVERYTHING' | 'SUBSCRIPTIONS' | 'TITLES';
  duration: 'ONCE' | 'REPEATING' | 'FOREVER';
  durationMonths: number | null;
  /** The plans it is for. Empty: every plan. */
  plans: { id: string; name: string }[];
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  oncePerViewer: boolean;
  newCustomersOnly: boolean;
  isActive: boolean;
  /** Where it stands now: its switch, its dates and its uses taken together. */
  state: CouponState;
  /** How often it was used, and what it took off first payments in all. */
  used: number;
  discountTotal: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One use of a coupon. */
export interface RedemptionView {
  id: string;
  viewer: { id: string | null; email: string };
  kind: PaymentKind;
  /** The plan or the title, as it was called then. */
  subject: string;
  listAmount: number;
  discountAmount: number;
  currency: string;
  createdAt: Date;
}

/** A price with and without a code. */
export interface CouponPrice {
  listAmount: number;
  discountAmount: number;
  finalAmount: number;
}

/** What a code does to the plans on offer, for the page of plans. */
export interface CouponPlansQuote {
  code: string;
  kind: 'PERCENT' | 'AMOUNT';
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
  duration: 'ONCE' | 'REPEATING' | 'FOREVER';
  durationMonths: number | null;
  lasts: string;
  /** Per plan and way to pay. Null where the code does not apply or the plan is not sold that way. */
  plans: { planId: string; month: CouponPrice | null; year: CouponPrice | null }[];
}

/** What a code does to a price, as a viewer is told before paying. */
export interface CouponQuote {
  code: string;
  kind: 'PERCENT' | 'AMOUNT';
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
  listAmount: number;
  discountAmount: number;
  /** What the first payment is over. 0: nothing is charged. */
  finalAmount: number;
  /** For a plan: for how long the price stays lower. Null for a title. */
  duration: 'ONCE' | 'REPEATING' | 'FOREVER' | null;
  durationMonths: number | null;
  /** The same in words: "on the first payment", "for the first 3 months". */
  lasts: string | null;
}
