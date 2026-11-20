// SPDX-License-Identifier: AGPL-3.0-only

/** Thrown when a storage key could address something outside its pool. */
export class InvalidStorageKeyError extends Error {
  constructor(key: string, reason: string) {
    super(`Invalid storage key "${key}": ${reason}`);
    this.name = 'InvalidStorageKeyError';
  }
}

const MAX_KEY_LENGTH = 1024;

/**
 * Validates a storage key and returns it in canonical form.
 *
 * A key is a relative path with forward slashes, such as
 * "assets/0192.../v/720p/seg-00001.m4s". Every driver runs keys through this
 * function, so a key can never escape the pool through "..", an absolute path
 * or a backslash, whatever the driver does with it afterwards.
 *
 * @throws InvalidStorageKeyError
 */
export function normalizeStorageKey(key: string): string {
  if (key.length === 0) {
    throw new InvalidStorageKeyError(key, 'it is empty');
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new InvalidStorageKeyError(
      key.slice(0, 40),
      `it is longer than ${MAX_KEY_LENGTH} characters`,
    );
  }
  if (key.includes('\0')) {
    throw new InvalidStorageKeyError(key, 'it contains a null byte');
  }
  if (key.includes('\\')) {
    throw new InvalidStorageKeyError(key, 'it contains a backslash');
  }
  if (key.startsWith('/')) {
    throw new InvalidStorageKeyError(key, 'it is an absolute path');
  }
  if (/^[a-zA-Z]:/.test(key)) {
    throw new InvalidStorageKeyError(key, 'it starts with a drive letter');
  }

  const segments = key.split('/');
  // A trailing slash is allowed for prefixes and removed here.
  if (segments[segments.length - 1] === '') {
    segments.pop();
  }

  for (const segment of segments) {
    if (segment === '') {
      throw new InvalidStorageKeyError(key, 'it contains an empty path segment');
    }
    if (segment === '.' || segment === '..') {
      throw new InvalidStorageKeyError(key, 'it contains a "." or ".." segment');
    }
  }

  if (segments.length === 0) {
    throw new InvalidStorageKeyError(key, 'it is empty');
  }

  return segments.join('/');
}
