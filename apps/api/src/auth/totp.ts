// SPDX-License-Identifier: AGPL-3.0-only
//
// Time-based one-time passwords as authenticator apps make them: RFC 6238 on
// top of RFC 4226, with the settings every such app understands (SHA-1, six
// digits, thirty seconds).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Steps before and after the current one whose code is taken: a clock may be half a minute off. */
export const TOTP_WINDOW = 1;
/** Bytes of a new secret. 160 bits, as the RFC recommends for SHA-1. */
const SECRET_BYTES = 20;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Bytes as base32 without padding, the way a secret is typed into an app. */
export function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return bits > 0 ? out + BASE32[(value << (5 - bits)) & 31] : out;
}

/**
 * The other way round. Spaces, hyphens, padding and small letters are fine.
 *
 * @throws Error for anything that is not base32.
 */
export function fromBase32(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) {
      throw new Error('Not a base32 text');
    }
    value = ((value << 5) | index) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new secret, as base32. */
export function generateTotpSecret(): string {
  return toBase32(randomBytes(SECRET_BYTES));
}

/** The time step a moment falls in. */
export function totpStep(now: Date | number = Date.now()): number {
  const ms = typeof now === 'number' ? now : now.getTime();
  return Math.floor(ms / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code of one time step. */
export function totpAt(secret: string, step: number, digits = TOTP_DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', fromBase32(secret)).update(counter).digest();
  const offset = (mac[mac.length - 1] as number) & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Checks a code against a secret.
 *
 * @param afterStep The step of the last code that was accepted. Codes of that
 *   step and before are refused, so a code that was seen cannot be used again.
 * @returns The step the code belongs to, to remember as `afterStep`, or null
 *   when the code is wrong, too old, or was used already.
 */
export function verifyTotp(
  secret: string,
  code: string,
  now: Date | number = Date.now(),
  afterStep: number | null = null,
): number | null {
  const given = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) {
    return null;
  }
  const current = totpStep(now);
  let matched: number | null = null;
  // Every step is tried, whatever matched, so the time taken says nothing.
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step += 1) {
    const expected = totpAt(secret, step);
    const equal = timingSafeEqual(Buffer.from(expected), Buffer.from(given));
    if (equal && (afterStep === null || step > afterStep) && matched === null) {
      matched = step;
    }
  }
  return matched;
}

/**
 * The address an authenticator app reads from a QR code.
 *
 * @param issuer The name of the site, shown in the app above the code.
 * @param account What tells this entry from others of the same site: the email address.
 */
export function otpauthUri(secret: string, issuer: string, account: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** How many recovery codes an admin gets. */
export const RECOVERY_CODE_COUNT = 10;
/** Letters and digits that are not mistaken for each other on paper. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A recovery code: "K7QM-2XHP-9TRD". About 59 bits, far out of reach of guessing. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)]
    .map((group) => group.join(''))
    .join('-');
}

/** A recovery code as it is compared: capitals, nothing but its letters and digits. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** What is stored of a recovery code. */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

/** Whether what was typed has the shape of a code from an app, and not of a recovery code. */
export function looksLikeTotp(code: string): boolean {
  return /^\d{6}$/.test(code.replace(/\s/g, ''));
}
