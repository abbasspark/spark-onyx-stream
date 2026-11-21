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
import { PipelineService } from '../processing/pipeline.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

/** How often the repairs run. */
export const SWEEP_INTERVAL_MS = 60_000;
/**
 * Only things that have been waiting this long are repaired, so the sweep
 * never races with a request that is still doing the same work.
 */
export const SWEEP_GRACE_MS = 2 * 60_000;
/** Upper limit per kind and sweep, so a backlog is worked off in steps. */
const SWEEP_BATCH = 50;

const LOCK_KEY = 'onyx:maintenance:sweep';

export interface SweepResult {
  /** Uploaded assets whose processing was started. */
  started: number;
  /** Deleted assets whose cleanup was queued. */
  cleanups: number;
}

/**
 * Periodic repairs, run by the scheduler role. They finish what a request
 * could not, for example because the database or Redis was unreachable for a
 * moment:
 *
 * - an upload that was stored but whose processing never started
 * - a deleted asset whose files are still in storage
 */
/** How long an ended viewer session is kept before it is deleted. */
const KEEP_ENDED_SESSIONS_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MaintenanceService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(PipelineService) private readonly pipeline: PipelineService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.runScheduled(), SWEEP_INTERVAL_MS);
    // The timer alone must not keep a stopping process alive.
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** One timed run. With several scheduler processes, a lock lets only one of them work. */
  private async runScheduled(): Promise<void> {
    try {
      const lockSeconds = Math.floor(SWEEP_INTERVAL_MS / 1000) - 5;
      const acquired = await this.redis.set(LOCK_KEY, String(process.pid), 'EX', lockSeconds, 'NX');
      if (acquired !== 'OK') {
        return;
      }

      await this.purgeEndedViewerSessions();
      await this.purgeExpiredViewerTokens();
      const result = await this.sweep();
      if (result.started > 0 || result.cleanups > 0) {
        this.logger.log(
          `Repaired: started processing of ${result.started} uploads, queued ${result.cleanups} cleanups`,
        );
      }
    } catch (error) {
      this.logger.error(`Sweep failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Deletes viewer sessions that ended or expired a while ago. Viewers sign in
   * on many devices over time, and the table would otherwise only grow.
   *
   * @returns The number of sessions deleted.
   */
  async purgeEndedViewerSessions(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - KEEP_ENDED_SESSIONS_MS);
    const result = await this.prisma.viewerSession.deleteMany({
      where: { OR: [{ expiresAt: { lt: before } }, { revokedAt: { lt: before } }] },
    });
    return result.count;
  }

  /**
   * Deletes links from emails that can no longer be used.
   *
   * @returns The number of links deleted.
   */
  async purgeExpiredViewerTokens(now = new Date()): Promise<number> {
    const result = await this.prisma.viewerToken.deleteMany({ where: { expiresAt: { lt: now } } });
    return result.count;
  }

  /**
   * Runs the repairs once.
   *
   * @param graceMs Minimum age of what is repaired. A parameter so tests need not wait.
   */
  async sweep(graceMs: number = SWEEP_GRACE_MS): Promise<SweepResult> {
    const before = new Date(Date.now() - graceMs);
    const noActiveJob = {
      none: { status: { in: ['QUEUED', 'RUNNING'] as ('QUEUED' | 'RUNNING')[] } },
    };

    const stalled = await this.prisma.asset.findMany({
      where: {
        status: 'UPLOADED',
        sourcePath: { not: null },
        updatedAt: { lt: before },
        jobs: noActiveJob,
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: SWEEP_BATCH,
    });

    let started = 0;
    for (const asset of stalled) {
      try {
        await this.pipeline.start(asset.id);
        started += 1;
      } catch (error) {
        this.logger.warn(`Asset ${asset.id}: processing could not be started: ${String(error)}`);
      }
    }

    const uncleaned = await this.prisma.asset.findMany({
      where: {
        status: 'DELETED',
        deletedAt: { lt: before },
        OR: [
          { sourcePath: { not: null } },
          { renditions: { some: {} } },
          { thumbnails: { some: {} } },
        ],
        jobs: noActiveJob,
      },
      select: { id: true },
      orderBy: { deletedAt: 'asc' },
      take: SWEEP_BATCH,
    });

    let cleanups = 0;
    for (const asset of uncleaned) {
      try {
        await this.pipeline.scheduleCleanup(asset.id);
        cleanups += 1;
      } catch (error) {
        this.logger.warn(`Asset ${asset.id}: cleanup could not be queued: ${String(error)}`);
      }
    }

    return { started, cleanups };
  }
}
