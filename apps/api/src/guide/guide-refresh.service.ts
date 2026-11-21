// SPDX-License-Identifier: AGPL-3.0-only
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { GuideImportService } from './guide-import.service.js';

/** How often the scheduler looks whether a source is due. */
const CHECK_INTERVAL_MS = 5 * 60_000;
/** Programmes that ended longer ago than this are deleted. */
export const KEEP_ENDED_MS = 2 * 24 * 60 * 60 * 1000;
const LOCK_KEY = 'onyx:guide:refresh';
/** One process works for at most this long before another may take over. */
const LOCK_SECONDS = 15 * 60;

/**
 * Keeps the guide current: imports every enabled source again when its last
 * import is older than GUIDE_REFRESH_HOURS, and deletes programmes that are
 * long over. Runs in processes with the scheduler role.
 */
@Injectable()
export class GuideRefreshService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(GuideRefreshService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(GuideImportService) private readonly importer: GuideImportService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.runScheduled(), CHECK_INTERVAL_MS);
    // The timer alone must not keep a stopping process alive.
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** One timed run. With several scheduler processes, a lock lets only one of them work. */
  private async runScheduled(): Promise<void> {
    try {
      const acquired = await this.redis.set(
        LOCK_KEY,
        String(process.pid),
        'EX',
        LOCK_SECONDS,
        'NX',
      );
      if (acquired !== 'OK') {
        return;
      }
      try {
        await this.refresh();
      } finally {
        await this.redis.del(LOCK_KEY);
      }
    } catch (error) {
      this.logger.warn(`Could not refresh the guide: ${(error as Error).message}`);
    }
  }

  /** Imports the sources that are due and tidies up. Returns how many sources were imported. */
  async refresh(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.guideSource.findMany({
      where: {
        enabled: true,
        OR: [
          { lastRunAt: null },
          { lastRunAt: { lt: new Date(now.getTime() - this.config.guideRefreshMs) } },
        ],
      },
      select: { id: true },
      orderBy: { lastRunAt: { sort: 'asc', nulls: 'first' } },
    });
    for (const source of due) {
      await this.importer.run(source.id);
    }
    await this.prisma.programme.deleteMany({
      where: { endsAt: { lt: new Date(now.getTime() - KEEP_ENDED_MS) } },
    });
    return due.length;
  }
}
