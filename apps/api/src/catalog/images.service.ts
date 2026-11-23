// SPDX-License-Identifier: AGPL-3.0-only
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { type Image, type ImageKind, PrismaClient } from '@onyx/database';
import { BrandingService } from '../branding/branding.service.js';
import { AppConfig } from '../config/app-config.js';
import { StorageService } from '../storage/storage.service.js';
import { type ImageView, toImageView } from './catalog.views.js';
import { readImageInfo } from './image-size.js';

/** Largest accepted picture. Artwork at 4K is well below this. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Longest accepted side in pixels. Stops pictures that would exhaust a browser's memory. */
export const MAX_IMAGE_SIDE = 8192;

/** Folder of all artwork inside a storage pool. */
const ARTWORK_PREFIX = 'artwork';

export interface ImageFile {
  stream: Readable;
  mimeType: string;
  bytes: number;
}

/** Stores and serves the pictures of the catalog. */
@Injectable()
export class ImagesService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(BrandingService) private readonly branding: BrandingService,
  ) {}

  /**
   * Reads an upload up to the size limit.
   *
   * @throws PayloadTooLargeException as soon as the limit is passed, without reading the rest.
   */
  async readBody(body: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += buffer.length;
      if (total > MAX_IMAGE_BYTES) {
        throw new PayloadTooLargeException(
          `The picture is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
        );
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Checks and stores a picture.
   *
   * The format is recognized from the content. What the client says about
   * the type is ignored, so nothing but a real picture is ever served back.
   */
  async upload(kind: ImageKind, data: Buffer, adminId: string | null): Promise<ImageView> {
    if (data.length === 0) {
      throw new BadRequestException('The upload is empty');
    }
    const info = readImageInfo(data);
    if (!info) {
      throw new BadRequestException('The file is not a JPEG, PNG or WebP picture');
    }
    if (info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE) {
      throw new BadRequestException(
        `The picture is larger than ${MAX_IMAGE_SIDE} by ${MAX_IMAGE_SIDE} pixels`,
      );
    }

    const pool = await this.storage.getDefaultPool();
    const driver = await this.storage.getDriverForPool(pool);

    // The row is created first, so the file name can carry its id.
    const image = await this.prisma.image.create({
      data: {
        kind,
        storagePoolId: pool.id,
        path: '',
        mimeType: info.mimeType,
        width: info.width,
        height: info.height,
        bytes: data.length,
        createdById: adminId,
      },
    });
    const path = `${ARTWORK_PREFIX}/${image.id}.${info.extension}`;

    try {
      await driver.write(path, data, { contentType: info.mimeType });
    } catch (error) {
      await this.prisma.image.delete({ where: { id: image.id } });
      throw error;
    }

    const [stored] = await this.prisma.$transaction([
      this.prisma.image.update({ where: { id: image.id }, data: { path } }),
      this.prisma.storagePool.update({
        where: { id: pool.id },
        data: { usedBytes: { increment: BigInt(data.length) } },
      }),
    ]);
    return toImageView(stored, this.config.mediaBaseUrl);
  }

  /**
   * Opens a stored picture for sending.
   *
   * @returns Null when there is no such picture, so the caller answers 404.
   */
  async open(id: string): Promise<ImageFile | null> {
    const image = await this.prisma.image.findUnique({ where: { id } });
    if (!image || !image.path) {
      return null;
    }
    const driver = await this.storage.getDriver(image.storagePoolId);
    if (!(await driver.exists(image.path))) {
      return null;
    }
    return { stream: await driver.read(image.path), mimeType: image.mimeType, bytes: image.bytes };
  }

  /** Makes sure a picture exists before a title or an episode points to it. */
  async assertExists(id: string): Promise<Image> {
    const image = await this.prisma.image.findUnique({ where: { id } });
    if (!image) {
      throw new BadRequestException('The chosen picture does not exist');
    }
    return image;
  }

  /** Deletes a picture that nothing points to any more. */
  async remove(id: string): Promise<void> {
    const image = await this.prisma.image.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            posterOf: true,
            backdropOf: true,
            logoOf: true,
            stillOf: true,
            seasonPosterOf: true,
            portraitOf: true,
            collectionPosterOf: true,
            collectionBackdropOf: true,
          },
        },
      },
    });
    if (!image) {
      throw new NotFoundException('Picture not found');
    }
    const uses = Object.values(image._count).reduce((total, count) => total + count, 0);
    if (uses > 0 || (await this.branding.usesImage(id))) {
      throw new ConflictException('The picture is still in use');
    }

    const driver = await this.storage.getDriver(image.storagePoolId);
    await driver.delete(image.path);
    await this.prisma.$transaction([
      this.prisma.image.delete({ where: { id } }),
      this.prisma.$executeRaw`
        UPDATE storage_pools
        SET "usedBytes" = GREATEST("usedBytes" - ${BigInt(image.bytes)}, 0)
        WHERE id = ${image.storagePoolId}::uuid`,
    ]);
  }
}
