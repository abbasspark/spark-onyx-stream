// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, randomBytes } from 'node:crypto';

/** Prefixes make the two credential types recognizable in logs and secret scanners. */
export const SESSION_TOKEN_PREFIX = 'onyx_sess_';
export const API_KEY_PREFIX = 'onyx_key_';
/** Sessions of viewers. A different prefix, so one can never be taken for an admin's. */
export const VIEWER_TOKEN_PREFIX = 'onyx_view_';

const SECRET_BYTES = 32;
const API_KEY_ID_BYTES = 4;

/** SHA-256 hash in hex. Tokens are high-entropy random values, so a fast hash is sufficient. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface GeneratedSessionToken {
  /** Returned to the client once. Never stored. */
  token: string;
  /** Stored in the database. */
  tokenHash: string;
}

export function generateSessionToken(): GeneratedSessionToken {
  const token = SESSION_TOKEN_PREFIX + randomBytes(SECRET_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

/** Links sent by email. Not a session: it only does the one thing it was sent for. */
export const MAIL_TOKEN_PREFIX = 'onyx_mail_';

export function generateMailToken(): GeneratedSessionToken {
  const token = MAIL_TOKEN_PREFIX + randomBytes(SECRET_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function generateViewerToken(): GeneratedSessionToken {
  const token = VIEWER_TOKEN_PREFIX + randomBytes(SECRET_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export interface GeneratedApiKey {
  /** Returned to the client once. Never stored. */
  key: string;
  /** Short public identifier, stored and shown in the panel so a key can be recognized. */
  prefix: string;
  /** Stored in the database. */
  keyHash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const prefix = API_KEY_PREFIX + randomBytes(API_KEY_ID_BYTES).toString('hex');
  const key = `${prefix}_${randomBytes(SECRET_BYTES).toString('base64url')}`;
  return { key, prefix, keyHash: hashToken(key) };
}

export type CredentialKind = 'session' | 'apiKey';

/** Tells which kind of credential a bearer token is, or null when it is neither. */
export function credentialKind(token: string): CredentialKind | null {
  if (token.startsWith(SESSION_TOKEN_PREFIX)) {
    return 'session';
  }
  if (token.startsWith(API_KEY_PREFIX)) {
    return 'apiKey';
  }
  return null;
}
