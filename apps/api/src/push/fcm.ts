// SPDX-License-Identifier: AGPL-3.0-only
import { createPrivateKey, sign } from 'node:crypto';

/**
 * Firebase Cloud Messaging, the way apps on Android and iOS are reached.
 * The operator has a Firebase project of their own and gives the key of a
 * service account of it: with that key a short-lived access token is had
 * from Google, and with the token messages are sent.
 */

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const FCM_API = 'https://fcm.googleapis.com';
const TIMEOUT_MS = 10_000;

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  /** PEM. */
  privateKey: string;
  /** Where access tokens are had. */
  tokenUri: string;
}

/**
 * Reads the JSON file Firebase hands out for a service account.
 *
 * @throws Error with a message for the admin when it is not such a file.
 */
export function parseServiceAccount(json: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('This is not JSON. Paste the whole file Firebase gave you.');
  }
  const file = (parsed ?? {}) as Record<string, unknown>;
  const text = (key: string): string => (typeof file[key] === 'string' ? file[key].trim() : '');
  if (file.type !== 'service_account') {
    throw new Error(
      'This is not the key of a service account. In Firebase: Project settings, Service accounts, "Generate new private key".',
    );
  }
  const account = {
    projectId: text('project_id'),
    clientEmail: text('client_email'),
    privateKey: text('private_key'),
    tokenUri: text('token_uri') || 'https://oauth2.googleapis.com/token',
  };
  if (!account.projectId || !account.clientEmail || !account.privateKey) {
    throw new Error('The file lacks project_id, client_email or private_key.');
  }
  try {
    createPrivateKey(account.privateKey);
  } catch {
    throw new Error('The private key in the file cannot be read.');
  }
  return account;
}

const b64url = (data: string | Uint8Array): string => Buffer.from(data).toString('base64url');

/** The signed request for an access token. Good for an hour. */
export function accessTokenAssertion(account: ServiceAccount, now: Date = new Date()): string {
  const issued = Math.floor(now.getTime() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: SCOPE,
      aud: account.tokenUri,
      iat: issued,
      exp: issued + 3600,
    }),
  )}`;
  return `${unsigned}.${b64url(sign('sha256', Buffer.from(unsigned), account.privateKey))}`;
}

export interface FcmMessage {
  title: string;
  body: string;
  /** An absolute address of a picture, or null. */
  image: string | null;
  /** Handed to the app as it is. Values are texts. */
  data: Record<string, string>;
}

export type FcmResult =
  | { status: 'sent' }
  /** The app was removed, or the token is not one: forget the device. */
  | { status: 'gone' }
  /** Try again later. */
  | { status: 'retry'; reason: string }
  /** Nothing a second try would change: the key or the project is wrong. */
  | { status: 'failed'; reason: string };

/** What the answer of FCM to a send means. */
export function readFcmAnswer(status: number, body: string): FcmResult {
  if (status >= 200 && status < 300) {
    return { status: 'sent' };
  }
  const code =
    /"errorCode"\s*:\s*"([A-Z_]+)"/.exec(body)?.[1] ?? /"status"\s*:\s*"([A-Z_]+)"/.exec(body)?.[1];
  if (status === 404 || code === 'UNREGISTERED') {
    return { status: 'gone' };
  }
  // A token that is not a token: nothing will ever be delivered to it.
  if (status === 400 && /registration token|not a valid FCM/i.test(body)) {
    return { status: 'gone' };
  }
  if (status === 429 || status >= 500) {
    return { status: 'retry', reason: `Firebase answered ${status}${code ? ` ${code}` : ''}` };
  }
  return { status: 'failed', reason: `Firebase answered ${status}${code ? ` ${code}` : ''}` };
}

/** Sends through one Firebase project. Keeps its access token until shortly before it runs out. */
export class FcmClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    readonly account: ServiceAccount,
    private readonly api: string = FCM_API,
  ) {}

  /** @throws Error when Google gives no token: the key was revoked, or Google cannot be reached. */
  async accessToken(now: Date = new Date()): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > now.getTime()) {
      return this.token.value;
    }
    const response = await fetch(this.account.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: accessTokenAssertion(this.account, now),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const answer = (await response.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    } | null;
    if (!response.ok || !answer?.access_token) {
      throw new Error(
        `Google gave no access token (${response.status}${
          answer?.error_description ? `: ${answer.error_description}` : ''
        })`,
      );
    }
    this.token = {
      value: answer.access_token,
      expiresAt: now.getTime() + (answer.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }

  async send(deviceToken: string, message: FcmMessage): Promise<FcmResult> {
    let access: string;
    try {
      access = await this.accessToken();
    } catch (error) {
      return { status: 'failed', reason: (error as Error).message };
    }
    try {
      const response = await fetch(
        `${this.api}/v1/projects/${encodeURIComponent(this.account.projectId)}/messages:send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: deviceToken,
              notification: {
                title: message.title,
                body: message.body,
                ...(message.image ? { image: message.image } : {}),
              },
              data: message.data,
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (response.status === 401) {
        // The token was withdrawn before its time: the next send asks for a new one.
        this.token = null;
      }
      return readFcmAnswer(response.status, await response.text().catch(() => ''));
    } catch (error) {
      return {
        status: 'retry',
        reason: `Firebase could not be reached: ${(error as Error).message}`,
      };
    }
  }
}
