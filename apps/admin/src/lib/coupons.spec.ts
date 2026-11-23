// SPDX-License-Identifier: AGPL-3.0-only
import type { Coupon } from '@/api/types';
import {
  describeLasts,
  describeOff,
  describeScope,
  describeUses,
  exampleOf,
  formProblem,
  generateCode,
  toForm,
  toInput,
  usedShare,
} from './coupons';

const coupon = (values: Partial<Coupon> = {}): Coupon => ({
  id: 'c1',
  code: 'WELCOME20',
  note: null,
  kind: 'PERCENT',
  percentOff: 20,
  amountOff: null,
  scope: 'EVERYTHING',
  duration: 'ONCE',
  durationMonths: null,
  plans: [],
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  oncePerViewer: true,
  newCustomersOnly: false,
  isActive: true,
  state: 'ACTIVE',
  used: 0,
  discountTotal: 0,
  lastUsedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...values,
});

describe('describing a coupon', () => {
  it('says what it takes off', () => {
    expect(describeOff(coupon(), 'EUR')).toBe('20 % off');
    expect(describeOff(coupon({ kind: 'AMOUNT', percentOff: null, amountOff: 500 }), 'EUR')).toBe(
      '€5.00 off',
    );
  });

  it('says for how long a subscription costs less', () => {
    expect(describeLasts(coupon())).toBe('the first payment');
    expect(describeLasts(coupon({ duration: 'REPEATING', durationMonths: 3 }))).toBe(
      'the first 3 months',
    );
    expect(describeLasts(coupon({ duration: 'REPEATING', durationMonths: 1 }))).toBe(
      'the first month',
    );
    expect(describeLasts(coupon({ duration: 'FOREVER' }))).toBe('every payment');
    expect(describeLasts(coupon({ scope: 'TITLES' }))).toBeNull();
  });

  it('says what it is for', () => {
    const plans = [
      { id: 'p1', name: 'Standard' },
      { id: 'p2', name: 'Premium' },
    ];
    expect(describeScope(coupon())).toBe('Everything');
    expect(describeScope(coupon({ scope: 'TITLES' }))).toBe('Single titles');
    expect(describeScope(coupon({ scope: 'SUBSCRIPTIONS', plans }))).toBe('Standard, Premium');
    expect(describeScope(coupon({ plans }))).toBe('Standard, Premium, and single titles');
  });

  it('counts its uses against its limit', () => {
    expect(describeUses(coupon({ used: 12 }))).toBe('12');
    expect(describeUses(coupon({ used: 12, maxRedemptions: 100 }))).toBe('12 of 100');
    expect(usedShare(coupon({ used: 12 }))).toBeNull();
    expect(usedShare(coupon({ used: 25, maxRedemptions: 100 }))).toBe(0.25);
    expect(usedShare(coupon({ used: 7, maxRedemptions: 5 }))).toBe(1);
  });
});

describe('generateCode', () => {
  it('makes two groups of characters that are not mistaken for each other', () => {
    let next = 0;
    const code = generateCode((below) => (next += 7) % below);
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(generateCode()).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(generateCode()).not.toMatch(/[01ILO]/);
  });
});

describe('the form of a coupon', () => {
  const filled = { ...toForm(null, 'EUR'), code: ' summer-10 ', percent: '10' };

  it('starts a new coupon as a share off everything, once per viewer', () => {
    expect(toForm(null, 'EUR')).toMatchObject({
      kind: 'PERCENT',
      scope: 'EVERYTHING',
      duration: 'ONCE',
      limited: false,
      oncePerViewer: true,
      isActive: true,
    });
  });

  it('says what is missing, one thing at a time', () => {
    expect(formProblem(toForm(null, 'EUR'), 'EUR')).toMatch(/at least 3 characters/);
    expect(formProblem({ ...filled, code: 'two words' }, 'EUR')).toMatch(/letters and digits/);
    expect(formProblem({ ...filled, percent: '' }, 'EUR')).toMatch(/how many percent/);
    expect(formProblem({ ...filled, percent: '120' }, 'EUR')).toMatch(/how many percent/);
    expect(formProblem({ ...filled, kind: 'AMOUNT', amount: 'abc' }, 'EUR')).toMatch(/how much/);
    expect(formProblem({ ...filled, duration: 'REPEATING', months: '0' }, 'EUR')).toMatch(
      /how many months/,
    );
    expect(formProblem({ ...filled, limited: true, max: '' }, 'EUR')).toMatch(/how often/);
    expect(
      formProblem({ ...filled, from: '2026-12-02T00:00', until: '2026-12-01T00:00' }, 'EUR'),
    ).toMatch(/after the first/);
    expect(formProblem(filled, 'EUR')).toBeNull();
  });

  it('does not ask for months of a code for single titles', () => {
    expect(
      formProblem({ ...filled, scope: 'TITLES', duration: 'REPEATING', months: '' }, 'EUR'),
    ).toBeNull();
  });

  it('sends only what the kind of coupon uses', () => {
    expect(toInput(filled, 'EUR')).toMatchObject({
      code: 'SUMMER-10',
      percentOff: 10,
      amountOff: null,
      durationMonths: null,
      maxRedemptions: null,
      startsAt: null,
    });
    const titles = toInput(
      {
        ...filled,
        kind: 'AMOUNT',
        amount: '1.50',
        scope: 'TITLES',
        duration: 'FOREVER',
        planIds: ['p1'],
        limited: true,
        max: '50',
      },
      'EUR',
    );
    expect(titles).toMatchObject({
      percentOff: null,
      amountOff: 150,
      duration: 'ONCE',
      planIds: [],
      maxRedemptions: 50,
    });
  });

  it('reads a coupon back into the form it was made with', () => {
    const made = coupon({
      kind: 'AMOUNT',
      percentOff: null,
      amountOff: 500,
      duration: 'REPEATING',
      durationMonths: 6,
      maxRedemptions: 40,
      plans: [{ id: 'p1', name: 'Standard' }],
    });
    expect(toInput(toForm(made, 'EUR'), 'EUR')).toMatchObject({
      code: 'WELCOME20',
      kind: 'AMOUNT',
      amountOff: 500,
      duration: 'REPEATING',
      durationMonths: 6,
      maxRedemptions: 40,
      planIds: ['p1'],
    });
  });
});

describe('exampleOf', () => {
  it('shows what a price becomes, as the site works it out', () => {
    expect(exampleOf({ kind: 'PERCENT', percent: '20', amount: '' }, 799, 'EUR')).toBe(639);
    expect(exampleOf({ kind: 'AMOUNT', percent: '', amount: '5.00' }, 799, 'EUR')).toBe(299);
    expect(exampleOf({ kind: 'AMOUNT', percent: '', amount: '10' }, 799, 'EUR')).toBe(0);
    expect(exampleOf({ kind: 'PERCENT', percent: '', amount: '' }, 799, 'EUR')).toBeNull();
  });
});
