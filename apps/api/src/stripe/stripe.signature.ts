// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac, timingSafeEqual } from 'node:crypto';

/** How old a message from Stripe may be. Older ones could be replays. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureProblem = 'missing' | 'malformed' | 'mismatch' | 'too_old';

/** Computes the signature Stripe puts on a message, as lower-case hex. */
export function signPayload(payload: Buffer | string, timestamp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(payload).digest('hex');
}

/** Builds the header Stripe sends. Used by tests and by the fake Stripe. */
export function signatureHeader(
  payload: Buffer | string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  return `t=${timestamp},v1=${signPayload(payload, timestamp, secret)}`;
}

/**
 * Checks that a message was signed by Stripe with the endpoint's secret.
 *
 * The header reads "t=<seconds>,v1=<hex>[,v1=<hex>]": the signature covers the
 * timestamp, a dot and the body exactly as it was received. While a secret is
 * being replaced, Stripe sends one signature per secret, and one match is enough.
 *
 * @param payload The body as received, before any parsing.
 * @returns null when the signature is good, or what is wrong with it.
 */
export function verifySignature(
  payload: Buffer,
  header: string | undefined,
  secret: string,
  now: Date = new Date(),
): SignatureProblem | null {
  if (!header) {
    return 'missing';
  }
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't' && /^\d{1,12}$/.test(value)) {
      timestamp = Number(value);
    } else if (key === 'v1' && /^[0-9a-f]{64}$/.test(value)) {
      signatures.push(value);
    }
  }
  if (timestamp === null || signatures.length === 0) {
    return 'malformed';
  }

  const expected = Buffer.from(signPayload(payload, timestamp, secret), 'hex');
  const matches = signatures.some((signature) =>
    timingSafeEqual(Buffer.from(signature, 'hex'), expected),
  );
  if (!matches) {
    return 'mismatch';
  }
  // Checked after the signature, so only Stripe learns that its clock is off.
  if (Math.abs(now.getTime() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return 'too_old';
  }
  return null;
}
