// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  codeState,
  csvLine,
  endingOf,
  formatCode,
  generateCode,
  hashCode,
  isCodeShaped,
  maskCode,
  normalizeCode,
  planRedemption,
  type RunningSubscription,
} from './code-rules.js';

const now = new Date('2026-12-01T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const code = { planId: 'premium', planName: 'Premium', days: 30 };
const running = (over: Partial<RunningSubscription> = {}): RunningSubscription => ({
  id: 'sub-1',
  planId: 'premium',
  planName: 'Premium',
  source: 'PREPAID',
  endsAt: new Date(now.getTime() + 10 * day),
  ...over,
});

describe('codes', () => {
  it('are sixteen characters that cannot be mistaken for each other', () => {
    expect(CODE_ALPHABET).toHaveLength(30);
    expect(CODE_ALPHABET).not.toMatch(/[01ILOU]/);
    const made = new Set(Array.from({ length: 500 }, generateCode));
    expect(made.size).toBe(500);
    for (const one of made) {
      expect(one).toMatch(/^[2-9A-HJKMNP-TV-Z]{16}$/);
      expect(isCodeShaped(one)).toBe(true);
    }
  });

  it('are read however they are typed', () => {
    expect(normalizeCode(' k7qm-2xhp 9rtd–4wcn ')).toBe('K7QM2XHP9RTD4WCN');
    expect(formatCode('k7qm2xhp9rtd4wcn')).toBe('K7QM-2XHP-9RTD-4WCN');
    expect(hashCode('K7QM-2XHP-9RTD-4WCN')).toBe(hashCode('k7qm 2xhp 9rtd 4wcn'));
    expect(hashCode('K7QM-2XHP-9RTD-4WCN')).toMatch(/^[0-9a-f]{64}$/);
    expect(endingOf('k7qm-2xhp-9rtd-4wcn')).toBe('4WCN');
    expect(maskCode('4WCN')).toBe('••••-••••-••••-4WCN');
  });

  it('are told from what cannot be one', () => {
    expect(isCodeShaped('K7QM-2XHP-9RTD-4WCN')).toBe(true);
    expect(isCodeShaped('K7QM-2XHP-9RTD')).toBe(false);
    expect(isCodeShaped('K7QM-2XHP-9RTD-4WCNX')).toBe(false);
    // O, I, L, 0 and 1 are in no code.
    expect(isCodeShaped('O7QM-2XHP-9RTD-4WCN')).toBe(false);
    expect(isCodeShaped('L7QM-2XHP-9RTD-4WCN')).toBe(false);
    expect(isCodeShaped('')).toBe(false);
  });
});

describe('planRedemption', () => {
  it('starts the plan when nothing is running', () => {
    expect(planRedemption(null, code, now)).toEqual({
      action: 'start',
      subscriptionId: null,
      endsAt: new Date(now.getTime() + 30 * day),
    });
  });

  it('adds the days to the end of the same plan', () => {
    expect(planRedemption(running(), code, now)).toEqual({
      action: 'extend',
      subscriptionId: 'sub-1',
      endsAt: new Date(now.getTime() + 40 * day),
    });
    // Also on top of access an admin granted with an end.
    expect(planRedemption(running({ source: 'MANUAL' }), code, now)).toMatchObject({
      action: 'extend',
    });
  });

  it('refuses, and says when the code can be used, where days cannot be added', () => {
    expect(planRedemption(running({ source: 'STRIPE' }), code, now)).toMatchObject({
      action: 'refuse',
      code: 'subscription_renews',
    });
    expect(planRedemption(running({ source: 'MANUAL', endsAt: null }), code, now)).toMatchObject({
      action: 'refuse',
      code: 'subscription_open',
    });
    const other = planRedemption(running({ planId: 'basic', planName: 'Basic' }), code, now);
    expect(other).toMatchObject({ action: 'refuse', code: 'other_plan' });
    expect(other.action === 'refuse' && other.message).toContain(
      'for Premium, and you have Basic until 2026-12-11',
    );
  });
});

describe('codeState', () => {
  const batch = { voidedAt: null, expiresAt: null };
  const fresh = { redeemedAt: null, voidedAt: null };

  it('says where a code stands, used before anything else', () => {
    expect(codeState(fresh, batch, now)).toBe('unused');
    expect(codeState({ ...fresh, voidedAt: now }, batch, now)).toBe('withdrawn');
    expect(codeState(fresh, { ...batch, voidedAt: now }, now)).toBe('withdrawn');
    expect(codeState(fresh, { ...batch, expiresAt: now }, now)).toBe('expired');
    expect(codeState(fresh, { ...batch, expiresAt: new Date(now.getTime() + 1) }, now)).toBe(
      'unused',
    );
    expect(
      codeState({ redeemedAt: now, voidedAt: now }, { voidedAt: now, expiresAt: now }, now),
    ).toBe('redeemed');
  });
});

describe('csvLine', () => {
  it('quotes what needs it and defuses what a spreadsheet would run', () => {
    expect(csvLine(['K7QM-2XHP', 30, null])).toBe('K7QM-2XHP,30,');
    expect(csvLine(['Kiosk, winter', 'say "hi"'])).toBe('"Kiosk, winter","say ""hi"""');
    expect(csvLine(['=HYPERLINK("http://x")', '+1', '-2', '@a'])).toBe(
      `"'=HYPERLINK(""http://x"")",'+1,'-2,'@a`,
    );
  });
});
