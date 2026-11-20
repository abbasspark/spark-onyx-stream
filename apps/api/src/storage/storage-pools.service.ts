// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient, type StoragePool } from '@onyx/database';
import { AuditService } from '../audit/audit.service.js';
import type { AdminPrincipal } from '../auth/principal.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SecretBox } from '../crypto/secret-box.js';
import {
  encryptS3Config,
  type LocalConfig,
  localConfigSchema,
  mergeS3Config,
  parseStoredConfig,
  pointsElsewhere,
  type PublicPoolConfig,
  s3ConfigUpdateSchema,
  type S3StoredConfig,
  toPublicConfig,
} from './storage-pool.config.js';
import type { CreateStoragePoolInput, UpdateStoragePoolInput } from './storage-pools.schemas.js';
import { StorageService } from './storage.service.js';

/** A storage pool as returned by the API. Secrets are never included. */
export interface StoragePoolView {
  id: string;
  name: string;
  driver: StoragePool['driver'];
  config: PublicPoolConfig;
  isDefault: boolean;
  isActive: boolean;
  /** Bytes, as a string because the value can exceed the safe range of a JSON number. Null means unlimited. */
  quotaBytes: string | null;
  /** Bytes, as a string. */
  usedBytes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoragePoolTestResult {
  ok: boolean;
  latencyMs: number;
  /** Present when the test failed. */
  error?: string;
}

/** Upper limit for a connection test, so an unreachable endpoint cannot hang the request. */
const TEST_TIMEOUT_MS = 15_000;
const TEST_FOLDER = '.onyx-connection-test';

function toView(pool: StoragePool): StoragePoolView {
  return {
    id: pool.id,
    name: pool.name,
    driver: pool.driver,
    config: toPublicConfig(pool.driver, pool.config),
    isDefault: pool.isDefault,
    isActive: pool.isActive,
    quotaBytes: pool.quotaBytes?.toString() ?? null,
    usedBytes: pool.usedBytes.toString(),
    createdAt: pool.createdAt,
    updatedAt: pool.updatedAt,
  };
}

@Injectable()
export class StoragePoolsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(SecretBox) private readonly secretBox: SecretBox,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<StoragePoolView[]> {
    const pools = await this.prisma.storagePool.findMany({ orderBy: { createdAt: 'asc' } });
    return pools.map(toView);
  }

  async get(id: string): Promise<StoragePoolView> {
    return toView(await this.findOrThrow(id));
  }

  async create(
    actor: AdminPrincipal,
    input: CreateStoragePoolInput,
    ipAddress: string | null,
  ): Promise<StoragePoolView> {
    const config: LocalConfig | S3StoredConfig =
      input.driver === 'LOCAL' ? input.config : encryptS3Config(input.config, this.secretBox);

    let pool: StoragePool;
    try {
      pool = await this.prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.storagePool.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.storagePool.create({
          data: {
            name: input.name,
            driver: input.driver,
            config,
            isDefault: input.isDefault,
            quotaBytes: input.quotaBytes ?? null,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A storage pool with this name already exists');
      }
      throw error;
    }

    await this.audit.record({
      action: 'storage_pool.create',
      adminId: actor.adminId,
      entityType: 'StoragePool',
      entityId: pool.id,
      metadata: { name: pool.name, driver: pool.driver, isDefault: pool.isDefault },
      ipAddress,
    });

    return toView(pool);
  }

  async update(
    actor: AdminPrincipal,
    id: string,
    input: UpdateStoragePoolInput,
    ipAddress: string | null,
  ): Promise<StoragePoolView> {
    const pool = await this.findOrThrow(id);

    const willBeActive = input.isActive ?? pool.isActive;
    const willBeDefault = input.isDefault ?? pool.isDefault;
    if (willBeDefault && !willBeActive) {
      throw new ConflictException(
        pool.isDefault
          ? 'The default storage pool cannot be deactivated. Make another pool the default first'
          : 'An inactive storage pool cannot be made the default',
      );
    }

    const config = input.config ? await this.changedConfig(pool, input.config) : undefined;

    let updated: StoragePool;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        if (input.isDefault && !pool.isDefault) {
          await tx.storagePool.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.storagePool.update({
          where: { id },
          data: {
            name: input.name,
            isActive: input.isActive,
            isDefault: input.isDefault,
            quotaBytes: input.quotaBytes,
            config: config as Prisma.InputJsonValue | undefined,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A storage pool with this name already exists');
      }
      throw error;
    }

    await this.audit.record({
      action: 'storage_pool.update',
      adminId: actor.adminId,
      entityType: 'StoragePool',
      entityId: id,
      metadata: {
        // Field names only. Setting values, which include credentials, are not logged.
        changed: Object.entries(input)
          .filter(([, value]) => value !== undefined)
          .map(([field]) => field),
        ...(input.config ? { configFields: Object.keys(input.config) } : {}),
      },
      ipAddress,
    });

    return toView(updated);
  }

  /**
   * Checks that the pool is usable by writing a small file, reading it back and deleting it.
   * A failure is returned as a result, not thrown, so the panel can show the reason.
   */
  async test(id: string): Promise<StoragePoolTestResult> {
    const pool = await this.findOrThrow(id);
    const startedAt = performance.now();
    const elapsed = () => Math.round(performance.now() - startedAt);

    // A separate driver, so a hanging test cannot disturb the one in use.
    const driver = this.storage.createDriver(pool);
    const key = `${TEST_FOLDER}/${randomBytes(8).toString('hex')}.txt`;
    const content = Buffer.from(`onyx connection test ${new Date().toISOString()}`);
    let timer: NodeJS.Timeout | undefined;

    const roundTrip = async (): Promise<void> => {
      await driver.write(key, content, { contentType: 'text/plain' });
      const readBack = await buffer(await driver.read(key));
      if (!readBack.equals(content)) {
        throw new Error('The file read back differs from the file written');
      }
      await driver.delete(key);
    };

    try {
      await Promise.race([
        roundTrip(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`No answer within ${TEST_TIMEOUT_MS / 1000} seconds`)),
            TEST_TIMEOUT_MS,
          );
        }),
      ]);
      return { ok: true, latencyMs: elapsed() };
    } catch (error) {
      return {
        ok: false,
        latencyMs: elapsed(),
        error: (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').trim(),
      };
    } finally {
      clearTimeout(timer);
      await driver.close?.();
    }
  }

  /** Validates a config change against the pool's driver and returns the new stored config. */
  private async changedConfig(
    pool: StoragePool,
    change: Record<string, unknown>,
  ): Promise<LocalConfig | S3StoredConfig> {
    const before = parseStoredConfig(pool.driver, pool.config);
    const after =
      pool.driver === 'LOCAL'
        ? new ZodValidationPipe(localConfigSchema).transform(change)
        : mergeS3Config(
            before as S3StoredConfig,
            new ZodValidationPipe(s3ConfigUpdateSchema.strict()).transform(change),
            this.secretBox,
          );

    if (pointsElsewhere(pool.driver, before, after)) {
      const assets = await this.prisma.asset.count({ where: { storagePoolId: pool.id } });
      if (assets > 0) {
        throw new BadRequestException(
          `This pool holds ${assets} asset(s). Changing its location would make their files unreachable. ` +
            'Create a new pool for the new location instead',
        );
      }
    }

    return after;
  }

  private async findOrThrow(id: string): Promise<StoragePool> {
    const pool = await this.prisma.storagePool.findUnique({ where: { id } });
    if (!pool) {
      throw new NotFoundException('Storage pool not found');
    }
    return pool;
  }
}
