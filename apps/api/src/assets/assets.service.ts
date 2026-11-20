// SPDX-License-Identifier: AGPL-3.0-only
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Asset, type Prisma, PrismaClient } from '@onyx/database';
import { AuditService } from '../audit/audit.service.js';
import type { Principal } from '../auth/principal.js';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import { AppConfig } from '../config/app-config.js';
import { PipelineService } from '../processing/pipeline.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UPLOAD_ENDPOINT } from '../uploads/uploads.constants.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { type AssetView, toAssetView } from './asset.view.js';
import type { CreateAssetInput, ListAssetsInput, UpdateAssetInput } from './assets.schemas.js';

/** What a client needs to upload the source file of a new asset. */
export interface UploadInstructions {
  /** Protocol of the upload endpoint. */
  protocol: 'tus';
  /** Path of the tus endpoint, relative to the API origin. */
  endpoint: string;
  /** Values to send in the Upload-Metadata header. The client adds "filename". */
  metadata: { assetId: string };
  /** Largest accepted file in bytes. */
  maxBytes: number;
}

export interface CreatedAsset {
  asset: AssetView;
  upload: UploadInstructions;
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(PipelineService) private readonly pipeline: PipelineService,
  ) {}

  async list(input: ListAssetsInput): Promise<Page<AssetView>> {
    const where: Prisma.AssetWhereInput = {
      status: input.status ?? { not: 'DELETED' },
      ...(input.q ? { title: { contains: input.q, mode: 'insensitive' } } : {}),
    };

    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(input) }),
      this.prisma.asset.count({ where }),
    ]);

    return toPage(assets.map(toAssetView), total, input);
  }

  async get(id: string): Promise<AssetView> {
    return toAssetView(await this.findOrThrow(id));
  }

  /** Creates the asset record. The source file is uploaded afterwards. */
  async create(
    actor: Principal,
    input: CreateAssetInput,
    ipAddress: string | null,
  ): Promise<CreatedAsset> {
    const pool = input.storagePoolId
      ? await this.prisma.storagePool.findUnique({ where: { id: input.storagePoolId } })
      : await this.storage.getDefaultPool();

    if (!pool) {
      throw new BadRequestException('The storage pool does not exist');
    }
    if (!pool.isActive) {
      throw new BadRequestException('The storage pool is not active');
    }

    const asset = await this.prisma.asset.create({
      data: {
        title: input.title,
        storagePoolId: pool.id,
        createdById: actor.adminId,
        processingMode: input.processingMode,
        p2pEnabled: input.p2pEnabled,
        encryption: input.encryption,
      },
    });

    await this.audit.record({
      action: 'asset.create',
      adminId: actor.adminId,
      entityType: 'Asset',
      entityId: asset.id,
      metadata: { title: asset.title, via: actor.type },
      ipAddress,
    });

    return {
      asset: toAssetView(asset),
      upload: {
        protocol: 'tus',
        endpoint: UPLOAD_ENDPOINT,
        metadata: { assetId: asset.id },
        maxBytes: this.config.uploadMaxBytes,
      },
    };
  }

  async update(
    actor: Principal,
    id: string,
    input: UpdateAssetInput,
    ipAddress: string | null,
  ): Promise<AssetView> {
    await this.findOrThrow(id);

    const asset = await this.prisma.asset.update({
      where: { id },
      data: { title: input.title, p2pEnabled: input.p2pEnabled },
    });

    await this.audit.record({
      action: 'asset.update',
      adminId: actor.adminId,
      entityType: 'Asset',
      entityId: id,
      metadata: {
        changed: Object.entries(input)
          .filter(([, value]) => value !== undefined)
          .map(([field]) => field),
      },
      ipAddress,
    });

    return toAssetView(asset);
  }

  /**
   * Marks the asset as deleted. It disappears from lists and can no longer be
   * played or uploaded to. Its jobs are stopped and a cleanup job removes its
   * files, source included, so deleting cannot be undone.
   */
  async softDelete(actor: Principal, id: string, ipAddress: string | null): Promise<void> {
    const asset = await this.findOrThrow(id);

    await this.prisma.asset.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });

    if (asset.status === 'UPLOADING') {
      // Bytes of an unfinished upload are of no use to anyone and are removed at once.
      await this.uploads.discard(id);
    }

    try {
      await this.pipeline.scheduleCleanup(id);
    } catch (error) {
      // The asset is deleted either way. The scheduler queues the cleanup again later.
      this.logger.error(
        `Asset ${id}: could not queue the cleanup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await this.audit.record({
      action: 'asset.delete',
      adminId: actor.adminId,
      entityType: 'Asset',
      entityId: id,
      metadata: { title: asset.title, previousStatus: asset.status },
      ipAddress,
    });
  }

  /** Finds an asset that is not deleted. */
  private async findOrThrow(id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.status === 'DELETED') {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }
}
