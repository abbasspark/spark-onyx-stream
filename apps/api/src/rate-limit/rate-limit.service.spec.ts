// SPDX-License-Identifier: AGPL-3.0-only
import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { RateLimitService } from './rate-limit.service.js';

/** The few Redis commands the service uses, kept in memory. */
class MemoryRedis {
  readonly counters = new Map<string, number>();
  readonly expiries = new Map<string, number>();

  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.expiries.set(key, seconds);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    return this.expiries.get(key) ?? -1;
  }
}

const rule = { name: 'test', limit: 3, windowSeconds: 60 };

describe('RateLimitService', () => {
  it('allows requests up to the limit and refuses the next', async () => {
    const service = new RateLimitService(new MemoryRedis() as unknown as Redis);

    for (let request = 0; request < 3; request += 1) {
      expect(await service.hit(rule, '203.0.113.5')).toEqual({
        allowed: true,
        retryAfterSeconds: 0,
      });
    }
    expect(await service.hit(rule, '203.0.113.5')).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it('counts each client and each rule on its own', async () => {
    const service = new RateLimitService(new MemoryRedis() as unknown as Redis);
    for (let request = 0; request < 4; request += 1) {
      await service.hit(rule, '203.0.113.5');
    }

    expect((await service.hit(rule, '203.0.113.6')).allowed).toBe(true);
    expect((await service.hit({ ...rule, name: 'other' }, '203.0.113.5')).allowed).toBe(true);
  });

  it('does not store the client address', async () => {
    const redis = new MemoryRedis();
    await new RateLimitService(redis as unknown as Redis).hit(rule, '203.0.113.5');

    expect([...redis.counters.keys()].join()).not.toContain('203.0.113.5');
  });

  it('gives a counter that lost its expiry a new one', async () => {
    const redis = new MemoryRedis();
    const service = new RateLimitService(redis as unknown as Redis);
    for (let request = 0; request < 4; request += 1) {
      await service.hit(rule, '203.0.113.5');
    }
    redis.expiries.clear();

    expect(await service.hit(rule, '203.0.113.5')).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(redis.expiries.size).toBe(1);
  });

  it('allows requests while Redis is unreachable', async () => {
    const broken = {
      incr: async () => {
        throw new Error('connection refused');
      },
    };
    const service = new RateLimitService(broken as unknown as Redis);
    // The warning is expected here and would only clutter the test output.
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect((await service.hit(rule, '203.0.113.5')).allowed).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
