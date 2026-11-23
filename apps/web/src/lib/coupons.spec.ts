// SPDX-License-Identifier: AGPL-3.0-only
import {
  type CouponPlansQuote,
  describeAfterwards,
  describeOff,
  describePlanCoupon,
  planPrice,
  tidyCode,
} from './coupons';

const price = { listAmount: 799, discountAmount: 160, finalAmount: 639 };
const quote: CouponPlansQuote = {
  code: 'WELCOME20',
  kind: 'PERCENT',
  percentOff: 20,
  amountOff: null,
  currency: 'EUR',
  duration: 'REPEATING',
  durationMonths: 3,
  lasts: 'for the first 3 months',
  plans: [{ planId: 'standard', month: price, year: null }],
};

describe('describeOff', () => {
  it('names a share or a sum', () => {
    expect(describeOff(quote)).toBe('20% off');
    expect(describeOff({ ...quote, kind: 'AMOUNT', percentOff: null, amountOff: 500 })).toBe(
      '€5 off',
    );
    expect(describePlanCoupon(quote)).toBe('20% off for the first 3 months');
  });
});

describe('describeAfterwards', () => {
  it('says what is paid when the code has run out', () => {
    expect(describeAfterwards(quote, price, 'month')).toBe('€7.99 a month after 3 months');
    expect(describeAfterwards({ ...quote, durationMonths: 1 }, price, 'month')).toBe(
      'then €7.99 a month',
    );
    expect(describeAfterwards({ ...quote, duration: 'ONCE' }, price, 'month')).toBe(
      'then €7.99 a month',
    );
  });

  it('treats a year paid at once as one payment', () => {
    const yearly = { listAmount: 7990, discountAmount: 1598, finalAmount: 6392 };
    expect(describeAfterwards(quote, yearly, 'year')).toBe('then €79.90 a year');
  });

  it('says nothing for a code that lasts, or that takes nothing off', () => {
    expect(describeAfterwards({ ...quote, duration: 'FOREVER' }, price, 'month')).toBeNull();
    expect(describeAfterwards(quote, { ...price, discountAmount: 0 }, 'month')).toBeNull();
  });
});

describe('planPrice', () => {
  it('finds the price of a plan for the chosen way to pay', () => {
    expect(planPrice(quote, 'standard', 'month')).toBe(price);
    expect(planPrice(quote, 'standard', 'year')).toBeNull();
    expect(planPrice(quote, 'premium', 'month')).toBeNull();
    expect(planPrice(null, 'standard', 'month')).toBeNull();
  });
});

describe('tidyCode', () => {
  it('writes a code the way the site keeps it', () => {
    expect(tidyCode('  welcome-20 ')).toBe('WELCOME-20');
    expect(tidyCode('   ')).toBe('');
  });
});
