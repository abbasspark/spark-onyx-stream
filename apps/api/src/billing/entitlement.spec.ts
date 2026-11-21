// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { isRunning } from './entitlement.js';

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
