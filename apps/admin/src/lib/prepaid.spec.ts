// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  countCodes,
  describeDays,
  describeForm,
  describeGives,
  emptyForm,
  endOfDay,
  formatCodeInput,
  formProblem,
  isCompleteCode,
  toDayField,
  toInput,
  usedShare,
} from './prepaid';

describe('describeDays', () => {
  it('says days and whole years', () => {
    expect(describeDays(1)).toBe('1 day');
    expect(describeDays(30)).toBe('30 days');
    expect(describeDays(365)).toBe('1 year');
    expect(describeDays(730)).toBe('2 years');
    expect(describeDays(366)).toBe('366 days');
  });

  it('names the plan with it', () => {
    expect(describeGives({ days: 90, plan: { id: 'p', name: 'Premium' } })).toBe(
      '90 days of Premium',
    );
  });
});

describe('usedShare', () => {
  it('is the used part of the batch', () => {
    expect(usedShare({ total: 200, redeemed: 50 })).toBe(0.25);
    expect(usedShare({ total: 0, redeemed: 0 })).toBe(0);
  });
});

describe('countCodes', () => {
  it('counts with the right noun', () => {
    expect(countCodes(1)).toBe('1 code');
    expect(countCodes(2500)).toBe('2,500 codes');
  });
});

describe('formatCodeInput', () => {
  it('writes what is typed in groups of four', () => {
    expect(formatCodeInput('abcd2345')).toBe('ABCD-2345');
    expect(formatCodeInput(' abcd 2345-efgh 6789 ')).toBe('ABCD-2345-EFGH-6789');
    expect(formatCodeInput('abc')).toBe('ABC');
    expect(formatCodeInput('')).toBe('');
  });

  it('takes no more than a code holds', () => {
    expect(formatCodeInput('ABCD2345EFGH6789ZZZZ')).toBe('ABCD-2345-EFGH-6789');
  });

  it('knows when a code is whole', () => {
    expect(isCompleteCode('ABCD-2345-EFGH-6789')).toBe(true);
    expect(isCompleteCode('ABCD-2345-EFGH')).toBe(false);
  });
});

describe('the form of a batch', () => {
  const now = new Date('2026-06-01T12:00:00');
  const good = { ...emptyForm('plan-1'), name: 'Kiosk cards' };

  it('accepts a complete form', () => {
    expect(formProblem(good, now)).toBeNull();
    expect(toInput({ ...good, name: ' Kiosk cards ', note: ' ' })).toEqual({
      name: 'Kiosk cards',
      planId: 'plan-1',
      days: 30,
      count: 100,
      expiresAt: null,
      note: null,
    });
  });

  it('asks for a name and a plan', () => {
    expect(formProblem({ ...good, name: ' ' }, now)).toMatch(/name/);
    expect(formProblem({ ...good, planId: '' }, now)).toMatch(/plan/);
  });

  it('keeps days and the number of codes within what the server takes', () => {
    expect(formProblem({ ...good, days: '0' }, now)).toMatch(/between 1 and 3,650 days/);
    expect(formProblem({ ...good, days: '1.5' }, now)).toMatch(/days/);
    expect(formProblem({ ...good, days: '' }, now)).toMatch(/days/);
    expect(formProblem({ ...good, count: '5001' }, now)).toMatch(/5,000 codes/);
    expect(formProblem({ ...good, count: 'many' }, now)).toMatch(/codes/);
  });

  it('refuses a last day that has passed, and takes today', () => {
    expect(formProblem({ ...good, until: '2026-05-31' }, now)).toMatch(/past/);
    expect(formProblem({ ...good, until: '2026-06-01' }, now)).toBeNull();
    expect(formProblem({ ...good, until: 'soon' }, now)).toMatch(/not a date/);
  });

  it('counts the last day in full', () => {
    const until = endOfDay('2026-06-30');
    expect(until).not.toBeNull();
    expect(new Date(until as string).getHours()).toBe(23);
    expect(toDayField(until)).toBe('2026-06-30');
    expect(toDayField(null)).toBe('');
  });

  it('says what would be made', () => {
    expect(describeForm(good, 'Standard')).toBe(
      '100 codes, each for 30 days of Standard: 3,000 days of watching in all.',
    );
    expect(describeForm({ ...good, count: '' }, 'Standard')).toBeNull();
    expect(describeForm(good, null)).toBeNull();
  });
});
