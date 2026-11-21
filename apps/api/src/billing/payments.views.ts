// SPDX-License-Identifier: AGPL-3.0-only
import type { Payment, PaymentStatus, SubscriptionSource } from '@onyx/database';

/** A payment as the viewer who made it sees it. */
export interface ViewerPaymentView {
  id: string;
  planName: string | null;
  status: PaymentStatus;
  amount: number;
  refundedAmount: number;
  currency: string;
  paidAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  invoiceNumber: string | null;
  /** Where the invoice can be read and downloaded. Null when there is none. */
  invoiceUrl: string | null;
}

export function toViewerPaymentView(payment: Payment): ViewerPaymentView {
  return {
    id: payment.id,
    planName: payment.planName,
    status: payment.status,
    amount: payment.amount,
    refundedAmount: payment.refundedAmount,
    currency: payment.currency,
    paidAt: payment.paidAt,
    periodStart: payment.periodStart,
    periodEnd: payment.periodEnd,
    invoiceNumber: payment.invoiceNumber,
    invoiceUrl: payment.invoiceUrl,
  };
}

/** A payment as admins see it. */
export interface PaymentAdminView extends ViewerPaymentView {
  /** Null once the account is deleted. The email address stays. */
  viewer: { id: string; displayName: string } | null;
  viewerEmail: string;
  planId: string | null;
  /** MANUAL: written down by an admin. STRIPE: collected online. */
  source: SubscriptionSource;
  taxAmount: number;
  /** What stays after refunds. */
  netAmount: number;
  note: string | null;
  recordedBy: { id: string; displayName: string } | null;
  /** Where to open it at Stripe. Null for one written down by hand. */
  externalUrl: string | null;
  createdAt: Date;
}

export type PaymentForAdmin = Payment & {
  viewer: { id: string; displayName: string } | null;
  recordedBy: { id: string; displayName: string } | null;
};

export function toPaymentAdminView(payment: PaymentForAdmin, livemode: boolean): PaymentAdminView {
  return {
    ...toViewerPaymentView(payment),
    viewer: payment.viewer,
    viewerEmail: payment.viewerEmail,
    planId: payment.planId,
    source: payment.source,
    taxAmount: payment.taxAmount,
    netAmount: payment.amount - payment.refundedAmount,
    note: payment.note,
    recordedBy: payment.recordedBy,
    externalUrl:
      payment.source === 'STRIPE' && payment.externalId
        ? `https://dashboard.stripe.com/${livemode ? '' : 'test/'}invoices/${encodeURIComponent(payment.externalId)}`
        : null,
    createdAt: payment.createdAt,
  };
}

/** The money of one month. */
export interface RevenueMonth {
  /** "2026-11", in the time zone asked for. */
  month: string;
  /** What was paid, before refunds. */
  gross: number;
  /** What was returned of the payments of this month. */
  refunded: number;
  /** gross less refunded. */
  net: number;
  /** The tax in it, where the provider worked it out. */
  tax: number;
  payments: number;
  /** Of net: collected online, and written down by an admin. */
  online: number;
  byHand: number;
  /** Subscriptions paid online that started, and that ended. */
  started: number;
  ended: number;
}

export interface RevenueByPlan {
  planId: string | null;
  planName: string;
  net: number;
  payments: number;
}

/** Revenue over the last months, for the panel. */
export interface RevenueReport {
  currency: string;
  timeZone: string;
  months: RevenueMonth[];
  totals: { gross: number; refunded: number; net: number; tax: number; payments: number };
  /** Net revenue by plan over the same months, largest first. */
  byPlan: RevenueByPlan[];
  /**
   * What the subscriptions paid online bring in per month as they stand:
   * monthly prices, and a twelfth of yearly ones. Trials are not counted.
   */
  monthlyRecurring: number;
  /** The subscriptions counted in it. */
  payingSubscribers: number;
  /** Viewers in a free trial, who pay when it ends unless they cancel. */
  trialing: number;
  /** Payments in other currencies, which are left out of every sum above. */
  otherCurrencies: { currency: string; payments: number }[];
}
