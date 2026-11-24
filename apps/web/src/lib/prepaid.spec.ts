// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  describeDays,
  describePreview,
  formatCodeInput,
  isCompleteCode,
  refusalOf,
  strangeLetter,
} from './prepaid';
import { ViewerApiError } from './viewer-api';

describe('formatCodeInput', () => {
  it('writes a code in groups of four', () => {
    expect(formatCodeInput('abcd2345efgh6789')).toBe('ABCD-2345-EFGH-6789');
    expect(formatCodeInput('abcd 2345')).toBe('ABCD-2345');
    expect(formatCodeInput('ab')).toBe('AB');
    expect(formatCodeInput('')).toBe('');
  });

  it('takes a pasted code however it is written', () => {
    expect(formatCodeInput('  abcd-2345 efgh–6789\n')).toBe('ABCD-2345-EFGH-6789');
    expect(formatCodeInput('ABCD2345EFGH6789XXXX')).toBe('ABCD-2345-EFGH-6789');
  });

  it('knows a whole code', () => {
    expect(isCompleteCode('ABCD-2345-EFGH-6789')).toBe(true);
    expect(isCompleteCode('ABCD-2345-EFGH-678')).toBe(false);
  });
});

describe('strangeLetter', () => {
  it('finds a character no code holds', () => {
    expect(strangeLetter('ABCD-2345-EFGH-6789')).toBeNull();
    expect(strangeLetter('ABCD-2345-EFGH-678O')).toBe('O');
    expect(strangeLetter('1BCD')).toBe('1');
  });
});

describe('describePreview', () => {
  const preview = {
    plan: { id: 'p', name: 'Standard' },
    days: 30,
    action: 'start' as const,
    endsAt: '2027-03-04T10:00:00.000Z',
  };

  it('says what a first code starts', () => {
    expect(describePreview(preview)).toBe(
      'It starts the Standard plan for 30 days. You can then watch until 4 March 2027.',
    );
  });

  it('says what a further code adds', () => {
    expect(describePreview({ ...preview, action: 'extend', days: 365 })).toBe(
      'It adds one year to your Standard plan. You can then watch until 4 March 2027.',
    );
    expect(describeDays(1)).toBe('one day');
  });
});

describe('refusalOf', () => {
  const refused = (status: number, code: string, message = 'From the server.') =>
    new ViewerApiError(status, message, {}, code);

  it('explains a code that cannot be used', () => {
    expect(refusalOf(refused(404, 'not_found')).message).toMatch(/not known/);
    expect(refusalOf(refused(409, 'used')).message).toMatch(/works once/);
    expect(refusalOf(refused(410, 'expired')).message).toMatch(/last day/);
    expect(refusalOf(refused(410, 'withdrawn')).message).toMatch(/withdrawn/);
  });

  it('passes on what stands in the way of a good code', () => {
    const answer = refusalOf(refused(409, 'other_plan', 'You are on the Premium plan.'));
    expect(answer).toEqual({ message: 'You are on the Premium plan.', again: false });
  });

  it('keeps other failures short', () => {
    expect(refusalOf(new Error('boom')).message).toMatch(/Something went wrong/);
    expect(refusalOf(new ViewerApiError(429, 'Too many attempts.')).message).toBe(
      'Too many attempts.',
    );
  });
});
