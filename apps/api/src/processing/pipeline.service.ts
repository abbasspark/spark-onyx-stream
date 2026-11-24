// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type Asset,
  type Job,
  type JobType,
  type ProcessingMode,
  PrismaClient,
} from '@onyx/database';
import { audioPrefix } from '../audio-tracks/audio-paths.js';
import { JobsService } from '../jobs/jobs.service.js';
import { StorageService } from '../storage/storage.service.js';
import { subtitlePrefix } from '../subtitles/subtitle-paths.js';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service.js';

/** Job types whose failure makes the asset unusable. Thumbnails, for example, are not among them. */
export const ESSENTIAL_JOB_TYPES: readonly JobType[] = ['PROBE', 'REMUX', 'TRANSCODE', 'PACKAGE'];

/** Folder of an asset's uploaded source file inside its storage pool. */
export function sourcePrefix(assetId: string): string {
  return `sources/${assetId}`;
}

/** Folder of an asset's generated files inside its storage pool. */
export function outputPrefix(assetId: string): string {
  return `assets/${assetId}`;
}

export interface ReprocessOptions {
  /** Forces a mode. Left out, the mode is chosen again from the probe result. */
  processingMode?: ProcessingMode;
  encodingProfileId?: string;
  /** Left out, the asset keeps its setting. */
  encryption?: 'NONE' | 'AES_128';
}

