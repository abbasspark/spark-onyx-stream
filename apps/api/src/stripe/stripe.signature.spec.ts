// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac } from 'node:crypto';
import { signatureHeader, verifySignature } from './stripe.signature.js';

const SECRET = 'whsec_test_secret';
const BODY = Buffer.from('{"id":"evt_1","type":"customer.subscription.updated"}');
const NOW = new Date('2026-11-21T12:00:00Z');
const T = Math.floor(NOW.getTime() / 1000);

describe('verifySignature', () => {
  it('accepts a message signed the way Stripe documents it', () => {
    // Computed here without the helper under test: HMAC-SHA256 of "<t>.<body>".
    const v1 = createHmac('sha256', SECRET).update(`${T}.${BODY.toString()}`).digest('hex');
    expect(verifySignature(BODY, `t=${T},v1=${v1}`, SECRET, NOW)).toBeNull();
  });

  it('accepts one good signature among several, as while a secret is replaced', () => {
    const good = signatureHeader(BODY, SECRET, T).split(',')[1];
    const header = `t=${T},v1=${'0'.repeat(64)},${good},v0=ignored`;
    expect(verifySignature(BODY, header, SECRET, NOW)).toBeNull();
  });

  it('refuses a missing or unreadable header', () => {
    expect(verifySignature(BODY, undefined, SECRET, NOW)).toBe('missing');
    expect(verifySignature(BODY, '', SECRET, NOW)).toBe('missing');
    expect(verifySignature(BODY, 'nonsense', SECRET, NOW)).toBe('malformed');
    expect(verifySignature(BODY, `t=${T}`, SECRET, NOW)).toBe('malformed');
    expect(verifySignature(BODY, `t=${T},v1=short`, SECRET, NOW)).toBe('malformed');
  });

  it('refuses another secret, a changed body and a changed time', () => {
    const header = signatureHeader(BODY, SECRET, T);
    expect(verifySignature(BODY, signatureHeader(BODY, 'whsec_other', T), SECRET, NOW)).toBe(
      'mismatch',
    );
    expect(verifySignature(Buffer.from(`${BODY.toString()} `), header, SECRET, NOW)).toBe(
      'mismatch',
    );
    expect(verifySignature(BODY, header.replace(`t=${T}`, `t=${T + 1}`), SECRET, NOW)).toBe(
      'mismatch',
    );
  });

  it('refuses a message older than five minutes, which could be a replay', () => {
    expect(verifySignature(BODY, signatureHeader(BODY, SECRET, T - 299), SECRET, NOW)).toBeNull();
    expect(verifySignature(BODY, signatureHeader(BODY, SECRET, T - 301), SECRET, NOW)).toBe(
      'too_old',
    );
    expect(verifySignature(BODY, signatureHeader(BODY, SECRET, T + 301), SECRET, NOW)).toBe(
      'too_old',
    );
  });
});
