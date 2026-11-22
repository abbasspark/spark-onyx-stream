// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import { hostname } from 'node:os';
import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { appVersion } from '../common/app-version.js';
import { AppConfig } from '../config/app-config.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import type { ProcessReport } from './diagnostics.types.js';

/** Where every process writes that it is alive. One field per process. */
export const PROCESSES_KEY = 'onyx:processes';
const REPORT_EVERY_MS = 15_000;
/** A process that was silent for this long is taken to be gone. */
export const PROCESS_GONE_AFTER_MS = 50_000;

export interface DiskReport {
  /** What the folder is for. */
  name: 'uploads' | 'processing' | 'live';
  freeBytes: number;
  totalBytes: number;
  /** Set when the folder could not be read. */
  error?: string;
}

/** What a process says about itself, with the disks only it can see. */
export interface Beacon extends ProcessReport {
  disks: DiskReport[];
}

/**
 * Lets every process say that it is alive, which roles it has and how much
 * room its working folders have. The panel reads this to tell whether there
 * is a worker, a scheduler and a live process at all: questions the process
 * that answers the panel cannot answer about the others by itself.
 */
@Injectable()
export class ProcessBeacon implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly id = randomUUID();
  private readonly startedAt = new Date();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test') {
      return;
    }
    this.timer = setInterval(() => void this.report().catch(() => undefined), REPORT_EVERY_MS);
    this.timer.unref();
    void this.report().catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    // Gone at once, and not only when the silence is noticed.
    await this.redis.hdel(PROCESSES_KEY, this.id).catch(() => undefined);
  }

  /** The folders this process works in, by its roles. */
  private folders(): { name: DiskReport['name']; path: string }[] {
    const folders: { name: DiskReport['name']; path: string }[] = [];
    if (this.config.hasRole('api')) {
      folders.push({ name: 'uploads', path: this.config.uploadTempPath });
    }
    if (this.config.hasRole('worker')) {
      folders.push({ name: 'processing', path: this.config.processingTempPath });
    }
    if (this.config.hasRole('live')) {
      folders.push({ name: 'live', path: this.config.live.path });
    }
    return folders;
  }

  async report(now = new Date()): Promise<void> {
    const disks = await Promise.all(
      this.folders().map(async ({ name, path }): Promise<DiskReport> => {
        try {
          const disk = await statfs(path);
          return {
            name,
            freeBytes: Number(disk.bavail) * Number(disk.bsize),
            totalBytes: Number(disk.blocks) * Number(disk.bsize),
          };
        } catch (error) {
          return { name, freeBytes: 0, totalBytes: 0, error: (error as Error).message };
        }
      }),
    );
    const beacon: Beacon = {
      id: this.id,
      roles: [...this.config.roles],
      host: hostname(),
      pid: process.pid,
      version: appVersion(),
      node: process.versions.node,
      startedAt: this.startedAt.toISOString(),
      seenAt: now.toISOString(),
      memoryBytes: process.memoryUsage().rss,
      disks,
    };
    await this.redis.hset(PROCESSES_KEY, this.id, JSON.stringify(beacon));
  }

  /** Every process that reported lately, oldest first. Entries of processes that are gone are removed. */
  async list(now = new Date()): Promise<Beacon[]> {
    const stored = await this.redis.hgetall(PROCESSES_KEY);
    const alive: Beacon[] = [];
    const gone: string[] = [];
    for (const [id, text] of Object.entries(stored)) {
      try {
        const beacon = JSON.parse(text) as Beacon;
        if (now.getTime() - new Date(beacon.seenAt).getTime() <= PROCESS_GONE_AFTER_MS) {
          alive.push(beacon);
          continue;
        }
      } catch {
        // Not something a process wrote. Removed with the rest.
      }
      gone.push(id);
    }
    if (gone.length > 0) {
      await this.redis.hdel(PROCESSES_KEY, ...gone).catch(() => undefined);
    }
    return alive.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }
}

/** Loaded in every process, whatever its roles. */
@Global()
@Module({ providers: [ProcessBeacon], exports: [ProcessBeacon] })
export class ProcessBeaconModule {}
