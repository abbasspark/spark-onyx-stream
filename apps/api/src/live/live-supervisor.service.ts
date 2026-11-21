// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { rm } from 'node:fs/promises';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { type ChannelMode, PrismaClient } from '@onyx/database';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config.js';
import { SecretBox } from '../crypto/secret-box.js';
import { EventPublisher } from '../events/event-publisher.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { ChannelRunner, type RunnerState } from './channel-runner.js';
import { FfmpegLiveEngine } from './ffmpeg-live-engine.js';
import { measureBitrate } from './live-playlist.js';
import { parseSource } from './live-source.js';
import {
  channelDirectory,
  type ChannelHealth,
  healthKey,
  LEASE_MS,
  LIVE_NUDGE_CHANNEL,
  lockKey,
  RECONCILE_MS,
} from './live-state.js';

interface Running {
  runner: ChannelRunner;
  /** What the channel looked like when the runner started. A change means a restart. */
  sourceEncrypted: string;
  restartToken: number;
}

/**
 * Keeps the enabled channels running. Runs in processes with the live role.
 *
 * The database says which channels should run. Every two seconds, and at once
 * when an admin changes something, this service compares that with the
 * processes it has and starts or stops what differs. Nothing is remembered
 * between restarts of the process: after a crash it starts the channels again.
 *
 * With several live processes, a lock in Redis decides who runs a channel.
 * When a process dies, its locks run out and another one takes over.
 */
