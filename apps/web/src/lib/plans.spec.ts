// SPDX-License-Identifier: AGPL-3.0-only
import {
  bestYearlySaving,
  canWatch,
  describeEnd,
  describeOwned,
  describeRentalTerms,
  ownedTitle,
  subscribable,
  timeLeft,
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

describe('renting and buying', () => {
  const NOW = new Date('2026-11-21T12:00:00Z');
  const inHours = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();
  const film = { id: 't1', access: 'PAID' as const, rentAmount: 399, buyAmount: 999 };
  const rented = (hours: number, started = false) => ({
    titleId: 't1',
    kind: 'RENT' as const,
    expiresAt: inHours(hours),
    started,
  });
  const bought = { titleId: 't1', kind: 'BUY' as const, expiresAt: null, started: false };

  it('finds what the viewer has of a title, while it lasts', () => {
    expect(ownedTitle([rented(5)], 't1', NOW)?.kind).toBe('RENT');
    expect(ownedTitle([rented(-1)], 't1', NOW)).toBeNull();
    expect(ownedTitle([bought], 't1', NOW)?.kind).toBe('BUY');
    expect(ownedTitle([bought], 't2', NOW)).toBeNull();
  });

  it('opens a title that is rented or bought, with or without a plan', () => {
    expect(canWatch(film, null, [], NOW)).toBe(false);
    expect(canWatch(film, null, [rented(5)], NOW)).toBe(true);
    expect(canWatch(film, null, [rented(-1)], NOW)).toBe(false);
    expect(canWatch(film, { all: true, packageIds: [] }, [], NOW)).toBe(true);
    expect(canWatch({ id: 't1', access: 'FREE' }, null, [], NOW)).toBe(true);
  });

  it('keeps a title for buyers closed to every plan', () => {
    const premiere = { ...film, purchaseOnly: true };
    const everything = { all: true, packageIds: [] };
    expect(canWatch(premiere, everything, [], NOW)).toBe(false);
    expect(canWatch(premiere, everything, [bought], NOW)).toBe(true);
    expect(subscribable(premiere, [{ includesAll: true } as never])).toBe(false);
    expect(subscribable(film, [{ includesAll: true } as never])).toBe(true);
    expect(subscribable(film, [])).toBe(false);
  });

  it('says how much time is left', () => {
    expect(timeLeft(inHours(24 * 29.99), NOW)).toBe('30 days');
    expect(timeLeft(inHours(24 * 3.2), NOW)).toBe('4 days');
    expect(timeLeft(inHours(48), NOW)).toBe('48 hours');
    expect(timeLeft(inHours(47.9), NOW)).toBe('48 hours');
    expect(timeLeft(inHours(1.5), NOW)).toBe('2 hours');
    expect(timeLeft(inHours(1), NOW)).toBe('60 minutes');
    expect(timeLeft(inHours(0.5), NOW)).toBe('30 minutes');
    expect(timeLeft(inHours(0.001), NOW)).toBe('1 minute');
  });

  it('describes what the viewer has', () => {
    expect(describeOwned(bought, NOW)).toBe('You bought this title.');
    expect(describeOwned(rented(24 * 30), NOW)).toBe(
      'Rented. Start within 30 days. Once you press play, the time to finish it runs.',
    );
    expect(describeOwned(rented(40, true), NOW)).toBe('Rented. 40 hours left to watch.');
    expect(describeRentalTerms({ startDays: 30, watchHours: 48 })).toBe(
      '30 days to start, then 48 hours to finish.',
    );
    expect(describeRentalTerms({ startDays: 1, watchHours: 1 })).toBe(
      '1 day to start, then 1 hour to finish.',
    );
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
