// SPDX-License-Identifier: AGPL-3.0-only
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  paginateListObjectsV2,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  type ReadRange,
  type StorageDriver,
  type StorageListEntry,
  type StorageObjectInfo,
  StorageObjectNotFoundError,
  type WriteOptions,
} from '../storage-driver.js';
import { normalizeStorageKey } from '../storage-key.js';

export interface S3DriverOptions {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Custom endpoint for S3-compatible services. Omit for AWS. */
  endpoint?: string;
  /** Address the bucket as a path instead of a subdomain. Most self-hosted services need this. */
  forcePathStyle?: boolean;
  /** Folder inside the bucket that holds this pool, without leading or trailing slash. */
  keyPrefix?: string;
}

/** S3 deletes at most this many objects per request. */
const DELETE_BATCH_SIZE = 1000;

function isNotFound(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } } | undefined;
  return (
    candidate?.name === 'NotFound' ||
    candidate?.name === 'NoSuchKey' ||
    candidate?.$metadata?.httpStatusCode === 404
  );
}

/** Stores objects in an S3 bucket or any service that speaks the S3 API. */
export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly keyPrefix: string;

  constructor(options: S3DriverOptions) {
    this.bucket = options.bucket;
    this.keyPrefix = options.keyPrefix ? `${normalizeStorageKey(options.keyPrefix)}/` : '';
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle ?? false,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      // Newer SDK versions add checksums to every request by default. Several
      // S3-compatible services reject them, so they are sent only when required.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  private objectKey(key: string): string {
    return this.keyPrefix + normalizeStorageKey(key);
  }

  async write(key: string, data: Readable | Buffer, options?: WriteOptions): Promise<void> {
    // Upload switches to multipart for large streams, so the size need not be known in advance.
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: data,
        ContentType: options?.contentType,
      },
    });
    await upload.done();
  }

  async read(key: string, range?: ReadRange): Promise<Readable> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(key),
          Range: range ? `bytes=${range.start}-${range.end ?? ''}` : undefined,
        }),
      );
      if (!response.Body) {
        throw new StorageObjectNotFoundError(key);
      }
      return response.Body as Readable;
    } catch (error) {
      if (isNotFound(error)) {
        throw new StorageObjectNotFoundError(key);
      }
      throw error;
    }
  }

  async stat(key: string): Promise<StorageObjectInfo | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
      );
      return {
        size: response.ContentLength ?? 0,
        modifiedAt: response.LastModified ?? new Date(0),
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.stat(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    // S3 reports success for a key that does not exist, which matches the contract.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
    );
  }

  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let batch: string[] = [];

    const flush = async (): Promise<void> => {
      if (batch.length === 0) {
        return;
      }
      const response = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((key) => ({ Key: this.objectKey(key) })), Quiet: true },
        }),
      );
      const failed = response.Errors ?? [];
      if (failed.length > 0) {
        throw new Error(
          `Could not delete ${failed.length} object(s) under "${prefix}": ${failed[0]?.Message ?? 'unknown error'}`,
        );
      }
      deleted += batch.length;
      batch = [];
    };

    for await (const entry of this.list(prefix)) {
      batch.push(entry.key);
      if (batch.length === DELETE_BATCH_SIZE) {
        await flush();
      }
    }
    await flush();

    return deleted;
  }

  async *list(prefix: string): AsyncIterable<StorageListEntry> {
    // The trailing slash makes "assets/abc" match "assets/abc/x" and not "assets/abcd/x".
    yield* this.listUnder(`${this.objectKey(prefix)}/`);
  }

  async *listAll(): AsyncIterable<StorageListEntry> {
    for await (const entry of this.listUnder(this.keyPrefix)) {
      // Some tools mark folders with an empty object whose name ends in a slash.
      if (entry.key !== '' && !entry.key.endsWith('/')) {
        yield entry;
      }
    }
  }

  private async *listUnder(objectPrefix: string): AsyncIterable<StorageListEntry> {
    const pages = paginateListObjectsV2(
      { client: this.client },
      { Bucket: this.bucket, Prefix: objectPrefix },
    );

    for await (const page of pages) {
      for (const object of page.Contents ?? []) {
        if (!object.Key) {
          continue;
        }
        yield {
          key: object.Key.slice(this.keyPrefix.length),
          size: object.Size ?? 0,
          modifiedAt: object.LastModified ?? new Date(0),
        };
      }
    }
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}
