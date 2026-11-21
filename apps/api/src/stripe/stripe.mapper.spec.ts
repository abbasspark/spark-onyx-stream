// SPDX-License-Identifier: AGPL-3.0-only
import {
  mapInvoice,
  mapSubscription,
  periodEndOf,
  refundState,
  RENEWAL_GRACE_MS,
} from './stripe.mapper.js';
import type { StripeInvoice, StripeSubscription } from './stripe.types.js';

const START = 1_790_000_000;
const PERIOD_END = START + 30 * 86_400;
const at = (seconds: number) => new Date(seconds * 1000);

const subscription = (fields: Partial<StripeSubscription> = {}): StripeSubscription => ({
  id: 'sub_1',
  status: 'active',
  customer: 'cus_1',
  start_date: START,
  cancel_at_period_end: false,
  cancel_at: null,
  canceled_at: null,
  ended_at: null,
  items: {
    data: [{ current_period_end: PERIOD_END, price: { recurring: { interval: 'month' } } }],
  },
  ...fields,
});

describe('periodEndOf', () => {
  it('reads the period from the items, where Stripe keeps it now', () => {
    expect(periodEndOf(subscription())).toEqual(at(PERIOD_END));
  });

  it('reads the old place when the items carry none', () => {
    const old = subscription({ current_period_end: PERIOD_END, items: { data: [{}] } });
    expect(periodEndOf(old)).toEqual(at(PERIOD_END));
  });

  it('takes the earliest of several items', () => {
    const mixed = subscription({
      items: {
        data: [{ current_period_end: PERIOD_END + 500 }, { current_period_end: PERIOD_END }],
      },
    });
    expect(periodEndOf(mixed)).toEqual(at(PERIOD_END));
  });

  it('is null when Stripe names no period', () => {
    expect(periodEndOf(subscription({ items: null }))).toBeNull();
  });
});

describe('mapSubscription', () => {
  it('lets a renewing subscription run a few days past the next payment', () => {
    expect(mapSubscription(subscription())).toEqual({
      status: 'ACTIVE',
      interval: 'MONTH',
      startedAt: at(START),
      renewsAt: at(PERIOD_END),
      endsAt: new Date(PERIOD_END * 1000 + RENEWAL_GRACE_MS),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      amount: null,
    });
  });

  it('reads what one interval costs', () => {
    const priced = subscription({
      items: {
        data: [
          {
            current_period_end: PERIOD_END,
            price: { unit_amount: 799, recurring: { interval: 'month' } },
          },
        ],
      },
    });
    expect(mapSubscription(priced)?.amount).toBe(799);
  });

  it('knows a trial and a yearly plan', () => {
    const trial = mapSubscription(
      subscription({
        status: 'trialing',
        items: {
          data: [{ current_period_end: PERIOD_END, price: { recurring: { interval: 'year' } } }],
        },
      }),
    );
    expect(trial).toMatchObject({ status: 'TRIALING', interval: 'YEAR', renewsAt: at(PERIOD_END) });
  });

  it('ends a cancelled subscription exactly at the end of what is paid', () => {
    const cancelled = mapSubscription(
      subscription({ cancel_at_period_end: true, canceled_at: START + 100 }),
    );
    expect(cancelled).toMatchObject({
      status: 'ACTIVE',
      endsAt: at(PERIOD_END),
      renewsAt: null,
      cancelAtPeriodEnd: true,
      canceledAt: at(START + 100),
    });
  });

  it('follows an end date set at Stripe', () => {
    const scheduled = mapSubscription(subscription({ cancel_at: PERIOD_END + 999 }));
    expect(scheduled).toMatchObject({ endsAt: at(PERIOD_END + 999), cancelAtPeriodEnd: true });
  });

  it('keeps access while a failed payment is tried again', () => {
    expect(mapSubscription(subscription({ status: 'past_due' }))).toMatchObject({
      status: 'PAST_DUE',
      renewsAt: at(PERIOD_END),
    });
  });

  it('ends at once when it is over at Stripe', () => {
    const over = mapSubscription(
      subscription({ status: 'canceled', canceled_at: START + 50, ended_at: START + 60 }),
    );
    expect(over).toMatchObject({
      status: 'CANCELED',
      endsAt: at(START + 60),
      renewsAt: null,
      cancelAtPeriodEnd: false,
      canceledAt: at(START + 50),
    });
  });

  it.each(['unpaid', 'incomplete_expired', 'paused'])('gives no access when %s', (status) => {
    expect(mapSubscription(subscription({ status }))).toMatchObject({
      status: 'EXPIRED',
      renewsAt: null,
    });
  });

  it('records nothing while the first payment is open, or for a state it does not know', () => {
    expect(mapSubscription(subscription({ status: 'incomplete' }))).toBeNull();
    expect(mapSubscription(subscription({ status: 'something_new' }))).toBeNull();
  });
});

