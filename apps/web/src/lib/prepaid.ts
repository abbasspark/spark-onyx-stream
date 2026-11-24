// SPDX-License-Identifier: AGPL-3.0-only
//
// Prepaid codes: a viewer enters one, and a plan starts or runs longer.
import { formatDate } from './plans';
import { call, ViewerApiError } from './viewer-api';

/** The letters and digits a code is made of: none that looks like another. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 16;

/** What a code would do, or did, for the account. */
export interface CodePreview {
  plan: { id: string; name: string };
  days: number;
  /** "start": the plan begins now. "extend": the days are added to what is running. */
  action: 'start' | 'extend';
  /** Until when the account can watch afterwards. */
  endsAt: string;
}

export const codesApi = {
  /** Says what a code would do, without using it. */
  check: (code: string) => call<CodePreview>('POST', '/codes/check', { code }),
  /** Uses a code. It works once. */
  redeem: (code: string) => call<CodePreview>('POST', '/codes/redeem', { code }),
};

/**
 * What was typed, as codes are printed: capitals in groups of four. Spaces
 * and dashes are dropped, so a pasted code works however it was written.
 */
export function formatCodeInput(text: string): string {
  const letters = [...text.toUpperCase()]
    .filter((letter) => /[A-Z0-9]/.test(letter))
    .slice(0, CODE_LENGTH)
    .join('');
  return letters.match(/.{1,4}/g)?.join('-') ?? '';
}

export function isCompleteCode(text: string): boolean {
  return text.replace(/-/g, '').length === CODE_LENGTH;
}

/**
 * A character of the code that no code holds: the letters and digits that
 * look alike are left out of codes. Null when every character can be right.
 */
export function strangeLetter(text: string): string | null {
  return [...text.replace(/-/g, '')].find((letter) => !CODE_ALPHABET.includes(letter)) ?? null;
}

/** How long a code lets somebody watch, in words. */
export function describeDays(days: number): string {
  if (days === 365) {
    return 'one year';
  }
  return days === 1 ? 'one day' : `${days} days`;
}

/** What a code would do, as a sentence before the viewer says yes. */
export function describePreview(preview: CodePreview): string {
  const until = formatDate(preview.endsAt);
  return preview.action === 'extend'
    ? `It adds ${describeDays(preview.days)} to your ${preview.plan.name} plan. You can then watch until ${until}.`
    : `It starts the ${preview.plan.name} plan for ${describeDays(preview.days)}. You can then watch until ${until}.`;
}

/** Why a code was not taken, in words for the person who typed it. */
export function refusalOf(caught: unknown): { message: string; again: boolean } {
  if (!(caught instanceof ViewerApiError)) {
    return { message: 'Something went wrong. Try again in a moment.', again: true };
  }
  switch (caught.code) {
    case 'not_found':
      return {
        message:
          'This code is not known. Check it against your card: a code has no 0, 1, O, I, L or U.',
        again: true,
      };
    case 'used':
      return { message: 'This code was used already. A code works once.', again: true };
    case 'expired':
      return { message: 'This code can no longer be used: its last day has passed.', again: true };
    case 'withdrawn':
      return {
        message: 'This code was withdrawn and does not work. Ask where you got it for another one.',
        again: true,
      };
    default:
      // The plan that is running stands in the way. The code itself stays good.
      return { message: caught.message, again: caught.status !== 409 };
  }
}
