// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { isLocked, liveHref, neighbour, refusalOf } from './live';
import type { Channel } from './types';

const channel = (slug: string, change: Partial<Channel> = {}): Channel => ({
  slug,
  name: slug,
  number: null,
  description: null,
  access: 'FREE',
  packageIds: [],
  onAir: true,
  ...change,
});

describe('isLocked', () => {
  const paid = channel('cartoons', { access: 'PAID', packageIds: ['kids'] });

  it('never locks a free channel', () => {
    expect(isLocked(channel('news'), null)).toBe(false);
  });

  it('locks a paid channel for those without a plan that opens it', () => {
    expect(isLocked(paid, null)).toBe(true);
    expect(isLocked(paid, { all: false, packageIds: ['sports'] })).toBe(true);
    expect(isLocked(paid, { all: false, packageIds: ['kids'] })).toBe(false);
    expect(isLocked(paid, { all: true, packageIds: [] })).toBe(false);
  });

  it('opens a paid channel in no package only to plans that open everything', () => {
    const unsorted = channel('extra', { access: 'PAID' });
    expect(isLocked(unsorted, { all: false, packageIds: ['kids'] })).toBe(true);
    expect(isLocked(unsorted, { all: true, packageIds: [] })).toBe(false);
  });
});

describe('neighbour', () => {
  const lineup = [channel('one'), channel('two'), channel('three')];

  it('steps through the lineup and goes round at the ends', () => {
    expect(neighbour(lineup, 'one', 1)?.slug).toBe('two');
    expect(neighbour(lineup, 'three', 1)?.slug).toBe('one');
    expect(neighbour(lineup, 'one', -1)?.slug).toBe('three');
  });

  it('has nowhere to go from a single or an unknown channel', () => {
    expect(neighbour([channel('one')], 'one', 1)).toBeNull();
    expect(neighbour(lineup, 'nine', 1)).toBeNull();
  });
});

describe('refusalOf', () => {
  it('tells the ways a channel can be closed apart', () => {
    expect(refusalOf(401, undefined)).toBe('sign-in');
    expect(refusalOf(402, 'subscription_required')).toBe('subscribe');
    expect(refusalOf(402, 'plan_required')).toBe('other-plan');
    expect(refusalOf(403, 'email_unverified')).toBe('confirm-email');
    expect(refusalOf(403, undefined)).toBe('closed');
    expect(refusalOf(409, 'off_air')).toBe('off-air');
    expect(refusalOf(404, undefined)).toBe('gone');
    expect(refusalOf(500, undefined)).toBe('failed');
  });
});

describe('liveHref', () => {
  it('leads to the page that plays a channel', () => {
    expect(liveHref('news-24')).toBe('/live/news-24');
  });
});