describe('mapInvoice', () => {
  const invoice = (fields: Partial<StripeInvoice> = {}): StripeInvoice => ({
    id: 'in_1',
    status: 'paid',
    currency: 'eur',
    amount_paid: 799,
    customer: 'cus_1',
    number: 'A-0001',
    hosted_invoice_url: 'https://invoice.stripe.com/i/1',
    created: START,
    status_transitions: { paid_at: START + 30 },
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } },
    total_taxes: [{ amount: 100 }, { amount: 28 }],
    payments: { data: [{ payment: { payment_intent: 'pi_1' } }] },
    lines: { data: [{ period: { start: START, end: PERIOD_END } }] },
    ...fields,
  });

  it('reads a paid invoice in the shape Stripe uses now', () => {
    expect(mapInvoice(invoice())).toEqual({
      externalId: 'in_1',
      subscriptionExternalId: 'sub_1',
      customerId: 'cus_1',
      paymentId: 'pi_1',
      amount: 799,
      taxAmount: 128,
      currency: 'EUR',
      paidAt: at(START + 30),
      periodStart: at(START),
      periodEnd: at(PERIOD_END),
      invoiceNumber: 'A-0001',
      invoiceUrl: 'https://invoice.stripe.com/i/1',
    });
  });

  it('reads the shape from before the subscription and the tax moved', () => {
    const old = invoice({
      parent: null,
      subscription: { id: 'sub_old' },
      total_taxes: null,
      tax: 128,
      payments: null,
      payment_intent: 'pi_old',
      status_transitions: null,
    });
    expect(mapInvoice(old)).toMatchObject({
      subscriptionExternalId: 'sub_old',
      taxAmount: 128,
      paymentId: 'pi_old',
      paidAt: at(START),
    });
  });

  it('is no payment while unpaid, and when it is over nothing', () => {
    expect(mapInvoice(invoice({ status: 'open' }))).toBeNull();
    expect(mapInvoice(invoice({ status: 'void' }))).toBeNull();
    expect(mapInvoice(invoice({ amount_paid: 0 }))).toBeNull();
  });

  it('never counts more tax than was paid', () => {
    expect(mapInvoice(invoice({ total_taxes: [{ amount: 5000 }] }))?.taxAmount).toBe(799);
  });
});

describe('refundState', () => {
  it('tells a part from the whole', () => {
    expect(refundState(799, 0)).toEqual({ refundedAmount: 0, status: 'PAID' });
    expect(refundState(799, 300)).toEqual({ refundedAmount: 300, status: 'PARTIALLY_REFUNDED' });
    expect(refundState(799, 799)).toEqual({ refundedAmount: 799, status: 'REFUNDED' });
    // Stripe never returns more than was paid. Should it say so, the books do not go below zero.
    expect(refundState(799, 900)).toEqual({ refundedAmount: 799, status: 'REFUNDED' });
  });
});
