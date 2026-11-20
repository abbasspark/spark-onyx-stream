// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import type { DependencyCheck, HealthReport } from './health.types.js';

/** Upper limit for one dependency check, so a hanging dependency cannot hang the endpoint. */
const CHECK_TIMEOUT_MS = 3_000;

@Injectable()
export class HealthService {
  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([
      this.probe(() => this.prisma.$queryRaw`SELECT 1`),
      this.probe(() => this.redis.ping()),
    ]);

    const allUp = database.status === 'up' && redis.status === 'up';

    return {
      status: allUp ? 'ok' : 'degraded',
      roles: this.config.roles,
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database, redis },
    };
  }

  private async probe(run: () => PromiseLike<unknown>): Promise<DependencyCheck> {
    const startedAt = performance.now();
    let timer: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        run(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Timed out after ${CHECK_TIMEOUT_MS} ms`)),
            CHECK_TIMEOUT_MS,
          );
        }),
      ]);
      return { status: 'up', latencyMs: elapsedSince(startedAt) };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: elapsedSince(startedAt),
        error: this.describe(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Error details can contain host names and credentials, so production gets a fixed text. */
  private describe(error: unknown): string {
    if (this.config.isProduction) {
      return 'Dependency unavailable';
    }
    const message = error instanceof Error ? error.message : String(error);
    // Driver errors span several lines. Collapse them so the JSON stays readable.
    return message.replace(/\s+/g, ' ').trim();
  }
}

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}
