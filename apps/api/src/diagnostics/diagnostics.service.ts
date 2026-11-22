// SPDX-License-Identifier: AGPL-3.0-only
import { statfs } from 'node:fs/promises';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import type { Redis } from 'ioredis';
import { BackupsService } from '../backups/backups.service.js';
import { AppConfig } from '../config/app-config.js';
import { statusOf } from '../delivery/edge-state.js';
import { MailService } from '../mail/mail.service.js';
import { P2pService } from '../p2p/p2p.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { parseStoredConfig } from '../storage/storage-pool.config.js';
import { StorageService } from '../storage/storage.service.js';
import {
  backupsCheck,
  channelsCheck,
  databaseCheck,
  type DatabaseFacts,
  type DiskFacts,
  edgesCheck,
  mailCheck,
  poolCheck,
  type Probe,
  queueCheck,
  type QueueFacts,
  redisCheck,
  type RedisFacts,
  roleChecks,
  setupChecks,
  sortChecks,
  summarize,
  trackerCheck,
  versionsCheck,
  workDiskChecks,
} from './diagnostics.checks.js';
import type {
  AlertSettings,
  Check,
  DiagnosticsReport,
  DiagnosticsSummary,
} from './diagnostics.types.js';
import { ProcessBeacon } from './process-beacon.service.js';
import { UpdateCheckService } from './update-check.service.js';

