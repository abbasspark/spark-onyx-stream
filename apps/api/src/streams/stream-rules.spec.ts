// SPDX-License-Identifier: AGPL-3.0-only
import { devicesPhrase, limitOf, staleBefore, STREAM_TTL_SECONDS } from './stream-rules.js';

describe('limitOf', () => {
  it('follows the installation without a plan, and knows no limit when it has none', () => {
    expect(limitOf(null, [], 0)).toEqual({ limit: null, source: 'SITE' });
    expect(limitOf(null, [], 2)).toEqual({ limit: 2, source: 'SITE' });
  });

  it('takes the limit of the plan over that of the installation', () => {
    expect(limitOf(null, [4], 2)).toEqual({ limit: 4, source: 'PLAN' });
    expect(limitOf(null, [1], 2)).toEqual({ limit: 1, source: 'PLAN' });
    expect(limitOf(null, [1], 0)).toEqual({ limit: 1, source: 'PLAN' });
  });

  it('lets a plan that says nothing follow the installation', () => {
    expect(limitOf(null, [null], 2)).toEqual({ limit: 2, source: 'SITE' });
    expect(limitOf(null, [null], 0)).toEqual({ limit: null, source: 'SITE' });
  });

  it('takes the most generous of several plans', () => {
    expect(limitOf(null, [1, 4], 0)).toEqual({ limit: 4, source: 'PLAN' });
    expect(limitOf(null, [1, null], 3)).toEqual({ limit: 3, source: 'SITE' });
    expect(limitOf(null, [4, null], 3)).toEqual({ limit: 4, source: 'PLAN' });
    expect(limitOf(null, [1, null], 0)).toEqual({ limit: null, source: 'SITE' });
  });

  it('puts what an admin set for the viewer above everything', () => {
    expect(limitOf(6, [1], 2)).toEqual({ limit: 6, source: 'VIEWER' });
    expect(limitOf(1, [null], 0)).toEqual({ limit: 1, source: 'VIEWER' });
  });
});

describe('staleBefore', () => {
  it('lies as far back as a stream may be silent', () => {
    const now = new Date('2026-11-23T12:00:00Z');
    expect(now.getTime() - staleBefore(now).getTime()).toBe(STREAM_TTL_SECONDS * 1000);
  });
});

describe('devicesPhrase', () => {
  it('counts devices', () => {
    expect(devicesPhrase(1)).toBe('on 1 device');
    expect(devicesPhrase(3)).toBe('on 3 devices');
  });
});
