// SPDX-License-Identifier: AGPL-3.0-only
import {
  createDecipheriv,
  createECDH,
  type ECDH,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A browser that allowed notifications: its subscription, and what arrived for it. */
export interface FakeBrowser {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  /** The notifications that arrived, decrypted as a browser does. */
  received: Record<string, unknown>[];
  /** Makes the push service answer with this status for this browser, as when the permission was withdrawn. */
  answer: number;
}

export interface FakePush {
  /** For PUSH_SERVICE_HOSTS: the host browsers may name, and where Firebase is. */
  hosts: string;
  /** A service account file as Firebase hands it out, pointing at this server. */
  serviceAccount: string;
  browser(): FakeBrowser;
  /** Messages Firebase was asked to send. */
  fcm: { token: string; notification: Record<string, string>; data: Record<string, string> }[];
  /** How Firebase answers for a registration token. Default: sent. */
  fcmAnswers: Record<string, { status: number; body: unknown }>;
  /** Access tokens Google was asked for. */
  tokenRequests: number;
  /** Makes Google refuse the key of the service account. */
  refuseKey: boolean;
  /** Headers of the last request a push service got. */
  lastHeaders: Record<string, string | string[] | undefined>;
  close(): Promise<void>;
}

/** Reads a message as RFC 8291 says a browser does. */
function decrypt(body: Buffer, pair: ECDH, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const idLength = body.readUInt8(20);
  const senderPublic = body.subarray(21, 21 + idLength);
  const sealed = body.subarray(21 + idLength);
  const input = Buffer.from(
    hkdfSync(
      'sha256',
      pair.computeSecret(senderPublic),
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
  return plain.subarray(0, plain.length - 1).toString('utf8');
}

/**
 * Stands in for the push services of browsers, for Google's token service
 * and for Firebase Cloud Messaging, on one local port.
 */
export async function startFakePush(): Promise<FakePush> {
  const browsers = new Map<string, { pair: ECDH; auth: Buffer; browser: FakeBrowser }>();
  let origin = '';
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 });

  const fake: FakePush = {
    hosts: '',
    serviceAccount: '',
    fcm: [],
    fcmAnswers: {},
    tokenRequests: 0,
    refuseKey: false,
    lastHeaders: {},
    browser() {
      const id = randomBytes(8).toString('hex');
      const pair = createECDH('prime256v1');
      pair.generateKeys();
      const auth = randomBytes(16);
      const browser: FakeBrowser = {
        subscription: {
          endpoint: `${origin}/wp/${id}`,
          keys: {
            p256dh: pair.getPublicKey().toString('base64url'),
            auth: auth.toString('base64url'),
          },
        },
        received: [],
        answer: 201,
      };
      browsers.set(id, { pair, auth, browser });
      return browser;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      const path = request.url ?? '';
      const json = (status: number, value: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(value));
      };
      if (path === '/token') {
        fake.tokenRequests += 1;
        return fake.refuseKey
          ? json(400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' })
          : json(200, { access_token: `access-${fake.tokenRequests}`, expires_in: 3600 });
      }
      if (path.startsWith('/v1/projects/')) {
        const message = (JSON.parse(body.toString()) as { message: (typeof fake.fcm)[number] })
          .message;
        const answer = fake.fcmAnswers[message.token];
        if (answer) {
          return json(answer.status, answer.body);
        }
        fake.fcm.push(message);
        return json(200, { name: 'projects/test/messages/1' });
      }
      const entry = browsers.get(path.replace('/wp/', ''));
      if (!entry) {
        return json(404, {});
      }
      fake.lastHeaders = request.headers;
      if (entry.browser.answer >= 200 && entry.browser.answer < 300) {
        entry.browser.received.push(
          JSON.parse(decrypt(body, entry.pair, entry.auth)) as Record<string, unknown>,
        );
      }
      response.writeHead(entry.browser.answer);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
  fake.hosts = `127.0.0.1:${port},fcm=${origin}`;
  fake.serviceAccount = JSON.stringify({
    type: 'service_account',
    project_id: 'test',
    client_email: 'push@test.iam.gserviceaccount.com',
    private_key: key.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    token_uri: `${origin}/token`,
  });
  return fake;
}
