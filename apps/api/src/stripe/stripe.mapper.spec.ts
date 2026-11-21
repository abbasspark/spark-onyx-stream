// SPDX-License-Identifier: AGPL-3.0-only
import { mapSubscription, periodEndOf, RENEWAL_GRACE_MS } from './stripe.mapper.js';
import type { StripeSubscription } from './stripe.types.js';

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
    });
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
