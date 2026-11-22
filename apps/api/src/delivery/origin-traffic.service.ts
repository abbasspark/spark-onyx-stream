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
import { createPlaybackToken } from '../playback/playback-token.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { hourOf } from './edge-state.js';

/** How often the gateway is asked what it sent. */
const POLL_EVERY_MS = 30_000;
export const ORIGIN_POLL_LOCK = 'onyx:origin-traffic:poll';
/** What the gateway said last time, to work out what was sent since. */
const LAST_KEY = 'onyx:origin-traffic:last';
const SUBJECT = 'gateway-stats';
const KINDS = ['video', 'live'] as const;
const KEPT_DAYS = 90;

interface Counted {
  bytes: number;
  requests: number;
}

/** What the gateway has counted since it started. */
export interface GatewayCount {
  /** When the gateway started counting, in milliseconds. */
  since: number;
  video: Counted;
  live: Counted;
}

/**
 * What was sent between two answers of the gateway. A gateway that started
 * again counts from nothing, and then everything it says is new.
 */
export function sentSince(previous: GatewayCount | null, current: GatewayCount): GatewayCount {
  const between = (kind: (typeof KINDS)[number]): Counted => {
    const before = previous?.[kind];
    const now = current[kind];
    const restarted =
      !before ||
      previous.since !== current.since ||
      now.bytes < before.bytes ||
      now.requests < before.requests;
    return restarted
      ? { bytes: now.bytes, requests: now.requests }
      : { bytes: now.bytes - before.bytes, requests: now.requests - before.requests };
  };
  return { since: current.since, video: between('video'), live: between('live') };
}

function isCount(value: unknown): value is GatewayCount {
  const count = value as Partial<GatewayCount> | null;
  const ok = (counted: unknown) =>
    typeof (counted as Counted | undefined)?.bytes === 'number' &&
    typeof (counted as Counted | undefined)?.requests === 'number';
  return typeof count?.since === 'number' && ok(count.video) && ok(count.live);
}

/**
 * Keeps track of what the gateway of the main server sends to viewers itself.
 *
 * The gateway serves media files without the API hearing of it, and counts
 * the bytes as it goes. This asks it every half minute and adds what was sent
 * since to the hour it belongs to. Runs in processes with the scheduler role,
 * one of them at a time.
 */
@Injectable()
export class OriginTrafficService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OriginTrafficService.name);
  private timer: NodeJS.Timeout | undefined;
  private lastProblem = '';
  private prunedAt = 0;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.gatewayInternalUrl) {
      return;
    }
    this.timer = setInterval(() => void this.poll(), POLL_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Asks the gateway once and stores what was sent since the last time. */
  async poll(now: number = Date.now()): Promise<void> {
    const url = this.config.gatewayInternalUrl;
    if (!url) {
      return;
    }
    // Two schedulers would count everything twice.
    const mine = await this.redis.set(ORIGIN_POLL_LOCK, '1', 'PX', POLL_EVERY_MS - 5000, 'NX');
    if (mine !== 'OK') {
      return;
    }
    try {
      const token = createPlaybackToken(
        SUBJECT,
        Math.floor(now / 1000) + 60,
        this.config.playbackSigningSecret,
      );
      const response = await fetch(`${url}/internal/delivery-stats`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(`the gateway answered ${response.status}`);
      }
      const current: unknown = await response.json();
      if (!isCount(current)) {
        throw new Error('the gateway sent figures that cannot be read');
      }
      await this.store(current, now);
      this.lastProblem = '';
    } catch (error) {
      // Said once, not every half minute.
      const problem = String(error instanceof Error ? error.message : error);
      if (problem !== this.lastProblem) {
        this.logger.warn(`Could not read what the gateway delivered: ${problem}`);
      }
      this.lastProblem = problem;
    }
  }

  private async store(current: GatewayCount, now: number): Promise<void> {
    const stored = await this.redis.get(LAST_KEY);
    let previous: GatewayCount | null = null;
    try {
      const parsed: unknown = stored ? JSON.parse(stored) : null;
      previous = isCount(parsed) ? parsed : null;
    } catch {
      previous = null;
    }
    await this.redis.set(LAST_KEY, JSON.stringify(current));

    // The first answer ever has no "since the last time": what the gateway
    // counted before anyone asked could be from any hour.
    if (!previous) {
      return;
    }
    const sent = sentSince(previous, current);
    const hour = hourOf(now);
    for (const kind of KINDS) {
      if (sent[kind].bytes === 0 && sent[kind].requests === 0) {
        continue;
      }
      const amounts = { bytes: BigInt(sent[kind].bytes), requests: BigInt(sent[kind].requests) };
      await this.prisma.originTrafficHour.upsert({
        where: { hour_kind: { hour, kind } },
        create: { hour, kind, ...amounts },
        update: { bytes: { increment: amounts.bytes }, requests: { increment: amounts.requests } },
      });
    }

    if (now - this.prunedAt > 3_600_000) {
      this.prunedAt = now;
      await this.prisma.originTrafficHour.deleteMany({
        where: { hour: { lt: new Date(now - KEPT_DAYS * 86_400_000) } },
      });
    }
  }
}
