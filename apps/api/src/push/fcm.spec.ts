// SPDX-License-Identifier: AGPL-3.0-only
import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { accessTokenAssertion, parseServiceAccount, readFcmAnswer } from './fcm.js';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const file = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'service_account',
    project_id: 'kino-nord',
    client_email: 'push@kino-nord.iam.gserviceaccount.com',
    private_key: privateKey,
    token_uri: 'https://oauth2.googleapis.com/token',
    ...over,
  });

describe('parseServiceAccount', () => {
  it('reads the file Firebase hands out', () => {
    expect(parseServiceAccount(file())).toEqual({
      projectId: 'kino-nord',
      clientEmail: 'push@kino-nord.iam.gserviceaccount.com',
      privateKey: privateKey.trim(),
      tokenUri: 'https://oauth2.googleapis.com/token',
    });
    expect(parseServiceAccount(file({ token_uri: undefined })).tokenUri).toBe(
      'https://oauth2.googleapis.com/token',
    );
  });

  it('says what is wrong with anything else', () => {
    expect(() => parseServiceAccount('{not json')).toThrow('not JSON');
    expect(() => parseServiceAccount(file({ type: 'authorized_user' }))).toThrow(
      'not the key of a service account',
    );
    expect(() => parseServiceAccount(file({ project_id: '' }))).toThrow('lacks project_id');
    expect(() => parseServiceAccount(file({ private_key: 'nonsense' }))).toThrow('cannot be read');
    expect(() => parseServiceAccount('null')).toThrow('not the key of a service account');
  });
});

describe('accessTokenAssertion', () => {
  it('asks for the right to send messages, signed with the key of the account', () => {
    const now = new Date('2026-12-01T12:00:00Z');
    const account = parseServiceAccount(file());
    const [head, claims, signature] = accessTokenAssertion(account, now).split('.') as [
      string,
      string,
      string,
    ];
    expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
      iss: 'push@kino-nord.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now.getTime() / 1000,
      exp: now.getTime() / 1000 + 3600,
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${head}.${claims}`),
        pair.publicKey,
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });
});

describe('readFcmAnswer', () => {
  const error = (status: string, errorCode?: string) =>
    JSON.stringify({
      error: {
        code: 0,
        message: 'x',
        status,
        details: errorCode ? [{ '@type': 'type.googleapis.com/…FcmError', errorCode }] : [],
      },
    });

  it('knows a sent message', () => {
    expect(readFcmAnswer(200, '{"name":"projects/p/messages/1"}')).toEqual({ status: 'sent' });
  });

  it('forgets a device whose app is gone, or whose token is none', () => {
    expect(readFcmAnswer(404, error('NOT_FOUND', 'UNREGISTERED'))).toEqual({ status: 'gone' });
    expect(
      readFcmAnswer(
        400,
        '{"error":{"status":"INVALID_ARGUMENT","message":"The registration token is not a valid FCM registration token"}}',
      ),
    ).toEqual({ status: 'gone' });
  });

  it('tries again when Firebase is busy or down', () => {
    expect(readFcmAnswer(429, error('RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'))).toEqual({
      status: 'retry',
      reason: 'Firebase answered 429 QUOTA_EXCEEDED',
    });
    expect(readFcmAnswer(503, error('UNAVAILABLE')).status).toBe('retry');
  });

  it('gives up where a second try changes nothing', () => {
    expect(readFcmAnswer(403, error('PERMISSION_DENIED', 'SENDER_ID_MISMATCH'))).toEqual({
      status: 'failed',
      reason: 'Firebase answered 403 SENDER_ID_MISMATCH',
    });
    expect(readFcmAnswer(400, error('INVALID_ARGUMENT')).status).toBe('failed');
  });
});