/**
 * Moves assets through processing. This service decides which job comes next.
 * The work itself is done by ProcessingSteps in the worker role.
 *
 *   UPLOADED -> PROBE -> REMUX or TRANSCODE -> READY
 *                   \-> THUMBNAILS (in parallel, optional)
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(WebhookDeliveryService) private readonly webhooks: WebhookDeliveryService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  /** Starts processing an asset whose source file is in storage. */
  async start(assetId: string): Promise<void> {
    const updated = await this.prisma.asset.updateMany({
      where: { id: assetId, status: { in: ['UPLOADED', 'READY', 'FAILED'] } },
      data: { status: 'PROCESSING' },
    });
    if (updated.count === 0) {
      throw new ConflictException('The asset cannot be processed in its current state');
    }

    await this.jobs.enqueue({ type: 'PROBE', assetId });
  }

  /**
   * Processes an asset again from its source file, replacing earlier outputs.
   * Used after a failure, or to apply another mode or encoding profile.
   */
  async reprocess(assetId: string, options: ReprocessOptions = {}): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status === 'DELETED') {
      throw new NotFoundException('Asset not found');
    }
    if (!asset.sourcePath) {
      throw new ConflictException('The asset has no source file yet');
    }
    if (asset.status === 'PROCESSING') {
      throw new ConflictException('The asset is being processed. Cancel its jobs first');
    }
    if (options.encodingProfileId) {
      const exists = await this.prisma.encodingProfile.count({
        where: { id: options.encodingProfileId },
      });
      if (exists === 0) {
        throw new NotFoundException('Encoding profile not found');
      }
    }

    await this.removeOutputs(asset);

    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        // Null lets the probe step choose again.
        processingMode: options.processingMode ?? null,
        encodingProfileId: options.encodingProfileId ?? asset.encodingProfileId,
        encryption: options.encryption ?? asset.encryption,
        manifestPath: null,
        readyAt: null,
      },
    });

    await this.start(assetId);
    return { ...updated, status: 'PROCESSING' };
  }

  /**
   * Runs one step again for an asset, as a new job.
   * Retrying an essential step puts a failed asset back into processing.
   */
  async retryJob(type: JobType, assetId: string): Promise<Job> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status === 'DELETED') {
      throw new NotFoundException('The asset of this job no longer exists');
    }

    if (type === 'AUDIO') {
      // Such a job belongs to one track, which a new job of the type would not know.
      throw new ConflictException(
        'Try the track again where the sound of the video is listed, not the job',
      );
    }
    if (ESSENTIAL_JOB_TYPES.includes(type)) {
      if (asset.status === 'PROCESSING') {
        throw new ConflictException('The asset is already being processed');
      }
      await this.prisma.asset.update({ where: { id: assetId }, data: { status: 'PROCESSING' } });
    }

    return this.jobs.enqueue({ type, assetId });
  }

  /** Called by the probe step once the mode is known. */
  async afterProbe(assetId: string, mode: ProcessingMode): Promise<void> {
    if (mode === 'PASSTHROUGH') {
      // The source file is served as it is. There is nothing to produce.
      await this.prisma.asset.update({
        where: { id: assetId },
        data: { status: 'READY', readyAt: new Date() },
      });
      await this.webhooks.announceAsset(assetId);
    } else {
      await this.jobs.enqueue({ type: mode === 'COPY' ? 'REMUX' : 'TRANSCODE', assetId });
    }

    await this.jobs.enqueue({ type: 'THUMBNAILS', assetId });
  }

  /** Called when a job has failed for good or was cancelled. */
  async afterJobStopped(type: JobType, assetId: string | null): Promise<void> {
    if (!assetId || !ESSENTIAL_JOB_TYPES.includes(type)) {
      return;
    }
    const failed = await this.prisma.asset.updateMany({
      where: { id: assetId, status: 'PROCESSING' },
      data: { status: 'FAILED' },
    });
    if (failed.count > 0) {
      await this.webhooks.announceAsset(assetId);
    }
  }

  /**
   * Arranges for the files of a deleted asset to be removed: stops its jobs
   * and queues a cleanup job, unless one is already waiting.
   */
  async scheduleCleanup(assetId: string): Promise<void> {
    const active = await this.prisma.job.findMany({
      where: { assetId, status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true, type: true },
    });

    for (const job of active) {
      if (job.type === 'CLEANUP') {
        continue;
      }
      // A job that ends in this instant can no longer be cancelled, which is fine.
      await this.jobs.cancel(job.id).catch(() => undefined);
    }

    if (!active.some((job) => job.type === 'CLEANUP')) {
      await this.jobs.enqueue({ type: 'CLEANUP', assetId });
    }
  }

  /**
   * Removes every file of a deleted asset, source and outputs, with their
   * records, and gives the space back to the pool. Safe to run more than once.
   *
   * @returns The number of bytes that were freed.
   * @throws Error while another job of the asset is still running, so the caller tries again later.
   */
  async purge(assetId: string): Promise<bigint> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return 0n;
    }
    if (asset.status !== 'DELETED') {
      throw new ConflictException('Only a deleted asset can be cleaned up');
    }

    // A job that still writes would leave files behind after the cleanup.
    const busy = await this.prisma.job.count({
      where: { assetId, status: 'RUNNING', type: { not: 'CLEANUP' } },
    });
    if (busy > 0) {
      throw new Error('Another job of this asset is still stopping');
    }

    const driver = await this.storage.getDriver(asset.storagePoolId);
    let bytes = 0n;
    for (const prefix of [
      outputPrefix(assetId),
      sourcePrefix(assetId),
      subtitlePrefix(assetId),
      audioPrefix(assetId),
    ]) {
      for await (const entry of driver.list(prefix)) {
        bytes += BigInt(entry.size);
      }
      await driver.deletePrefix(prefix);
    }

    await this.prisma.$transaction([
      this.prisma.rendition.deleteMany({ where: { assetId } }),
      this.prisma.thumbnail.deleteMany({ where: { assetId } }),
      this.prisma.subtitleTrack.deleteMany({ where: { assetId } }),
      this.prisma.audioTrack.deleteMany({ where: { assetId } }),
      this.prisma.assetMarker.deleteMany({ where: { assetId } }),
      this.prisma.encryptionKey.deleteMany({ where: { assetId } }),
      // An empty source path marks the asset as cleaned up.
      this.prisma.asset.update({
        where: { id: assetId },
        data: { sourcePath: null, manifestPath: null },
      }),
      this.prisma.$executeRaw`
        UPDATE storage_pools
        SET "usedBytes" = GREATEST("usedBytes" - ${bytes}, 0)
        WHERE id = ${asset.storagePoolId}::uuid`,
    ]);

    this.logger.log(`Asset ${assetId}: removed all files after deletion (${bytes} bytes)`);
    return bytes;
  }

  /** Deletes the generated files and their records, and gives the space back to the pool. */
  private async removeOutputs(asset: Asset): Promise<void> {
    const driver = await this.storage.getDriver(asset.storagePoolId);
    const prefix = outputPrefix(asset.id);

    let bytes = 0n;
    for await (const entry of driver.list(prefix)) {
      bytes += BigInt(entry.size);
    }
    await driver.deletePrefix(prefix);

    await this.prisma.$transaction([
      this.prisma.rendition.deleteMany({ where: { assetId: asset.id } }),
      this.prisma.thumbnail.deleteMany({ where: { assetId: asset.id } }),
      this.prisma.subtitleTrack.deleteMany({ where: { assetId: asset.id, source: 'EMBEDDED' } }),
      // The rows of the sound tracks stay: processing reads from them what an
      // admin said about each, and makes the added ones again from their files.
      this.prisma.audioTrack.updateMany({
        where: { assetId: asset.id, source: 'UPLOADED' },
        data: { status: 'PROCESSING', error: null, sizeBytes: 0 },
      }),
      this.prisma.audioTrack.updateMany({
        where: { assetId: asset.id, source: 'EMBEDDED' },
        data: { sizeBytes: 0 },
      }),
      this.prisma.encryptionKey.deleteMany({ where: { assetId: asset.id } }),
      this.prisma.$executeRaw`
        UPDATE storage_pools
        SET "usedBytes" = GREATEST("usedBytes" - ${bytes}, 0)
        WHERE id = ${asset.storagePoolId}::uuid`,
    ]);

    if (bytes > 0n) {
      this.logger.log(`Asset ${asset.id}: removed earlier outputs (${bytes} bytes)`);
    }
  }
}
