// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** How a signing secret starts, so it is recognized in a config file or a leak scan. */
export const SECRET_PREFIX = 'whsec_';

/** The version of the signature scheme, in front of the signature. */
const SCHEME = 'v1';

/** How old a request may be before a receiver should refuse it, in seconds. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function generateWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/**
 * Signs a request: HMAC-SHA256 over "<timestamp>.<body>" with the secret.
 * The timestamp is part of what is signed, so an old request cannot be sent
 * again later under a fresh one.
 *
 * @param timestamp Seconds since 1970, as sent in the header beside it.
 * @returns "v1=<64 hexadecimal characters>"
 */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `${SCHEME}=${mac}`;
}

/**
 * Checks a signature the way a receiver should: in constant time, and with a
 * limit on how old the request may be. Here for the tests, and as the
 * reference for the example in the documentation.
 */
export function verifyWebhook(
  secret: string,
  timestamp: number,
  body: string,
  signature: string,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }
  const expected = Buffer.from(signWebhook(secret, timestamp, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
