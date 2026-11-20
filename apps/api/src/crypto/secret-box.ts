// SPDX-License-Identifier: AGPL-3.0-only
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

/**
 * Encrypts small secrets for storage in the database, such as storage
 * credentials and content keys, with AES-256-GCM under the platform master key.
 *
 * Stored format: v1.<iv>.<auth tag>.<ciphertext>, each part in base64url.
 * The version prefix leaves room to change the algorithm or rotate keys later.
 */
export class SecretBox {
  private readonly key: Buffer;

  /** @param masterKeyHex 64 hexadecimal characters (32 bytes). */
  constructor(masterKeyHex: string) {
    if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
      throw new Error('The master key must be 64 hexadecimal characters');
    }
    this.key = Buffer.from(masterKeyHex, 'hex');
    if (this.key.length !== KEY_BYTES) {
      throw new Error('The master key must be 32 bytes');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [VERSION, ...[iv, tag, ciphertext].map((part) => part.toString('base64url'))].join('.');
  }

  /**
   * @throws Error when the value is malformed, was encrypted with another key,
   * or has been modified.
   */
  decrypt(stored: string): string {
    const [version, ivText, tagText, ciphertextText, ...rest] = stored.split('.');
    if (
      version !== VERSION ||
      ivText === undefined ||
      tagText === undefined ||
      ciphertextText === undefined ||
      rest.length > 0
    ) {
      throw new Error('Encrypted value has an unknown format');
    }

    const iv = Buffer.from(ivText, 'base64url');
    const tag = Buffer.from(tagText, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Encrypted value has an unknown format');
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextText, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error(
        'Could not decrypt the value. It was changed, or MASTER_KEY differs from the key it was encrypted with',
      );
    }
  }
}
