// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module.js';

/** Failed attempts allowed per email and IP address within the window. */
export const MAX_FAILED_LOGINS = 5;
/** Length of the window, and of the lockout that follows. */
export const LOGIN_WINDOW_SECONDS = 15 * 60;

const KEY_PREFIX = 'onyx:login-failures:';

/**
 * Slows down password guessing by counting failed logins in Redis.
 *
 * If Redis is unreachable, logins are allowed and a warning is logged.
 * Blocking every login during a Redis outage would lock the owner out of
 * their own installation.
 */
@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Seconds until the next attempt is allowed. Zero when not blocked. */
  async retryAfterSeconds(email: string, ipAddress: string | null): Promise<number> {
    try {
      const key = this.key(email, ipAddress);
      const failures = Number((await this.redis.get(key)) ?? 0);
      if (failures < MAX_FAILED_LOGINS) {
        return 0;
      }

      const ttl = await this.redis.ttl(key);
      return ttl > 0 ? ttl : LOGIN_WINDOW_SECONDS;
    } catch (error) {
      this.warn(error);
      return 0;
    }
  }

  async recordFailure(email: string, ipAddress: string | null): Promise<void> {
    try {
      const key = this.key(email, ipAddress);
      const failures = await this.redis.incr(key);
      if (failures === 1) {
        await this.redis.expire(key, LOGIN_WINDOW_SECONDS);
      }
    } catch (error) {
      this.warn(error);
    }
  }

  async reset(email: string, ipAddress: string | null): Promise<void> {
    try {
      await this.redis.del(this.key(email, ipAddress));
    } catch (error) {
      this.warn(error);
    }
  }

  /** Hashed, so email addresses do not appear in Redis key listings. */
  private key(email: string, ipAddress: string | null): string {
    const digest = createHash('sha256')
      .update(`${email}|${ipAddress ?? 'unknown'}`)
      .digest('hex');
    return KEY_PREFIX + digest.slice(0, 32);
  }

  private warn(error: unknown): void {
    this.logger.warn(
      `Login throttling unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
