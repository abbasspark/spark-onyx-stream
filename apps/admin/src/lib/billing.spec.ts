// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  describeEventType,
  describePayment,
  describePrices,
  describeSubscription,
  endOfDay,
  fractionDigits,
  monthLabel,
  parsePrice,
  percentChange,
  periodRange,
  presetEnd,
  toPriceText,
  webhookUrl,
  yearlySaving,
} from './billing';

describe('currencies', () => {
  it('knows how many digits follow the point', () => {
    expect(fractionDigits('EUR')).toBe(2);
    expect(fractionDigits('JPY')).toBe(0);
    expect(fractionDigits('KWD')).toBe(3);
  });

  it('falls back to two digits for letters that are no currency', () => {
    expect(fractionDigits('??')).toBe(2);
  });
});

describe('parsePrice', () => {
  it('reads a price with a point or a comma', () => {
    expect(parsePrice('7.99', 'EUR')).toBe(799);
    expect(parsePrice('7,99', 'EUR')).toBe(799);
    expect(parsePrice(' 8 ', 'EUR')).toBe(800);
    expect(parsePrice('7.9', 'EUR')).toBe(790);
    // Without the rounding, 19.99 would become 1998.
    expect(parsePrice('19.99', 'EUR')).toBe(1999);
  });

  it('follows the currency', () => {
    expect(parsePrice('980', 'JPY')).toBe(980);
    expect(parsePrice('9.80', 'JPY')).toBe('invalid');
    expect(parsePrice('2.500', 'KWD')).toBe(2500);
  });

  it('tells an empty field from a wrong one', () => {
    expect(parsePrice('', 'EUR')).toBeNull();
    expect(parsePrice('   ', 'EUR')).toBeNull();
    for (const text of ['free', '7.999', '-5', '0', '0.00', '1e3', '7.99 €']) {
      expect(parsePrice(text, 'EUR')).toBe('invalid');
    }
  });

  it('shows an amount the way it is typed', () => {
    expect(toPriceText(799, 'EUR')).toBe('7.99');
    expect(toPriceText(800, 'EUR')).toBe('8.00');
    expect(toPriceText(980, 'JPY')).toBe('980');
    expect(toPriceText(null, 'EUR')).toBe('');
    expect(parsePrice(toPriceText(1999, 'EUR'), 'EUR')).toBe(1999);
  });
});

describe('plans', () => {
  it('says what a year saves', () => {
    expect(yearlySaving({ monthlyAmount: 799, yearlyAmount: 7990 })).toBe(17);
    expect(yearlySaving({ monthlyAmount: 799, yearlyAmount: 9588 })).toBeNull();
    expect(yearlySaving({ monthlyAmount: 799, yearlyAmount: null })).toBeNull();
    expect(yearlySaving({ monthlyAmount: null, yearlyAmount: 7990 })).toBeNull();
  });

  it('names the prices a plan has', () => {
    expect(describePrices({ monthlyAmount: 799, yearlyAmount: null }, 'USD')).toMatch(
      /7\.99 a month$/,
    );
    expect(describePrices({ monthlyAmount: 799, yearlyAmount: 7990 }, 'USD')).toContain(' · ');
  });
});

describe('granting access', () => {
  const now = new Date('2026-11-21T12:00:00Z');

  it('counts a preset from now', () => {
    expect(presetEnd(30, now)).toBe('2026-12-21T12:00:00.000Z');
    expect(presetEnd(null, now)).toBeNull();
  });

  it('lets a chosen day last until its end', () => {
    const end = endOfDay('2026-12-24');
    expect(end).not.toBeNull();
    expect(new Date(end as string).getHours()).toBe(23);
    expect(endOfDay('nonsense')).toBeNull();
  });
});

describe('describeSubscription', () => {
  it('puts the state in words', () => {
    expect(describeSubscription({ status: 'ACTIVE', running: true }).label).toBe('Running');
    expect(describeSubscription({ status: 'TRIALING', running: true }).label).toBe('Trial');
    expect(describeSubscription({ status: 'PAST_DUE', running: true }).label).toBe(
      'Payment failed',
    );
    expect(describeSubscription({ status: 'CANCELED', running: false }).label).toBe('Ended');
    expect(describeSubscription({ status: 'EXPIRED', running: false }).label).toBe('Expired');
    // Out of time, though nothing has marked it yet.
    expect(describeSubscription({ status: 'ACTIVE', running: false }).label).toBe('Expired');
  });
});

describe('paying online', () => {
  it('builds the address Stripe reports to', () => {
    expect(webhookUrl('https://api.example.com', 'https://admin.example.com', '/v1/x')).toBe(
      'https://api.example.com/v1/x',
    );
    // The panel and the API share an address behind the gateway.
    expect(webhookUrl('', 'https://admin.example.com', '/v1/x')).toBe(
      'https://admin.example.com/v1/x',
    );
  });

  it('puts the names of events into words', () => {
    expect(describeEventType('customer.subscription.updated')).toBe(
      'Customer subscription updated',
    );
    expect(describeEventType('checkout.session.completed')).toBe('Checkout session completed');
  });

  it('says when a paying viewer has cancelled and still watches', () => {
    expect(
      describeSubscription({
        status: 'ACTIVE',
        running: true,
        online: true,
        cancelAtPeriodEnd: true,
      }),
    ).toEqual({ label: 'Cancelled, still running', tone: 'warning' });
    expect(describeSubscription({ status: 'ACTIVE', running: true, online: true }).label).toBe(
      'Running',
    );
  });
});

describe('the books', () => {
  it('names months', () => {
    expect(monthLabel('2026-11')).toMatch(/Nov/);
    expect(monthLabel('2026-01', true)).toMatch(/Jan.*2026/);
  });

  it('compares a figure with the one before', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(100, 100)).toBe(0);
    // Nothing before: no percentage that would mean anything.
    expect(percentChange(100, 0)).toBeNull();
  });

  it('turns a named period into its moments', () => {
    const now = new Date(2026, 10, 21, 15, 0, 0);
    expect(periodRange('all', now)).toEqual({});
    expect(periodRange('this-month', now)).toEqual({ from: new Date(2026, 10, 1).toISOString() });
    expect(periodRange('last-month', now)).toEqual({
      from: new Date(2026, 9, 1).toISOString(),
      to: new Date(2026, 10, 1).toISOString(),
    });
    expect(periodRange('this-year', now)).toEqual({ from: new Date(2026, 0, 1).toISOString() });
    // January looks back into the year before.
    expect(periodRange('last-month', new Date(2026, 0, 5)).from).toBe(
      new Date(2025, 11, 1).toISOString(),
    );
  });

  it('describes a payment', () => {
    expect(describePayment({ status: 'PAID' }).label).toBe('Paid');
    expect(describePayment({ status: 'PARTIALLY_REFUNDED' })).toEqual({
      label: 'Partly refunded',
      tone: 'warning',
    });
    expect(describePayment({ status: 'REFUNDED' }).tone).toBe('neutral');
  });
});
