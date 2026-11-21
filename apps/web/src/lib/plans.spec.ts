// SPDX-License-Identifier: AGPL-3.0-only
import {
  bestYearlySaving,
  describeEnd,
  describeOpens,
  listNames,
  opensFrom,
  opensTitle,
  planOpensTitle,
  describeRefund,
  subscribeLabel,
  formatMoney,
  intervalsOf,
  type Plan,
  priceOf,
  yearlySaving,
} from './plans';

const plan = (monthlyAmount: number | null, yearlyAmount: number | null): Plan => ({
  id: 'p',
  name: 'Standard',
  description: null,
  features: [],
  monthlyAmount,
  yearlyAmount,
  trialDays: 0,
  isRecommended: false,
});

describe('formatMoney', () => {
  it('writes amounts of the smallest unit as prices', () => {
    expect(formatMoney(799, 'EUR')).toBe('€7.99');
    expect(formatMoney(1250, 'USD')).toBe('$12.50');
  });

  it('leaves the cents off a round price', () => {
    expect(formatMoney(800, 'EUR')).toBe('€8');
  });

  it('follows the currency', () => {
    expect(formatMoney(980, 'JPY')).toBe('¥980');
  });

  it('still shows something for letters that are no currency', () => {
    expect(formatMoney(799, '??')).toBe('7.99 ??');
  });
});

describe('prices of plans', () => {
  it('picks the price of an interval', () => {
    expect(priceOf(plan(799, 7990), 'month')).toBe(799);
    expect(priceOf(plan(799, 7990), 'year')).toBe(7990);
    expect(priceOf(plan(799, null), 'year')).toBeNull();
  });

  it('says what a year saves', () => {
    expect(yearlySaving(plan(799, 7990))).toBe(17);
    expect(yearlySaving(plan(799, 9588))).toBeNull();
    expect(yearlySaving(plan(799, null))).toBeNull();
    expect(bestYearlySaving([plan(799, 7990), plan(1299, 10000), plan(500, null)])).toBe(36);
    expect(bestYearlySaving([plan(799, null)])).toBeNull();
  });

  it('knows which intervals are on sale', () => {
    expect(intervalsOf([plan(799, null), plan(1299, null)])).toEqual(['month']);
    expect(intervalsOf([plan(799, null), plan(null, 9900)])).toEqual(['month', 'year']);
    expect(intervalsOf([])).toEqual([]);
  });
});

describe('describeEnd', () => {
  it('names the day, or says there is none', () => {
    expect(describeEnd({ endsAt: '2026-12-24T12:00:00.000Z', status: 'ACTIVE' })).toBe(
      'until 24 December 2026',
    );
    expect(describeEnd({ endsAt: null, status: 'ACTIVE' })).toBe('with no end date');
  });

  it('names the day of the next payment, not the days of grace after it', () => {
    const paid = { endsAt: '2026-12-27T12:00:00.000Z', renewsAt: '2026-12-24T12:00:00.000Z' };
    expect(describeEnd({ ...paid, status: 'ACTIVE' })).toBe('renewed on 24 December 2026');
    expect(describeEnd({ ...paid, status: 'TRIALING' })).toBe(
      'free until 24 December 2026, then paid',
    );
  });

  it('names the end once a paid subscription is cancelled', () => {
    expect(
      describeEnd({ endsAt: '2026-12-24T12:00:00.000Z', renewsAt: null, status: 'ACTIVE' }),
    ).toBe('until 24 December 2026');
  });
});

describe('what a subscription opens', () => {
  const paid = (...packageIds: string[]) => ({ access: 'PAID' as const, packageIds });

  it('opens a free title to everyone', () => {
    expect(opensTitle(null, { access: 'FREE' })).toBe(true);
    expect(opensTitle(null, {})).toBe(true);
  });

  it('opens nothing paid without a subscription', () => {
    expect(opensTitle(null, paid('kids'))).toBe(false);
  });

  it('opens everything, or the packages of the plan', () => {
    expect(opensTitle({ all: true, packageIds: [] }, paid())).toBe(true);
    const kids = { all: false, packageIds: ['kids'] };
    expect(opensTitle(kids, paid('sports', 'kids'))).toBe(true);
    expect(opensTitle(kids, paid('sports'))).toBe(false);
    // Not sorted into a package: only a plan that opens everything shows it.
    expect(opensTitle(kids, paid())).toBe(false);
    expect(opensTitle(kids, { access: 'PAID' })).toBe(false);
  });

  it('reads the answer of a site older than packages', () => {
    expect(opensFrom({ entitled: true })).toEqual({ all: true, packageIds: [] });
    expect(opensFrom({ entitled: false })).toBeNull();
    expect(opensFrom({ entitled: true, access: { all: false, packageIds: ['k'] } })).toEqual({
      all: false,
      packageIds: ['k'],
    });
    expect(opensFrom({ entitled: false, access: null })).toBeNull();
  });

  it('knows which plans open a title', () => {
    const kidsPlan = { includesAll: false, packages: [{ id: 'kids', name: 'Kids' }] };
    expect(planOpensTitle(kidsPlan, paid('kids'))).toBe(true);
    expect(planOpensTitle(kidsPlan, paid('sports'))).toBe(false);
    expect(planOpensTitle({ includesAll: true }, paid())).toBe(true);
    // A plan of a site older than packages opens everything.
    expect(planOpensTitle({}, paid('sports'))).toBe(true);
  });

  it('puts it into words', () => {
    expect(describeOpens({ includesAll: true })).toBe('every title with a lock');
    expect(describeOpens({})).toBe('every title with a lock');
    expect(
      describeOpens({
        includesAll: false,
        packages: [
          { id: 'a', name: 'Kids' },
          { id: 'b', name: 'Sports' },
          { id: 'c', name: 'Films' },
        ],
      }),
    ).toBe('Kids, Sports and Films');
    expect(listNames(['Kids', 'Sports'])).toBe('Kids and Sports');
    expect(listNames(['Kids'])).toBe('Kids');
  });
});

describe('describeRefund', () => {
  it('says what came back of a payment', () => {
    expect(describeRefund({ status: 'PAID', refundedAmount: 0, currency: 'EUR' })).toBeNull();
    expect(describeRefund({ status: 'REFUNDED', refundedAmount: 799, currency: 'EUR' })).toBe(
      'Returned',
    );
    expect(
      describeRefund({ status: 'PARTIALLY_REFUNDED', refundedAmount: 300, currency: 'EUR' }),
    ).toBe('€3 returned');
  });
});

describe('subscribeLabel', () => {
  it('offers the trial where there is one', () => {
    expect(subscribeLabel({ trialDays: 7 }, true)).toBe('Start 7 days free');
    expect(subscribeLabel({ trialDays: 1 }, true)).toBe('Start 1 day free');
    expect(subscribeLabel({ trialDays: 0 }, true)).toBe('Subscribe');
    expect(subscribeLabel({ trialDays: 7 }, false)).toBe('Subscribe');
  });
});
