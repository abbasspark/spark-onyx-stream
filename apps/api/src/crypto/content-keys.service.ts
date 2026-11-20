// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@onyx/database';
import { SecretBox } from './secret-box.js';

/** AES-128 uses a 16-byte key and a 16-byte initialization vector. */
export const CONTENT_KEY_BYTES = 16;

export interface ContentKey {
  /** The 16 key bytes. Never log or store them in plain form. */
  key: Buffer;
  iv: Buffer;
}

/**
 * Creates and reads the content keys that encrypt an asset's segments.
 *
 * A key exists in plain form only in memory and, while FFmpeg runs, in the
 * job's working directory. In the database it is encrypted with the master key.
 */
@Injectable()
export class ContentKeysService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(SecretBox) private readonly secretBox: SecretBox,
  ) {}

  /** Makes a new random key. It is not stored until {@link replaceOperations} runs. */
  generate(): ContentKey {
    return { key: randomBytes(CONTENT_KEY_BYTES), iv: randomBytes(CONTENT_KEY_BYTES) };
  }

  /**
   * Database operations that make the given key the only key of an asset, or
   * remove its keys when there is none. They belong in the same transaction
   * that records the new outputs, so key and segments always match.
   */
  replaceOperations(
    assetId: string,
    contentKey: ContentKey | null,
  ): Prisma.PrismaPromise<unknown>[] {
    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.encryptionKey.deleteMany({ where: { assetId } }),
    ];
    if (contentKey) {
      operations.push(
        this.prisma.encryptionKey.create({
          data: {
            assetId,
            encryptedKey: new Uint8Array(
              Buffer.from(this.secretBox.encrypt(contentKey.key.toString('hex')), 'utf8'),
            ),
            iv: new Uint8Array(contentKey.iv),
          },
        }),
      );
    }
    return operations;
  }

  /**
   * Reads the current key of an asset.
   *
   * @returns Null when the asset has no key.
   * @throws Error when the key cannot be decrypted, for example after MASTER_KEY changed.
   */
  async find(assetId: string): Promise<ContentKey | null> {
    const row = await this.prisma.encryptionKey.findFirst({
      where: { assetId, retiredAt: null },
      orderBy: { version: 'desc' },
    });
    if (!row) {
      return null;
    }

    const key = Buffer.from(
      this.secretBox.decrypt(Buffer.from(row.encryptedKey).toString('utf8')),
      'hex',
    );
    if (key.length !== CONTENT_KEY_BYTES) {
      throw new Error('The stored content key has the wrong length');
    }
    return { key, iv: Buffer.from(row.iv) };
  }
}
