// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, randomInt } from 'node:crypto';

/**
 * Prepaid codes: how they are made, read and written, and what using one
 * does to an account.
 *
 * A code is sixteen characters in four groups, "K7QM-2XHP-9RTD-4WCN". The
 * alphabet has no letters or digits that look alike, since codes are read
 * off cards and typed with a remote control: no I, L, O or U, and no 0 or 1.
 * Thirty characters to the sixteenth are about 78 bits, far beyond guessing.
 */

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 16;
const GROUP = 4;

export function generateCode(): string {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * A code as it is compared: capitals, without the spaces and dashes it is
 * written with. A typed O, I or L is in no code and is not guessed at: two
 * characters could be meant, and a wrong guess is a wrong code.
 */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-–—_.]/g, '');
}

/** Whether a text can be a code at all: sixteen characters of the alphabet. */
export function isCodeShaped(raw: string): boolean {
  const code = normalizeCode(raw);
  return code.length === CODE_LENGTH && [...code].every((char) => CODE_ALPHABET.includes(char));
}

/** A code as it is shown and printed: in groups of four. */
export function formatCode(code: string): string {
  return (normalizeCode(code).match(new RegExp(`.{1,${GROUP}}`, 'g')) ?? []).join('-');
}

/** A code with all but its last group hidden, to name it without giving it away. */
export function maskCode(ending: string): string {
  return `••••-••••-••••-${ending}`;
}

export const endingOf = (code: string): string => normalizeCode(code).slice(-GROUP);

/** What a code is found by. The code cannot be read back from it. */
export function hashCode(code: string): string {
  return createHash('sha256')
    .update(`onyx-prepaid\n${normalizeCode(code)}`)
    .digest('hex');
}

/** The most days one code gives, and the most codes one batch holds. */
export const MAX_DAYS = 3650;
export const MAX_BATCH = 5000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What an account has running when a code is used. */
export interface RunningSubscription {
  id: string;
  planId: string;
  planName: string;
  source: 'MANUAL' | 'STRIPE' | 'PREPAID';
  endsAt: Date | null;
}

/** Why a code cannot be used, as a word clients can act on. */
export type RefusalCode =
  | 'not_found'
  | 'used'
  | 'expired'
  | 'withdrawn'
  | 'subscription_renews'
  | 'subscription_open'
  | 'other_plan';

export type RedeemPlan =
  | { action: 'start' | 'extend'; subscriptionId: string | null; endsAt: Date }
  | { action: 'refuse'; code: RefusalCode; message: string };

/**
 * What using a code does for an account.
 *
 * - Nothing running: the plan starts now and runs for the days of the code.
 * - The same plan running with an end: the days are added to that end.
 * - A subscription paid online, access without an end, or another plan: the
 *   code is refused and stays good, with words that say when it can be used.
 */
export function planRedemption(
  running: RunningSubscription | null,
  code: { planId: string; planName: string; days: number },
  now: Date,
): RedeemPlan {
  if (!running) {
    return {
      action: 'start',
      subscriptionId: null,
      endsAt: new Date(now.getTime() + code.days * DAY_MS),
    };
  }
  if (running.source === 'STRIPE') {
    return {
      action: 'refuse',
      code: 'subscription_renews',
      message:
        'You have a subscription that is paid online. The code stays good: use it when that subscription has ended.',
    };
  }
  if (running.endsAt === null) {
    return {
      action: 'refuse',
      code: 'subscription_open',
      message: 'Your access has no end, so there is nothing to add to. The code stays good.',
    };
  }
  if (running.planId !== code.planId) {
    return {
      action: 'refuse',
      code: 'other_plan',
      message: `This code is for ${code.planName}, and you have ${running.planName} until ${running.endsAt.toISOString().slice(0, 10)}. The code stays good: use it after that.`,
    };
  }
  return {
    action: 'extend',
    subscriptionId: running.id,
    // From the end of what is running, never from a moment that has passed.
    endsAt: new Date(Math.max(running.endsAt.getTime(), now.getTime()) + code.days * DAY_MS),
  };
}

/** Where a code stands. */
export type CodeState = 'unused' | 'redeemed' | 'withdrawn' | 'expired';

export function codeState(
  code: { redeemedAt: Date | null; voidedAt: Date | null },
  batch: { voidedAt: Date | null; expiresAt: Date | null },
  now: Date,
): CodeState {
  if (code.redeemedAt) {
    return 'redeemed';
  }
  if (code.voidedAt || batch.voidedAt) {
    return 'withdrawn';
  }
  if (batch.expiresAt && batch.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'unused';
}

/** A line of a file of codes for a spreadsheet. Values that could be read as a formula are defused. */
export function csvLine(values: readonly (string | number | null)[]): string {
  return values
    .map((value) => {
      const text = value === null ? '' : String(value);
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
    })
    .join(',');
}
