// SPDX-License-Identifier: AGPL-3.0-only
import { isValid, rentalDeadline, rentalEnd, strongest } from './purchase-rules.js';

const NOW = new Date('2026-11-21T12:00:00Z');
const hours = (count: number) => new Date(NOW.getTime() + count * 3_600_000);

describe('isValid', () => {
  it('lets a bought title be watched without an end', () => {
    expect(isValid({ status: 'ACTIVE', expiresAt: null }, NOW)).toBe(true);
  });

  it('lets a rented title be watched until its time is up, to the moment', () => {
    expect(isValid({ status: 'ACTIVE', expiresAt: hours(1) }, NOW)).toBe(true);
    expect(isValid({ status: 'ACTIVE', expiresAt: NOW }, NOW)).toBe(false);
    expect(isValid({ status: 'ACTIVE', expiresAt: hours(-1) }, NOW)).toBe(false);
  });

  it('ends at once when the money was returned', () => {
    expect(isValid({ status: 'REVOKED', expiresAt: null }, NOW)).toBe(false);
    expect(isValid({ status: 'REVOKED', expiresAt: hours(5) }, NOW)).toBe(false);
  });
});

describe('rentals', () => {
  it('have to be started within the days allowed', () => {
    expect(rentalDeadline(NOW, 30)).toEqual(hours(30 * 24));
  });

  it('run for the hours allowed once started', () => {
    expect(rentalEnd(NOW, hours(30 * 24), 48)).toEqual(hours(48));
  });

  it('never run past the day they had to be started by', () => {
    expect(rentalEnd(NOW, hours(10), 48)).toEqual(hours(10));
  });

  it('run for the hours allowed when no deadline was set', () => {
    expect(rentalEnd(NOW, null, 24)).toEqual(hours(24));
  });
});

describe('strongest', () => {
  const rent = (count: number) => ({ kind: 'RENT' as const, expiresAt: hours(count) });
  const buy = { kind: 'BUY' as const, expiresAt: null };

  it('is nothing among none', () => {
    expect(strongest([])).toBeNull();
  });

  it('prefers a bought title to a rented one', () => {
    expect(strongest([rent(5), buy, rent(50)])).toBe(buy);
  });

  it('prefers the rental that lasts longer', () => {
    const long = rent(40);
    expect(strongest([rent(5), long, rent(20)])).toBe(long);
  });
});
