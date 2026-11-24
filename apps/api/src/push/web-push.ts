// SPDX-License-Identifier: AGPL-3.0-only
import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
} from 'node:crypto';

/**
 * Web Push, as browsers take it: a message encrypted for one browser (RFC
 * 8291, content coding "aes128gcm" of RFC 8188), sent to the push service of
 * its maker with a signature that says who sends (VAPID, RFC 8292).
 *
 * Written here and not taken from a library: it is a page of code on top of
 * what Node brings, and it can then be tested by decrypting what it made.
 */

const CURVE = 'prime256v1';
/** The size of a record. One message is one record, and push services take about 4 KB. */
const RECORD_SIZE = 4096;
/** The most a message may hold before it is encrypted. */
export const MAX_PAYLOAD_BYTES = 3000;
/** How long a signature is good for. Push services refuse more than a day. */
const VAPID_LIFETIME_SECONDS = 12 * 60 * 60;

const b64url = (data: Uint8Array): string => Buffer.from(data).toString('base64url');
const fromB64url = (text: string): Buffer => Buffer.from(text, 'base64url');

export interface VapidKeys {
  /** The uncompressed public point, 65 bytes, as base64url. Browsers subscribe with it. */
  publicKey: string;
  /** The private scalar, 32 bytes, as base64url. */
  privateKey: string;
}

/** The keys of a browser's subscription, as the browser hands them out. */
export interface SubscriptionKeys {
  p256dh: string;
  auth: string;
}

export function generateVapidKeys(): VapidKeys {
  const pair = createECDH(CURVE);
  pair.generateKeys();
  return { publicKey: b64url(pair.getPublicKey()), privateKey: b64url(pair.getPrivateKey()) };
}

/** Whether a text is a public key a browser could have made: an uncompressed point on the curve. */
export function isPublicPoint(text: string): boolean {
  const point = fromB64url(text);
  if (point.length !== 65 || point[0] !== 0x04) {
    return false;
  }
  try {
    // Fails for a point that is not on the curve.
    const probe = createECDH(CURVE);
    probe.generateKeys();
    probe.computeSecret(point);
    return true;
  } catch {
    return false;
  }
}

/**
 * The "Authorization" header that tells a push service who sends: a token
 * signed with the private key, naming the service it is for.
 *
 * @param subject A way to reach the sender: "mailto:…" or an https address.
 */
export function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  now: Date = new Date(),
): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now.getTime() / 1000) + VAPID_LIFETIME_SECONDS,
        sub: subject,
      }),
    ),
  );
  const point = fromB64url(keys.publicKey);
  const key = createPrivateKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: b64url(point.subarray(1, 33)),
      y: b64url(point.subarray(33, 65)),
    },
  });
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

/**
 * A message encrypted for one browser: the body of the request to its push
 * service. Only that browser can read it. The push service carries it and
 * cannot.
 *
 * @param fixed The sender's one-time key and the salt. Only tests give them.
 * @throws RangeError when the message is longer than a push service takes.
 */
export function encryptPayload(
  payload: Uint8Array,
  receiver: SubscriptionKeys,
  fixed?: { privateKey: Buffer; salt: Buffer },
): Buffer {
  if (payload.length > MAX_PAYLOAD_BYTES) {
    throw new RangeError(`A push message holds ${MAX_PAYLOAD_BYTES} bytes at most`);
  }
  const receiverPublic = fromB64url(receiver.p256dh);
  const authSecret = fromB64url(receiver.auth);

  const sender = createECDH(CURVE);
  if (fixed) {
    sender.setPrivateKey(fixed.privateKey);
  } else {
    sender.generateKeys();
  }
  const senderPublic = sender.getPublicKey();
  const salt = fixed?.salt ?? randomBytes(16);
  const shared = sender.computeSecret(receiverPublic);

  // RFC 8291, section 3.4: the shared secret is mixed with the secret of
  // the subscription and both public keys, then with the salt of the message.
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), receiverPublic, senderPublic]);
  const input = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const contentKey = Buffer.from(
    hkdfSync('sha256', input, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', input, salt, Buffer.from('Content-Encoding: nonce\0'), 12),
  );

  const cipher = createCipheriv('aes-128-gcm', contentKey, nonce);
  // 0x02 ends the last record. No padding beyond it.
  const sealed = Buffer.concat([
    cipher.update(Buffer.concat([payload, Buffer.from([0x02])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const head = Buffer.alloc(21);
  salt.copy(head, 0);
  head.writeUInt32BE(RECORD_SIZE, 16);
  head.writeUInt8(senderPublic.length, 20);
  return Buffer.concat([head, senderPublic, sealed]);
}

/**
 * The push services of the browsers. A subscription names the address a
 * message is sent to, and a viewer could name any address: only these are
 * ever sent to.
 */
export const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
] as const;

/**
 * Whether an address is one of a push service: https, and one of the known
 * hosts or below one.
 *
 * @param also More hosts an installation allows. A host with a port, such as
 *   "localhost:9911", also allows plain http there: that is for tests.
 */
export function isPushServiceAddress(address: string, also: readonly string[] = []): boolean {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  if (url.username || url.password) {
    return false;
  }
  if (also.some((host) => host.includes(':') && host.toLowerCase() === url.host.toLowerCase())) {
    return url.protocol === 'https:' || url.protocol === 'http:';
  }
  if (url.protocol !== 'https:' || (url.port !== '' && url.port !== '443')) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return [...PUSH_SERVICE_HOSTS, ...also.filter((entry) => !entry.includes(':'))].some(
    (allowed) => host === allowed.toLowerCase() || host.endsWith(`.${allowed.toLowerCase()}`),
  );
}
