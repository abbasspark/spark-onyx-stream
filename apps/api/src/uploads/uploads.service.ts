// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { Transform } from 'node:stream';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { type Asset, PrismaClient } from '@onyx/database';
import { FileStore } from '@tus/file-store';
import { Server as TusServer } from '@tus/server';
import { safeSourceFilename } from '../assets/source-filename.js';
import { AuditService } from '../audit/audit.service.js';
import { AppConfig } from '../config/app-config.js';
import { StorageService } from '../storage/storage.service.js';
import { parseUploadMetadata } from './upload-metadata.js';
import { UPLOAD_ENDPOINT } from './uploads.constants.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Attempts to move a finished upload into its storage pool before giving up until the next start. */
const FINALIZE_ATTEMPTS = 3;
const FINALIZE_RETRY_DELAY_MS = 5_000;

/** Abandoned uploads are removed from the temporary directory after this long. */
const UPLOAD_EXPIRY_MS = 48 * 60 * 60 * 1000;

function uploadError(status: HttpStatus, message: string): HttpException {
  return new HttpException({ statusCode: status, message }, status);
}

/**
 * Receives source files with the tus resumable upload protocol.
 *
 * An upload belongs to one asset and uses the asset id as its upload id, so a
 * client can resume with nothing but the asset id. Bytes are collected in a
 * temporary directory on this server. When the last byte has arrived, the file
 * is moved into the asset's storage pool, its checksum is recorded and the
 * asset becomes UPLOADED.
 *
 * The move runs after the client has its answer, because copying a large file
 * to remote storage can take minutes. If the process stops in between, the
 * move is picked up again at the next start.
 */
