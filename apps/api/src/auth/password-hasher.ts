// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing with scrypt from Node's standard library, so no native
 * module has to be compiled on the servers the product is installed on.
 *
 * Stored format: scrypt$N$r$p$salt$hash, with salt and hash in base64url.
 * The parameters travel with each hash, so they can be raised later without
 * invalidating existing passwords.
 */

interface ScryptParams {
  /** CPU and memory cost. Must be a power of two. */
  N: number;
  /** Block size. */
  r: number;
  /** Parallelization. */
  p: number;
}

/** OWASP-recommended scrypt setting that needs about 32 MB per hash. */
const CURRENT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 3 };

/** Upper limits accepted when verifying, so a tampered hash cannot demand unbounded work. */
const MAX_PARAMS: ScryptParams = { N: 2 ** 20, r: 16, p: 16 };

const SALT_BYTES = 16;
const KEY_BYTES = 32;
const SCHEME = 'scrypt';

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_BYTES,
      { ...params, maxmem: 256 * params.N * params.r },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, CURRENT_PARAMS);
  const { N, r, p } = CURRENT_PARAMS;

  return [SCHEME, N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/**
 * Checks a password against a stored hash.
 * Returns false for a wrong password and for a malformed hash. It never throws for bad input.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== SCHEME) {
    return false;
  }

  const [, nText, rText, pText, saltText, keyText] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const params: ScryptParams = { N: Number(nText), r: Number(rText), p: Number(pText) };

  const validParams =
    Number.isInteger(params.N) &&
    params.N > 1 &&
    (params.N & (params.N - 1)) === 0 &&
    params.N <= MAX_PARAMS.N &&
    Number.isInteger(params.r) &&
    params.r >= 1 &&
    params.r <= MAX_PARAMS.r &&
    Number.isInteger(params.p) &&
    params.p >= 1 &&
    params.p <= MAX_PARAMS.p;
  if (!validParams) {
    return false;
  }

  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(keyText, 'base64url');
  if (salt.length === 0 || expected.length !== KEY_BYTES) {
    return false;
  }

  const actual = await derive(password, salt, params);
  return timingSafeEqual(actual, expected);
}

/** True when a hash was made with weaker parameters than the current ones and should be redone. */
export function needsRehash(stored: string): boolean {
  const [scheme, nText, rText, pText] = stored.split('$');
  return (
    scheme !== SCHEME ||
    Number(nText) !== CURRENT_PARAMS.N ||
    Number(rText) !== CURRENT_PARAMS.r ||
    Number(pText) !== CURRENT_PARAMS.p
  );
}
