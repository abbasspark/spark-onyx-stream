// SPDX-License-Identifier: AGPL-3.0-only
import { randomInt } from 'node:crypto';

/**
 * The letters and digits of a code. No vowels, so a code never spells a
 * word, and none of the pairs people mix up when they read from a
 * television across the room: 0 and O, 1 and I and L, 2 and Z, 5 and S, 8 and B.
 */
export const USER_CODE_ALPHABET = 'CDFGHJKMNPQRTVWX34679';
export const USER_CODE_LENGTH = 8;

/** How long a code on a television can be used. */
export const DEVICE_CODE_TTL_MS = 10 * 60 * 1000;
/** How often a device is asked to check whether it was let in, in seconds. */
export const POLL_INTERVAL_SECONDS = 5;
/** A device that asks again sooner than this is told to slow down. */
export const MIN_POLL_GAP_MS = 2000;
/** Codes that are over are kept this long, then cleared out. */
export const KEEP_DEVICE_CODES_MS = 24 * 60 * 60 * 1000;
/** Apps a viewer is remembered on. The ones not used for the longest go first. */
export const MAX_DEVICES = 30;

export function generateUserCode(): string {
  let code = '';
  for (let index = 0; index < USER_CODE_LENGTH; index += 1) {
    code += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  }
  return code;
}

/** "CDFG-HJKM": two groups are easier to read out and to type. */
export function formatUserCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * What a viewer typed, as the code is stored: without spaces and hyphens, in
 * capitals.
 *
 * @returns null for what cannot be a code, so it is not looked up at all.
 */
export function normalizeUserCode(input: string): string | null {
  const code = input.replaceAll(/[\s-]/g, '').toUpperCase();
  if (code.length !== USER_CODE_LENGTH) {
    return null;
  }
  return [...code].every((letter) => USER_CODE_ALPHABET.includes(letter)) ? code : null;
}

/** Where the viewer goes to enter the code, and the same with the code filled in for a QR code. */
export function verificationUrls(
  siteUrl: string,
  userCode: string,
): { url: string; complete: string } {
  const url = `${siteUrl.replace(/\/+$/, '')}/activate`;
  return { url, complete: `${url}?code=${formatUserCode(userCode)}` };
}