@Injectable()
export class UploadsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UploadsService.name);
  private readonly store: FileStore;
  private readonly tus: TusServer;
  /** Asset ids whose finished upload is being moved right now. */
  private readonly finalizing = new Set<string>();

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {
    this.store = new FileStore({
      directory: config.uploadTempPath,
      expirationPeriodInMilliseconds: UPLOAD_EXPIRY_MS,
    });

    this.tus = new TusServer({
      path: UPLOAD_ENDPOINT,
      datastore: this.store,
      maxSize: config.uploadMaxBytes,
      // Location headers stay relative, so they are correct behind any proxy or domain.
      relativeLocation: true,
      // Cross-origin access is handled once for the whole API in main.ts.
      allowedOrigins: [...config.corsOrigins],
      // The controller has already validated the metadata, so assetId is present.
      namingFunction: (_request, metadata) => metadata?.assetId ?? '',
      onUploadFinish: async (_request, upload) => {
        void this.finalizeWithRetry(upload.id);
        return {};
      },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await mkdir(this.config.uploadTempPath, { recursive: true });
    void this.recoverFinishedUploads();
  }

  /**
   * Checks a request that starts an upload, before any byte is accepted.
   * Called by the controller for POST requests.
   *
   * @throws HttpException with the reason when the upload must not start.
   */
  async authorizeCreation(headers: IncomingMessage['headers']): Promise<void> {
    const metadataHeader = headers['upload-metadata'];
    const metadata = parseUploadMetadata(
      Array.isArray(metadataHeader) ? metadataHeader.join(',') : metadataHeader,
    );
    if (!metadata) {
      throw uploadError(HttpStatus.BAD_REQUEST, 'The Upload-Metadata header is malformed');
    }

    const { assetId, filename } = metadata;
    if (!assetId || !UUID_PATTERN.test(assetId)) {
      throw uploadError(HttpStatus.BAD_REQUEST, 'Upload-Metadata must contain the assetId');
    }
    if (!filename || filename.trim() === '') {
      throw uploadError(HttpStatus.BAD_REQUEST, 'Upload-Metadata must contain the filename');
    }

    const lengthHeader = headers['upload-length'];
    const length = Number(Array.isArray(lengthHeader) ? lengthHeader[0] : lengthHeader);
    if (!Number.isSafeInteger(length) || length <= 0) {
      throw uploadError(
        HttpStatus.BAD_REQUEST,
        'The Upload-Length header must give the file size in bytes. Uploads of unknown size are not supported',
      );
    }
    if (length > this.config.uploadMaxBytes) {
      throw uploadError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        `The file is larger than the limit of ${this.config.uploadMaxBytes} bytes`,
      );
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { storagePool: true },
    });
    if (!asset || asset.status === 'DELETED') {
      throw uploadError(HttpStatus.NOT_FOUND, 'Asset not found');
    }
    if (asset.status !== 'UPLOADING' || this.finalizing.has(asset.id)) {
      throw uploadError(HttpStatus.CONFLICT, 'This asset already has a source file');
    }

    const pool = asset.storagePool;
    if (!pool.isActive) {
      throw uploadError(HttpStatus.CONFLICT, 'The storage pool of this asset is not active');
    }
    if (pool.quotaBytes !== null && pool.usedBytes + BigInt(length) > pool.quotaBytes) {
      throw uploadError(
        HttpStatus.INSUFFICIENT_STORAGE,
        'The storage pool does not have enough free quota for this file',
      );
    }

    // Kept on the asset now, so the name is known even if the upload is resumed elsewhere.
    await this.prisma.asset.update({
      where: { id: asset.id },
      data: { sourceFilename: filename.slice(0, 255) },
    });
  }

  /**
   * Checks a request that continues, inspects or cancels an upload.
   * The upload id in the URL has to be the id of an asset that still expects its source file.
   */
  async authorizeAccess(uploadId: string): Promise<void> {
    if (!UUID_PATTERN.test(uploadId)) {
      throw uploadError(HttpStatus.NOT_FOUND, 'Upload not found');
    }

    const asset = await this.prisma.asset.findUnique({ where: { id: uploadId } });
    if (!asset || asset.status === 'DELETED') {
      throw uploadError(HttpStatus.NOT_FOUND, 'Upload not found');
    }
    if (asset.status !== 'UPLOADING') {
      throw uploadError(HttpStatus.GONE, 'This upload is already complete');
    }
  }

  /** Hands the request to the tus protocol implementation. */
  handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    return this.tus.handle(request, response);
  }

  /** Removes the collected bytes of an upload, for example when its asset is deleted. */
  async discard(assetId: string): Promise<void> {
    try {
      await this.store.remove(assetId);
    } catch {
      // Nothing was uploaded yet.
    }
  }

  /**
   * Moves a finished upload into the asset's storage pool and marks the asset UPLOADED.
   * Safe to call again for the same asset: a second call does nothing.
   */
  async finalize(assetId: string): Promise<void> {
    if (this.finalizing.has(assetId)) {
      return;
    }
    this.finalizing.add(assetId);

    try {
      const upload = await this.store.getUpload(assetId);
      if (upload.size === undefined || upload.offset !== upload.size) {
        return;
      }

      const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
      if (!asset || asset.status !== 'UPLOADING') {
        // Deleted meanwhile, or already moved by an earlier attempt.
        await this.discard(assetId);
        return;
      }

      const filename = asset.sourceFilename ?? upload.metadata?.filename ?? 'source';
      const key = `sources/${assetId}/${safeSourceFilename(filename)}`;
      const driver = await this.storage.getDriver(asset.storagePoolId);

      const hash = createHash('sha256');
      const hashing = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      const source = createReadStream(path.join(this.config.uploadTempPath, assetId));
      source.on('error', (error) => hashing.destroy(error));

      await driver.write(key, source.pipe(hashing), { contentType: 'application/octet-stream' });
      const checksum = `sha256:${hash.digest('hex')}`;

      await this.markUploaded(asset, key, upload.size, checksum);
      await this.discard(assetId);

      this.logger.log(`Asset ${assetId}: source stored as ${key} (${upload.size} bytes)`);
    } finally {
      this.finalizing.delete(assetId);
    }
  }

  private async markUploaded(
    asset: Asset,
    key: string,
    size: number,
    checksum: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.asset.update({
        where: { id: asset.id },
        data: {
          status: 'UPLOADED',
          sourcePath: key,
          sourceBytes: BigInt(size),
          sourceChecksum: checksum,
        },
      }),
      this.prisma.storagePool.update({
        where: { id: asset.storagePoolId },
        data: { usedBytes: { increment: BigInt(size) } },
      }),
    ]);

    await this.audit.record({
      action: 'asset.upload_complete',
      adminId: asset.createdById,
      entityType: 'Asset',
      entityId: asset.id,
      metadata: { bytes: size, checksum },
    });
  }

  private async finalizeWithRetry(assetId: string): Promise<void> {
    for (let attempt = 1; attempt <= FINALIZE_ATTEMPTS; attempt += 1) {
      try {
        await this.finalize(assetId);
        return;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Asset ${assetId}: could not store the uploaded file (attempt ${attempt} of ${FINALIZE_ATTEMPTS}): ${reason}`,
        );
        if (attempt < FINALIZE_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, FINALIZE_RETRY_DELAY_MS));
        }
      }
    }
    this.logger.error(
      `Asset ${assetId}: the uploaded file stays in ${this.config.uploadTempPath} and is retried at the next start`,
    );
  }

  /** At startup, finishes uploads that were complete when the process last stopped. */
  private async recoverFinishedUploads(): Promise<void> {
    try {
      const expired = await this.store.deleteExpired();
      if (expired > 0) {
        this.logger.log(`Removed ${expired} abandoned upload(s)`);
      }

      const entries = await readdir(this.config.uploadTempPath);
      for (const assetId of entries.filter((entry) => UUID_PATTERN.test(entry))) {
        const upload = await this.store.getUpload(assetId).catch(() => null);
        if (upload && upload.size !== undefined && upload.offset === upload.size) {
          this.logger.log(`Asset ${assetId}: resuming storage of a finished upload`);
          await this.finalizeWithRetry(assetId);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not check for unfinished uploads: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