export const DIAGNOSTICS_SETTINGS_KEY = 'diagnostics';
/** The result of the last look, for the mark in the header of the panel. */
export const SUMMARY_KEY = 'onyx:diagnostics:summary';
const SUMMARY_KEPT_SECONDS = 15 * 60;
/** No single question may hold the page up for longer than this. */
const PROBE_TIMEOUT_MS = 5000;
const STUCK_AFTER_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Tries something, with a limit on how long it may take. Never throws. */
async function probe<T>(run: () => PromiseLike<T>): Promise<Probe<T>> {
  const startedAt = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const value = await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`no answer within ${PROBE_TIMEOUT_MS / 1000} seconds`)),
          PROBE_TIMEOUT_MS,
        );
      }),
    ]);
    return { ok: true, value, tookMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Errors of drivers span lines and can be long. One line is enough to act on.
    return { ok: false, error: message.replace(/\s+/g, ' ').trim().slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

function infoValue(info: string, key: string): string {
  return new RegExp(`^${key}:(.*)$`, 'm').exec(info)?.[1]?.trim() ?? '';
}

/** Looks at every part of the installation and says what it found. */
@Injectable()
export class DiagnosticsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(BackupsService) private readonly backups: BackupsService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(P2pService) private readonly p2p: P2pService,
    @Inject(ProcessBeacon) private readonly beacon: ProcessBeacon,
    @Inject(UpdateCheckService) private readonly updates: UpdateCheckService,
  ) {}

  async settings(): Promise<AlertSettings> {
    const stored = await this.prisma.setting.findUnique({
      where: { key: DIAGNOSTICS_SETTINGS_KEY },
    });
    const value = stored?.value as Partial<AlertSettings> | null | undefined;
    // On unless switched off: a problem nobody hears of is the worst kind.
    return { emailAlerts: value?.emailAlerts !== false };
  }

  async updateSettings(settings: AlertSettings): Promise<AlertSettings> {
    await this.prisma.setting.upsert({
      where: { key: DIAGNOSTICS_SETTINGS_KEY },
      create: { key: DIAGNOSTICS_SETTINGS_KEY, value: { ...settings } },
      update: { value: { ...settings } },
    });
    return settings;
  }

  /** The owners that can sign in. They are the ones to tell when something breaks. */
  async recipients(): Promise<string[]> {
    const owners = await this.prisma.adminUser.findMany({
      where: { role: 'OWNER', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { email: true },
    });
    return owners.map((owner) => owner.email);
  }

  /** What the last look found, or null when nobody looked lately. */
  async summary(): Promise<DiagnosticsSummary | null> {
    const stored = await this.redis.get(SUMMARY_KEY).catch(() => null);
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored) as DiagnosticsSummary;
    } catch {
      return null;
    }
  }

  async run(now = new Date()): Promise<DiagnosticsReport> {
    const startedAt = performance.now();
    const [
      database,
      redis,
      processes,
      queue,
      pools,
      backups,
      tracker,
      edges,
      channels,
      version,
      settings,
      recipients,
    ] = await Promise.all([
      probe(() => this.databaseFacts()),
      probe(() => this.redisFacts()),
      this.beacon.list(now).catch(() => []),
      probe(() => this.queueFacts(now)),
      probe(() => this.poolChecks()),
      probe(() => this.backupFacts()),
      this.p2p.status(),
      probe(() => this.edgeFacts(now)),
      probe(() => this.channelFacts()),
      this.updates.version(),
      this.settings().catch(() => ({ emailAlerts: true })),
      this.recipients().catch(() => []),
    ]);

    const workers = processes.filter((process) => process.roles.includes('worker')).length;
    const versions = versionsCheck(processes);
    const checks: Check[] = [
      databaseCheck(database),
      redisCheck(redis),
      ...(versions ? [versions] : []),
      ...roleChecks(processes, channels.ok ? channels.value.enabled > 0 : false),
      queueCheck(queue, workers),
      ...(pools.ok
        ? pools.value.map(({ check }) => check)
        : [
            {
              id: 'storage',
              group: 'storage',
              title: 'Storage pools',
              status: 'problem',
              summary: `The storage pools cannot be read: ${pools.error}`,
            } satisfies Check,
          ]),
      ...workDiskChecks(
        pools.ok ? pools.value : [],
        processes.flatMap((process) => process.disks ?? []),
      ),
      backupsCheck(backups, now),
      edgesCheck(edges.ok ? edges.value : []),
      trackerCheck(tracker),
      ...(channels.ok ? [channelsCheck(channels.value)] : []),
      mailCheck(this.mail.enabled, this.mail.last),
      ...setupChecks({
        siteUrl: this.config.siteUrl,
        production: this.config.isProduction,
        stripe: Boolean(this.config.stripe),
        tmdb: Boolean(this.config.tmdb),
      }),
    ];

    const summary = summarize(checks, now);
    await this.redis
      .set(SUMMARY_KEY, JSON.stringify(summary), 'EX', SUMMARY_KEPT_SECONDS)
      .catch(() => undefined);

    return {
      ...summary,
      tookMs: Math.round(performance.now() - startedAt),
      version,
      checks: sortChecks(checks),
      // Without the disks: they are told as checks.
      processes: processes.map(({ disks: _disks, ...process }) => process),
      alerts: { ...settings, mailEnabled: this.mail.enabled, recipients },
    };
  }

  private async databaseFacts(): Promise<DatabaseFacts> {
    const [row] = await this.prisma.$queryRaw<{ version: string; size: bigint }[]>`
      SELECT current_setting('server_version') AS version,
             pg_database_size(current_database()) AS size`;
    let failedMigrations = 0;
    try {
      const [failed] = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM _prisma_migrations
        WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
      failedMigrations = Number(failed?.count ?? 0);
    } catch {
      // A database that was set up without migrations has no such table.
    }
    return {
      version: (row?.version ?? '').split(' ')[0] ?? '',
      sizeBytes: Number(row?.size ?? 0),
      failedMigrations,
    };
  }

  private async redisFacts(): Promise<RedisFacts> {
    await this.redis.ping();
    const info = await this.redis.info();
    return {
      version: infoValue(info, 'redis_version') || 'unknown',
      usedBytes: Number(infoValue(info, 'used_memory')) || 0,
      maxBytes: Number(infoValue(info, 'maxmemory')) || 0,
      policy: infoValue(info, 'maxmemory_policy') || 'noeviction',
    };
  }

  private async queueFacts(now: Date): Promise<QueueFacts> {
    const [waiting, active, failedToday, oldest, stuckAssets] = await Promise.all([
      this.prisma.job.count({ where: { status: 'QUEUED' } }),
      this.prisma.job.count({ where: { status: 'RUNNING' } }),
      this.prisma.job.count({
        where: { status: 'FAILED', finishedAt: { gte: new Date(now.getTime() - DAY_MS) } },
      }),
      this.prisma.job.findFirst({
        where: { status: 'QUEUED' },
        orderBy: { queuedAt: 'asc' },
        select: { queuedAt: true },
      }),
      this.prisma.asset.count({
        where: {
          status: 'PROCESSING',
          deletedAt: null,
          updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) },
        },
      }),
    ]);
    return {
      waiting,
      active,
      failedToday,
      oldestWaitingMs: oldest ? now.getTime() - oldest.queuedAt.getTime() : null,
      stuckAssets,
    };
  }

  private async poolChecks(): Promise<{ check: Check; disk: DiskFacts | null }[]> {
    await this.storage.ensureDefaultPool();
    const pools = await this.prisma.storagePool.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return Promise.all(
      pools.map(async (pool) => {
        const reach = await probe<DiskFacts | null>(async () => {
          if (pool.driver === 'LOCAL') {
            const disk = await statfs(parseStoredConfig('LOCAL', pool.config).basePath);
            return {
              freeBytes: Number(disk.bavail) * Number(disk.bsize),
              totalBytes: Number(disk.blocks) * Number(disk.bsize),
            };
          }
          // Any answer will do, also "there is no such file": the bucket was reached.
          const driver = await this.storage.getDriverForPool(pool);
          await driver.exists('.onyx-diagnostics');
          return null;
        });
        const check = poolCheck({
          id: pool.id,
          name: pool.name,
          driver: pool.driver,
          isDefault: pool.isDefault,
          usedBytes: Number(pool.usedBytes),
          quotaBytes: pool.quotaBytes === null ? null : Number(pool.quotaBytes),
          probe: reach,
        });
        return { check, disk: reach.ok ? reach.value : null };
      }),
    );
  }

  private async backupFacts() {
    const overview = await this.backups.overview();
    const newest = overview.backups.find(
      (backup) => backup.status === 'COMPLETED' || backup.status === 'FAILED',
    );
    return {
      protection: overview.protection,
      lastGoodAt: overview.lastGoodAt,
      runner: overview.runner,
      settings: overview.settings,
      lastFailure: newest?.status === 'FAILED' ? (newest.error ?? 'for an unknown reason') : null,
    };
  }

  private async edgeFacts(now: Date) {
    const edges = await this.prisma.edgeServer.findMany({
      orderBy: { name: 'asc' },
      select: { name: true, enabled: true, lastSeenAt: true },
    });
    return edges.map((edge) => ({ name: edge.name, status: statusOf(edge, now.getTime()) }));
  }

  private async channelFacts() {
    const channels = await this.prisma.channel.findMany({
      where: { status: { not: 'STOPPED' } },
      orderBy: { name: 'asc' },
      select: { name: true, status: true },
    });
    return {
      enabled: channels.length,
      failed: channels.filter((channel) => channel.status === 'FAILED').map(({ name }) => name),
      reconnecting: channels
        .filter((channel) => channel.status === 'RECONNECTING')
        .map(({ name }) => name),
    };
  }
}
