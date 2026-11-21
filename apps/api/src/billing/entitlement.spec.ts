// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { accessOf, isRunning, opensTitle } from './entitlement.js';

const NOW = new Date('2026-11-21T12:00:00Z');
const LATER = new Date('2026-12-21T12:00:00Z');
const EARLIER = new Date('2026-11-20T12:00:00Z');

describe('isRunning', () => {
  it('lets a viewer watch while the paid time lasts', () => {
    expect(isRunning({ status: 'ACTIVE', endsAt: LATER }, NOW)).toBe(true);
    expect(isRunning({ status: 'TRIALING', endsAt: LATER }, NOW)).toBe(true);
  });

  it('has no end when none is set', () => {
    expect(isRunning({ status: 'ACTIVE', endsAt: null }, NOW)).toBe(true);
  });

  it('keeps access while a failed payment is retried', () => {
    expect(isRunning({ status: 'PAST_DUE', endsAt: LATER }, NOW)).toBe(true);
  });

  it('ends at the end, to the moment, whatever the stored state says', () => {
    expect(isRunning({ status: 'ACTIVE', endsAt: EARLIER }, NOW)).toBe(false);
    expect(isRunning({ status: 'ACTIVE', endsAt: NOW }, NOW)).toBe(false);
  });

  it('does not run once it is ended or expired', () => {
    expect(isRunning({ status: 'CANCELED', endsAt: LATER }, NOW)).toBe(false);
    expect(isRunning({ status: 'EXPIRED', endsAt: null }, NOW)).toBe(false);
  });
});

describe('accessOf', () => {
  const plan = (includesAll: boolean, ...packageIds: string[]) => ({
    plan: { includesAll, packages: packageIds.map((packageId) => ({ packageId })) },
  });

  it('is nothing without a running subscription', () => {
    expect(accessOf([])).toBeNull();
  });

  it('opens everything through a plan that includes all', () => {
    expect(accessOf([plan(true, 'kids')])).toEqual({ all: true, packageIds: [] });
  });

  it('opens the packages of the plan, and of two plans together', () => {
    expect(accessOf([plan(false, 'sports', 'kids')])).toEqual({
      all: false,
      packageIds: ['kids', 'sports'],
    });
    expect(accessOf([plan(false, 'kids'), plan(false, 'kids', 'films')])).toEqual({
      all: false,
      packageIds: ['films', 'kids'],
    });
  });
});

describe('opensTitle', () => {
  it('opens nothing to a viewer without a subscription', () => {
    expect(opensTitle(null, ['kids'])).toBe(false);
    expect(opensTitle(null, [])).toBe(false);
  });

  it('opens every title through a plan that includes all, sorted into a package or not', () => {
    expect(opensTitle({ all: true, packageIds: [] }, [])).toBe(true);
    expect(opensTitle({ all: true, packageIds: [] }, ['kids'])).toBe(true);
  });

  it('opens a title that shares a package with the plan', () => {
    const access = { all: false, packageIds: ['kids', 'films'] };
    expect(opensTitle(access, ['sports', 'films'])).toBe(true);
    expect(opensTitle(access, ['sports'])).toBe(false);
  });

  it('keeps a title in no package for plans that open everything', () => {
    expect(opensTitle({ all: false, packageIds: ['kids'] }, [])).toBe(false);
  });
});
