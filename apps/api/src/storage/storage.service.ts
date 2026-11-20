// SPDX-License-Identifier: AGPL-3.0-only
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaClient, type StoragePool } from '@onyx/database';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { AppConfig } from '../config/app-config.js';
import { SecretBox } from '../crypto/secret-box.js';
import { LocalStorageDriver } from './drivers/local.driver.js';
import { S3StorageDriver } from './drivers/s3.driver.js';
import type { StorageDriver } from './storage-driver.js';
import { parseStoredConfig } from './storage-pool.config.js';

/** Name of the pool that is created automatically on a fresh installation. */
export const DEFAULT_LOCAL_POOL_NAME = 'local';

export class StoragePoolUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoragePoolUnavailableError';
  }
}

interface CachedDriver {
  driver: StorageDriver;
  /** updatedAt of the pool row the driver was built from. */
  version: number;
}

/**
 * Gives the rest of the application a StorageDriver for a storage pool.
 * Drivers are created on first use and kept until the pool's settings change.
 */
@Injectable()
export class StorageService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(StorageService.name);
  private readonly drivers = new Map<string, CachedDriver>();

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(SecretBox) private readonly secretBox: SecretBox,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureDefaultPool();
    } catch (error) {
      // The database may still be starting. getDefaultPool tries again on first use.
      this.logger.warn(
        `Could not check the default storage pool at startup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.drivers.values()].map(({ driver }) => driver.close?.()));
    this.drivers.clear();
  }

  /** Creates the default local pool when the installation has no pool at all. */
  async ensureDefaultPool(): Promise<void> {
    if ((await this.prisma.storagePool.count()) > 0) {
      return;
    }

    try {
      await this.prisma.storagePool.create({
        data: {
          name: DEFAULT_LOCAL_POOL_NAME,
          driver: 'LOCAL',
          config: { basePath: this.config.storageLocalPath },
          isDefault: true,
        },
      });
      this.logger.log(`Created default storage pool at ${this.config.storageLocalPath}`);
    } catch (error) {
      // Another process created it at the same moment.
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }

  /** The pool new assets are stored in. */
  async getDefaultPool(): Promise<StoragePool> {
    await this.ensureDefaultPool();

    const pool = await this.prisma.storagePool.findFirst({
      where: { isDefault: true, isActive: true },
    });
    if (!pool) {
      throw new StoragePoolUnavailableError('No active default storage pool is configured');
    }
    return pool;
  }

  /** Returns the driver for a pool by id. */
  async getDriver(poolId: string): Promise<StorageDriver> {
    const pool = await this.prisma.storagePool.findUnique({ where: { id: poolId } });
    if (!pool) {
      throw new StoragePoolUnavailableError(`Storage pool ${poolId} does not exist`);
    }
    return this.getDriverForPool(pool);
  }

  /** Returns the driver for an already loaded pool, reusing the cached one while it is current. */
  async getDriverForPool(pool: StoragePool): Promise<StorageDriver> {
    const version = pool.updatedAt.getTime();
    const cached = this.drivers.get(pool.id);
    if (cached && cached.version === version) {
      return cached.driver;
    }

    if (cached) {
      await cached.driver.close?.();
    }
    const driver = this.createDriver(pool);
    this.drivers.set(pool.id, { driver, version });
    return driver;
  }

  /** Builds a driver without caching it. Used to test settings before they are saved. */
  createDriver(pool: Pick<StoragePool, 'driver' | 'config'>): StorageDriver {
    if (pool.driver === 'LOCAL') {
      return new LocalStorageDriver(parseStoredConfig('LOCAL', pool.config).basePath);
    }

    const config = parseStoredConfig('S3', pool.config);
    return new S3StorageDriver({
      ...config,
      secretAccessKey: this.secretBox.decrypt(config.secretAccessKey),
    });
  }
}
