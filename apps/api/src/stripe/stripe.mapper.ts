// SPDX-License-Identifier: AGPL-3.0-only
import type { BillingInterval, SubscriptionStatus } from '@onyx/database';
import { idOf, type StripeInvoice, type StripeSubscription } from './stripe.types.js';

/**
 * How long a renewing subscription lets its viewer watch past the day the
 * next payment is due. Stripe reports a renewal within moments; should that
 * report be late or lost, nobody who paid is locked out, and the hourly check
 * with Stripe corrects the record well within this time.
 */
export const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/** What a subscription at Stripe means here. */
export interface SubscriptionState {
  status: SubscriptionStatus;
  interval: BillingInterval | null;
  startedAt: Date | null;
  /** Until when the viewer may watch. */
  endsAt: Date | null;
  /** When the next payment is due. Null when it is not renewed. */
  renewsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  /** What one interval costs, in the smallest unit of the currency. */
  amount: number | null;
}

const STATUS: Record<string, SubscriptionStatus> = {
  trialing: 'TRIALING',
  active: 'ACTIVE',
  // Stripe tries a failed payment again for a while. Access continues until it gives up.
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  // Stripe gave up collecting, the first payment never arrived, or collection is on hold.
  unpaid: 'EXPIRED',
  incomplete_expired: 'EXPIRED',
  paused: 'EXPIRED',
};

const date = (seconds: number | null | undefined): Date | null =>
  typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000) : null;

/** The end of the period that is paid for. Read from the items, and from the old place as well. */
export function periodEndOf(subscription: StripeSubscription): Date | null {
  const ends = (subscription.items?.data ?? [])
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  if (ends.length > 0) {
    return date(Math.min(...ends));
  }
  return date(subscription.current_period_end);
}

function intervalOf(subscription: StripeSubscription): BillingInterval | null {
  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
  return interval === 'month' ? 'MONTH' : interval === 'year' ? 'YEAR' : null;
}

function amountOf(subscription: StripeSubscription): number | null {
  const item = subscription.items?.data?.[0];
  const unit = item?.price?.unit_amount;
  return typeof unit === 'number' && unit >= 0 ? unit * (item?.quantity ?? 1) : null;
}

/** A paid invoice at Stripe, as the books here keep it. */
export interface InvoicePayment {
  externalId: string;
  /** Id of the subscription at Stripe that the invoice is for. */
  subscriptionExternalId: string | null;
  customerId: string | null;
  /** Id of the payment at Stripe, by which a refund finds the invoice. */
  paymentId: string | null;
  amount: number;
  taxAmount: number;
  currency: string;
  paidAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
}

/**
 * Translates an invoice at Stripe into a payment.
 *
 * @returns null for an invoice that is not paid, and for one over nothing,
 *   as the first invoice of a free trial is.
 */
export function mapInvoice(invoice: StripeInvoice): InvoicePayment | null {
  if (invoice.status !== 'paid' || !(invoice.amount_paid > 0)) {
    return null;
  }
  const taxes = (invoice.total_taxes ?? []).reduce((sum, tax) => sum + (tax.amount ?? 0), 0);
  const tax = taxes > 0 ? taxes : (invoice.tax ?? 0);
  const period = invoice.lines?.data?.[0]?.period;
  const subscription =
    invoice.parent?.subscription_details?.subscription ?? invoice.subscription ?? null;
  const payment =
    (invoice.payments?.data ?? [])
      .map((entry) => idOf(entry.payment?.payment_intent))
      .find((id) => id !== null) ?? idOf(invoice.payment_intent);
  return {
    externalId: invoice.id,
    subscriptionExternalId: idOf(subscription),
    customerId: idOf(invoice.customer),
    paymentId: payment ?? null,
    amount: invoice.amount_paid,
    taxAmount: Math.max(0, Math.min(tax, invoice.amount_paid)),
    currency: invoice.currency.toUpperCase(),
    paidAt: date(invoice.status_transitions?.paid_at) ?? date(invoice.created) ?? new Date(),
    periodStart: date(period?.start),
    periodEnd: date(period?.end),
    invoiceNumber: invoice.number ?? null,
    invoiceUrl: invoice.hosted_invoice_url ?? null,
  };
}

/** What a payment is after money was returned. */
export function refundState(
  amount: number,
  refunded: number,
): { refundedAmount: number; status: 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' } {
  const refundedAmount = Math.max(0, Math.min(refunded, amount));
  return {
    refundedAmount,
    status:
      refundedAmount === 0 ? 'PAID' : refundedAmount >= amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
  };
}

/**
 * Translates a subscription at Stripe into the record kept here.
 *
 * @returns null for a subscription whose first payment is still open
 *   ("incomplete"), which gives no access and may never start, and for a
 *   state this version does not know.
 */
export function mapSubscription(subscription: StripeSubscription): SubscriptionState | null {
  const status = STATUS[subscription.status];
  if (!status) {
    return null;
  }
  const periodEnd = periodEndOf(subscription);
  const base = {
    status,
    interval: intervalOf(subscription),
    amount: amountOf(subscription),
    startedAt: date(subscription.start_date) ?? date(subscription.created),
    canceledAt: date(subscription.canceled_at),
  };

  if (status === 'CANCELED') {
    const endedAt = date(subscription.ended_at) ?? date(subscription.canceled_at);
    return {
      ...base,
      endsAt: endedAt,
      renewsAt: null,
      cancelAtPeriodEnd: false,
      canceledAt: date(subscription.canceled_at) ?? endedAt,
    };
  }
  if (status === 'EXPIRED') {
    return {
      ...base,
      endsAt: date(subscription.ended_at) ?? periodEnd,
      renewsAt: null,
      cancelAtPeriodEnd: false,
    };
  }

  // The viewer cancelled, or an end date was set at Stripe: it runs until then.
  const scheduledEnd =
    date(subscription.cancel_at) ?? (subscription.cancel_at_period_end ? periodEnd : null);
  if (scheduledEnd) {
    return { ...base, endsAt: scheduledEnd, renewsAt: null, cancelAtPeriodEnd: true };
  }
  return {
    ...base,
    endsAt: periodEnd ? new Date(periodEnd.getTime() + RENEWAL_GRACE_MS) : null,
    renewsAt: periodEnd,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  };
}
