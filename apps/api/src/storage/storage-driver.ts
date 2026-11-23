// SPDX-License-Identifier: AGPL-3.0-only
import type { Readable } from 'node:stream';

/** Thrown when an object that was expected to exist is missing. */
export class StorageObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`Storage object not found: ${key}`);
    this.name = 'StorageObjectNotFoundError';
  }
}

export interface StorageObjectInfo {
  /** Size in bytes. */
  size: number;
  modifiedAt: Date;
}

export interface StorageListEntry extends StorageObjectInfo {
  key: string;
}

/** Byte range, both ends inclusive, as in an HTTP Range header. */
export interface ReadRange {
  start: number;
  end?: number;
}

export interface WriteOptions {
  contentType?: string;
}

/**
 * One place files can be stored: a directory on disk, an S3 bucket, and so on.
 *
 * Keys are relative paths with forward slashes. Implementations validate every
 * key with normalizeStorageKey before using it.
 *
 * This is an extension point: see docs/extension-points.md.
 */
export interface StorageDriver {
  /** Stores an object, replacing any existing one. The write is atomic where the backend allows. */
  write(key: string, data: Readable | Buffer, options?: WriteOptions): Promise<void>;

  /**
   * Opens an object for reading.
   *
   * @throws StorageObjectNotFoundError when the object does not exist.
   */
  read(key: string, range?: ReadRange): Promise<Readable>;

  /** Returns size and modification time, or null when the object does not exist. */
  stat(key: string): Promise<StorageObjectInfo | null>;

  exists(key: string): Promise<boolean>;

  /** Deletes an object. Succeeds when the object is already gone. */
  delete(key: string): Promise<void>;

  /**
   * Deletes every object under a prefix, for example all files of one asset.
   * The prefix is treated as a directory: "assets/abc" matches "assets/abc/x"
   * and not "assets/abcd/x".
   *
   * @returns The number of objects deleted.
   */
  deletePrefix(prefix: string): Promise<number>;

  /** Lists every object under a prefix, with the same directory rule as deletePrefix. */
  list(prefix: string): AsyncIterable<StorageListEntry>;

  /**
   * Lists every object the driver can see. For places that are looked through
   * as a whole, such as a watched folder. Folders of zero bytes that some S3
   * tools create are left out.
   */
  listAll(): AsyncIterable<StorageListEntry>;

  /**
   * Absolute path of the object on this machine, for drivers that store files
   * on a local disk. FFmpeg can then read and write the file directly.
   * Drivers without local files do not implement this method.
   */
  localPath?(key: string): string;

  /** Releases connections. Called when a pool's settings change and on shutdown. */
  close?(): Promise<void>;
}
