// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module.js';

const KEY_PREFIX = 'onyx:rate:';

export interface RateLimitRule {
  /** Names the group of endpoints that share one counter, for example "catalog". */
  name: string;
  /** Requests allowed per client within the window. */
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window ends. Zero when the request is allowed. */
  retryAfterSeconds: number;
}

/**
 * Counts requests per client in Redis, in fixed windows.
 *
 * If Redis is unreachable, requests are allowed and a warning is logged:
 * a Redis outage should not take the public site down with it.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Counts one request.
   *
   * @param client What identifies the caller, normally the IP address.
   */
  async hit(rule: RateLimitRule, client: string): Promise<RateLimitResult> {
    // The address is hashed, so the keys in Redis do not list who visited.
    const digest = createHash('sha256').update(client).digest('hex').slice(0, 32);
    const key = `${KEY_PREFIX}${rule.name}:${digest}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, rule.windowSeconds);
      }
      if (count <= rule.limit) {
        return { allowed: true, retryAfterSeconds: 0 };
      }

      const ttl = await this.redis.ttl(key);
      if (ttl < 0) {
        // The counter lost its expiry, for example when the process stopped
        // between the two commands above. Without this it would block for good.
        await this.redis.expire(key, rule.windowSeconds);
      }
      return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : rule.windowSeconds };
    } catch (error) {
      this.logger.warn(`Rate limit skipped, Redis is unreachable: ${(error as Error).message}`);
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }
}
