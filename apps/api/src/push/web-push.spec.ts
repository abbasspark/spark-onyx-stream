// SPDX-License-Identifier: AGPL-3.0-only
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  encryptPayload,
  generateVapidKeys,
  isPublicPoint,
  isPushServiceAddress,
  MAX_PAYLOAD_BYTES,
  vapidAuthorization,
} from './web-push.js';

/** A browser: the keys of a subscription, and the reading of what arrives for it. */
function browser() {
  const pair = createECDH('prime256v1');
  pair.generateKeys();
  const auth = Buffer.from('0123456789abcdef');
  return {
    keys: { p256dh: pair.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
    /** Decrypts as RFC 8291 says a browser does. */
    read(body: Buffer): string {
      const salt = body.subarray(0, 16);
      const recordSize = body.readUInt32BE(16);
      const idLength = body.readUInt8(20);
      const senderPublic = body.subarray(21, 21 + idLength);
      const sealed = body.subarray(21 + idLength);
      expect(recordSize).toBe(4096);
      expect(idLength).toBe(65);
      const shared = pair.computeSecret(senderPublic);
      const input = Buffer.from(
        hkdfSync(
          'sha256',
          shared,
          auth,
          Buffer.concat([Buffer.from('WebPush: info\0'), pair.getPublicKey(), senderPublic]),
          32,
        ),
      );
      const key = Buffer.from(
        hkdfSync('sha256', input, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16),
      );
      const nonce = Buffer.from(
        hkdfSync('sha256', input, salt, Buffer.from('Content-Encoding: nonce\0'), 12),
      );
      const decipher = createDecipheriv('aes-128-gcm', key, nonce);
      decipher.setAuthTag(sealed.subarray(sealed.length - 16));
      const plain = Buffer.concat([
        decipher.update(sealed.subarray(0, sealed.length - 16)),
        decipher.final(),
      ]);
      // The last byte that is not zero ends the record.
      expect(plain[plain.length - 1]).toBe(0x02);
      return plain.subarray(0, plain.length - 1).toString('utf8');
    },
  };
}

describe('encryptPayload', () => {
  it('makes a message the browser it is for can read', () => {
    const receiver = browser();
    const message = JSON.stringify({ title: 'Neue Folge: Straße 9', body: 'Jetzt ansehen ✓' });
    const body = encryptPayload(Buffer.from(message), receiver.keys);
    expect(receiver.read(body)).toBe(message);
    // 86 bytes of header, the message, one byte that ends it, and the tag.
    expect(body.length).toBe(86 + Buffer.byteLength(message) + 1 + 16);
  });

  it('cannot be read by another browser', () => {
    const body = encryptPayload(Buffer.from('for one only'), browser().keys);
    expect(() => browser().read(body)).toThrow();
  });

  it('differs every time, and is the same for the same one-time key and salt', () => {
    const receiver = browser();
    const payload = Buffer.from('same words');
    expect(encryptPayload(payload, receiver.keys)).not.toEqual(
      encryptPayload(payload, receiver.keys),
    );
    const once = createECDH('prime256v1');
    once.generateKeys();
    const fixed = { privateKey: once.getPrivateKey(), salt: Buffer.alloc(16, 7) };
    expect(encryptPayload(payload, receiver.keys, fixed)).toEqual(
      encryptPayload(payload, receiver.keys, fixed),
    );
  });

  it('refuses a message longer than a push service takes', () => {
    const receiver = browser();
    expect(() => encryptPayload(Buffer.alloc(MAX_PAYLOAD_BYTES + 1), receiver.keys)).toThrow(
      RangeError,
    );
    expect(encryptPayload(Buffer.alloc(MAX_PAYLOAD_BYTES), receiver.keys).length).toBeLessThan(
      4096,
    );
  });
});

describe('VAPID', () => {
  it('makes keys of the sizes browsers expect', () => {
    const keys = generateVapidKeys();
    expect(Buffer.from(keys.publicKey, 'base64url')).toHaveLength(65);
    expect(Buffer.from(keys.privateKey, 'base64url')).toHaveLength(32);
    expect(isPublicPoint(keys.publicKey)).toBe(true);
    expect(isPublicPoint(keys.privateKey)).toBe(false);
    expect(isPublicPoint(Buffer.alloc(65, 4).toString('base64url'))).toBe(false);
  });

  it('signs a token for the push service of the address, that the public key verifies', () => {
    const keys = generateVapidKeys();
    const now = new Date('2026-12-01T12:00:00Z');
    const header = vapidAuthorization(
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      keys,
      'mailto:ops@example.com',
      now,
    );
    const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head, claims, signature, key] = match as unknown as string[];
    expect(key).toBe(keys.publicKey);
    expect(JSON.parse(Buffer.from(head as string, 'base64url').toString())).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    });
    expect(JSON.parse(Buffer.from(claims as string, 'base64url').toString())).toEqual({
      aud: 'https://updates.push.services.mozilla.com',
      exp: now.getTime() / 1000 + 12 * 3600,
      sub: 'mailto:ops@example.com',
    });
    const point = Buffer.from(keys.publicKey, 'base64url');
    const publicKey = createPublicKey({
      format: 'jwk',
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: point.subarray(1, 33).toString('base64url'),
        y: point.subarray(33).toString('base64url'),
      },
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${head}.${claims}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature as string, 'base64url'),
      ),
    ).toBe(true);
  });
});

describe('isPushServiceAddress', () => {
  it('takes the push services of the browsers, over https', () => {
    for (const address of [
      'https://fcm.googleapis.com/fcm/send/abc:def',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
      'https://db5p.notify.windows.com/w/?token=abc',
      'https://web.push.apple.com/QGbC',
    ]) {
      expect(isPushServiceAddress(address)).toBe(true);
    }
  });

  it('takes nothing else: a viewer cannot make the server call an address of their choice', () => {
    for (const address of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evilfcm.googleapis.com.example/x',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/x',
      'https://internal.service:8443/x',
      'https://fcm.googleapis.com:8443/x',
      'https://user:pw@fcm.googleapis.com/x',
      'ftp://fcm.googleapis.com/x',
      'not an address',
    ]) {
      expect(isPushServiceAddress(address)).toBe(false);
    }
  });

  it('takes more hosts when an installation names them', () => {
    expect(isPushServiceAddress('https://push.example.org/x', ['example.org'])).toBe(true);
    expect(isPushServiceAddress('http://127.0.0.1:9911/x', ['127.0.0.1:9911'])).toBe(true);
    expect(isPushServiceAddress('http://127.0.0.1:9912/x', ['127.0.0.1:9911'])).toBe(false);
  });
});
