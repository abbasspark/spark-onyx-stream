// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type Asset,
  type Job,
  type JobType,
  type ProcessingMode,
  PrismaClient,
} from '@onyx/database';
import { JobsService } from '../jobs/jobs.service.js';
import { StorageService } from '../storage/storage.service.js';

/** Job types whose failure makes the asset unusable. Thumbnails, for example, are not among them. */
export const ESSENTIAL_JOB_TYPES: readonly JobType[] = ['PROBE', 'REMUX', 'TRANSCODE', 'PACKAGE'];

/** Folder of an asset's generated files inside its storage pool. */
export function outputPrefix(assetId: string): string {
  return `assets/${assetId}`;
}

export interface ReprocessOptions {
  /** Forces a mode. Left out, the mode is chosen again from the probe result. */
  processingMode?: ProcessingMode;
  encodingProfileId?: string;
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
    await this.prisma.asset.updateMany({
      where: { id: assetId, status: 'PROCESSING' },
      data: { status: 'FAILED' },
    });
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
