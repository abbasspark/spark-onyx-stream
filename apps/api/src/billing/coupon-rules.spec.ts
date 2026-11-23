// SPDX-License-Identifier: AGPL-3.0-only
import {
  couponState,
  coversKind,
  describeDuration,
  discountFor,
  normalizeCode,
  stripeCouponId,
} from './coupon-rules.js';

const NOW = new Date('2026-11-23T12:00:00Z');
const coupon = {
  id: '01a20838-a590-764c-9473-607fa5490ed0',
  kind: 'PERCENT' as const,
  percentOff: 20,
  amountOff: null,
  duration: 'ONCE' as const,
  durationMonths: null,
  isActive: true,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
};

describe('normalizeCode', () => {
  it('compares codes without regard to case or spaces around them', () => {
    expect(normalizeCode('  welcome-20 ')).toBe('WELCOME-20');
  });
});

describe('couponState', () => {
  it('follows the switch, the dates and the number of uses', () => {
    expect(couponState(coupon, 0, NOW)).toBe('ACTIVE');
    expect(couponState({ ...coupon, isActive: false }, 0, NOW)).toBe('OFF');
    expect(couponState({ ...coupon, startsAt: new Date('2026-12-01') }, 0, NOW)).toBe('SCHEDULED');
    expect(couponState({ ...coupon, endsAt: new Date('2026-11-01') }, 0, NOW)).toBe('ENDED');
    expect(couponState({ ...coupon, endsAt: NOW }, 0, NOW)).toBe('ENDED');
    expect(couponState({ ...coupon, maxRedemptions: 3 }, 2, NOW)).toBe('ACTIVE');
    expect(couponState({ ...coupon, maxRedemptions: 3 }, 3, NOW)).toBe('USED_UP');
  });

  it('says switched off before anything else, and ended before used up', () => {
    const spent = { ...coupon, maxRedemptions: 1, endsAt: new Date('2026-11-01') };
    expect(couponState(spent, 1, NOW)).toBe('ENDED');
    expect(couponState({ ...spent, isActive: false }, 1, NOW)).toBe('OFF');
  });
});

describe('discountFor', () => {
  it('takes a share, rounded in favour of the viewer', () => {
    expect(discountFor(coupon, 999)).toBe(200);
    expect(discountFor({ ...coupon, percentOff: 100 }, 999)).toBe(999);
    expect(discountFor({ ...coupon, percentOff: 33 }, 100)).toBe(33);
  });

  it('takes a sum, and never more than the price', () => {
    const fixed = { kind: 'AMOUNT' as const, percentOff: null, amountOff: 500 };
    expect(discountFor(fixed, 1299)).toBe(500);
    expect(discountFor(fixed, 399)).toBe(399);
  });
});

describe('coversKind', () => {
  it('tells plans from single titles', () => {
    expect(coversKind('EVERYTHING', 'RENTAL')).toBe(true);
    expect(coversKind('SUBSCRIPTIONS', 'SUBSCRIPTION')).toBe(true);
    expect(coversKind('SUBSCRIPTIONS', 'PURCHASE')).toBe(false);
    expect(coversKind('TITLES', 'RENTAL')).toBe(true);
    expect(coversKind('TITLES', 'SUBSCRIPTION')).toBe(false);
  });
});

describe('stripeCouponId', () => {
  it('stays the same for the same terms and changes with them', () => {
    const id = stripeCouponId(coupon, 'EUR', true);
    expect(id).toMatch(/^onyx_c_01a20838a590764c9473607fa5490ed0_[0-9a-f]{10}$/);
    expect(stripeCouponId({ ...coupon }, 'eur', true)).toBe(id);
    expect(stripeCouponId({ ...coupon, percentOff: 25 }, 'EUR', true)).not.toBe(id);
    expect(stripeCouponId({ ...coupon, duration: 'FOREVER' }, 'EUR', true)).not.toBe(id);
  });

  it('knows no duration for a single payment', () => {
    const forever = { ...coupon, duration: 'FOREVER' as const };
    expect(stripeCouponId(forever, 'EUR', false)).toBe(stripeCouponId(coupon, 'EUR', false));
  });

  it('names the currency of a sum', () => {
    const fixed = { ...coupon, kind: 'AMOUNT' as const, percentOff: null, amountOff: 500 };
    expect(stripeCouponId(fixed, 'EUR', false)).not.toBe(stripeCouponId(fixed, 'USD', false));
  });
});

describe('describeDuration', () => {
  it('says for how long a subscription costs less', () => {
    expect(describeDuration(coupon)).toBe('on the first payment');
    expect(describeDuration({ duration: 'REPEATING', durationMonths: 3 })).toBe(
      'for the first 3 months',
    );
    expect(describeDuration({ duration: 'REPEATING', durationMonths: 1 })).toBe(
      'for the first month',
    );
    expect(describeDuration({ duration: 'FOREVER', durationMonths: null })).toBe(
      'on every payment',
    );
  });
});