@Injectable()
export class LiveSupervisorService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(LiveSupervisorService.name);
  private readonly node = `${hostname()}:${randomUUID().slice(0, 8)}`;
  private readonly running = new Map<string, Running>();
  private timer: NodeJS.Timeout | null = null;
  private subscriber: Redis | null = null;
  private busy = false;
  private again = false;
  private closing = false;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(SecretBox) private readonly secrets: SecretBox,
    @Inject(EventPublisher) private readonly events: EventPublisher,
    @Inject(FfmpegLiveEngine) private readonly engine: FfmpegLiveEngine,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.reconcile(), RECONCILE_MS);
    this.listen();
    void this.reconcile();
  }

  async onApplicationShutdown(): Promise<void> {
    this.closing = true;
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.subscriber?.disconnect();
    // The channels stay enabled: another live process, or this one after a restart, runs them.
    await Promise.all([...this.running.keys()].map((id) => this.halt(id)));
  }

  /** Channels this process runs right now. */
  runningIds(): string[] {
    return [...this.running.keys()];
  }

  /**
   * Starts and stops processes until they match the database. Calls that
   * arrive while one is at work are folded into one more pass.
   */
  async reconcile(): Promise<void> {
    if (this.closing) {
      return;
    }
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    try {
      do {
        this.again = false;
        await this.pass();
      } while (this.again && !this.closing);
    } catch (error) {
      // Running channels are left alone: a database or Redis that is away for a moment must not stop playback.
      this.logger.warn(`Could not check the channels: ${(error as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private async pass(): Promise<void> {
    const wanted = await this.prisma.channel.findMany({
      where: { enabled: true },
      select: {
        id: true,
        name: true,
        sourceEncrypted: true,
        restartToken: true,
        mode: true,
        qualities: true,
      },
    });
    const byId = new Map(wanted.map((channel) => [channel.id, channel]));

    for (const [id, running] of this.running) {
      const channel = byId.get(id);
      if (!channel) {
        await this.halt(id);
        await this.markStopped(id);
      } else if (
        channel.sourceEncrypted !== running.sourceEncrypted ||
        channel.restartToken !== running.restartToken
      ) {
        await this.halt(id);
      } else if (!(await this.renew(id))) {
        this.logger.warn(`Another live process runs channel ${id}. Stopping it here`);
        await this.halt(id, false);
      }
    }

    for (const channel of wanted) {
      if (this.closing) {
        return;
      }
      if (!this.running.has(channel.id) && (await this.acquire(channel.id))) {
        this.launch(channel);
      }
    }

    await Promise.all([...this.running].map(([id, running]) => this.report(id, running.runner)));
  }

  private launch(channel: {
    id: string;
    name: string;
    sourceEncrypted: string;
    restartToken: number;
    mode: ChannelMode;
    qualities: number[];
  }): void {
    let runner: ChannelRunner;
    try {
      runner = new ChannelRunner({
        source: parseSource(this.secrets.decrypt(channel.sourceEncrypted)),
        directory: channelDirectory(this.config.live.path, channel.id),
        processing: { mode: channel.mode, qualities: channel.qualities },
        preset: this.config.live.transcodePreset,
        segmentSeconds: this.config.live.segmentSeconds,
        playlistSegments: this.config.live.playlistSegments,
        engine: this.engine,
        onState: (state) => void this.save(channel.id, runner, state),
      });
    } catch (error) {
      // A source that cannot be decrypted or read needs an admin, not another attempt.
      void this.fail(channel.id, (error as Error).message);
      return;
    }

    this.running.set(channel.id, {
      runner,
      sourceEncrypted: channel.sourceEncrypted,
      restartToken: channel.restartToken,
    });
    this.logger.log(`Starting channel "${channel.name}"`);
    runner.start();
  }

  /** Stops the process of a channel and gives the channel up. */
  private async halt(id: string, release = true): Promise<void> {
    const running = this.running.get(id);
    if (!running) {
      return;
    }
    this.running.delete(id);
    await running.runner.stop();
    await rm(channelDirectory(this.config.live.path, id), { recursive: true, force: true }).catch(
      () => undefined,
    );
    if (release) {
      await this.redis.del(lockKey(id), healthKey(id)).catch(() => undefined);
    }
  }

  private async save(id: string, runner: ChannelRunner, state: RunnerState): Promise<void> {
    // A runner that was replaced or stopped has nothing to say any more.
    if (this.running.get(id)?.runner !== runner) {
      return;
    }
    try {
      await this.prisma.channel.updateMany({
        where: { id, enabled: true },
        data: {
          status: state.status,
          statusMessage: state.message,
          startedAt: state.startedAt,
          restartCount: state.restartCount,
          ...state.streams,
        },
      });
      await this.report(id, runner);
      this.events.publish({ type: 'channel', channelId: id, change: 'status' });
    } catch (error) {
      this.logger.warn(`Could not save the state of channel ${id}: ${(error as Error).message}`);
    }
  }

  private async fail(id: string, message: string): Promise<void> {
    await this.prisma.channel
      .updateMany({
        where: { id, enabled: true },
        data: { status: 'FAILED', statusMessage: message, startedAt: null },
      })
      .catch(() => undefined);
    await this.redis.del(lockKey(id)).catch(() => undefined);
    await this.redis
      .set(
        healthKey(id),
        JSON.stringify({
          node: this.node,
          at: Date.now(),
          pid: null,
          bitrate: null,
          speed: null,
          lastDataAt: null,
          log: [message],
        } satisfies ChannelHealth),
        'PX',
        LEASE_MS,
      )
      .catch(() => undefined);
  }

  private async markStopped(id: string): Promise<void> {
    await this.prisma.channel.updateMany({
      where: { id, enabled: false },
      data: { status: 'STOPPED', statusMessage: null, startedAt: null },
    });
    this.events.publish({ type: 'channel', channelId: id, change: 'status' });
  }

  private async report(id: string, runner: ChannelRunner): Promise<void> {
    const health: ChannelHealth = {
      node: this.node,
      at: Date.now(),
      bitrate: await measureBitrate(channelDirectory(this.config.live.path, id)),
      ...runner.snapshot(),
    };
    await this.redis.set(healthKey(id), JSON.stringify(health), 'PX', LEASE_MS);
  }

  private async acquire(id: string): Promise<boolean> {
    return (await this.redis.set(lockKey(id), this.node, 'PX', LEASE_MS, 'NX')) === 'OK';
  }

  /** Extends the lock of a channel. False when another process holds it. */
  private async renew(id: string): Promise<boolean> {
    const holder = await this.redis.get(lockKey(id));
    if (holder === null) {
      return this.acquire(id);
    }
    if (holder !== this.node) {
      return false;
    }
    await this.redis.pexpire(lockKey(id), LEASE_MS);
    return true;
  }

  private listen(): void {
    try {
      // A connection that subscribes cannot send commands, so it gets its own.
      this.subscriber = this.redis.duplicate();
      this.subscriber.on('error', () => undefined);
      this.subscriber.on('message', () => void this.reconcile());
      void this.subscriber.subscribe(LIVE_NUDGE_CHANNEL).catch(() => undefined);
    } catch {
      // Without it, changes are picked up by the regular check a moment later.
      this.subscriber = null;
    }
  }
}
