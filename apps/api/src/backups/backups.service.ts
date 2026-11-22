// SPDX-License-Identifier: AGPL-3.0-only
import type { Readable } from 'node:stream';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Backup, type BackupStatus, type BackupTrigger, PrismaClient } from '@onyx/database';
import type { Redis } from 'ioredis';
import { appVersion } from '../common/app-version.js';
import { AppConfig } from '../config/app-config.js';
import { EventPublisher } from '../events/event-publisher.js';
import { createPlaybackToken, verifyPlaybackToken } from '../playback/playback-token.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { StorageService } from '../storage/storage.service.js';
import { BACKUP_FILE_EXTENSION } from './backup-file.js';
import {
  BACKUP_SETTINGS_KEY,
  type BackupSettings,
  nextSlot,
  type Protection,
  protectionOf,
  readBackupSettings,
} from './backup-schedule.js';

/** Where the runner says that it is alive, and what tools it found. */
export const BACKUP_RUNNER_KEY = 'onyx:backups:runner';
/** How long a download link works. Long enough to click, too short to pass around. */
const DOWNLOAD_LINK_SECONDS = 60;
const LISTED = 100;
const CALENDAR_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What the runner last said about itself. */
export interface RunnerReport {
  /** When it said so, in milliseconds. */
  at: number;
  pgDump: string | null;
  server: string | null;
  /** What stands in the way of a backup, or null. */
  problem: string | null;
}

export interface BackupView {
  id: string;
  status: BackupStatus;
  trigger: BackupTrigger;
  pool: { id: string; name: string };
  /** The name the file has when it is downloaded. */
  fileName: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  /** How many database objects the file holds. */
  entries: number | null;
  appVersion: string;
  migration: string | null;
  error: string | null;
  createdBy: { id: string; displayName: string } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BackupOverview {
  settings: BackupSettings;
  protection: Protection;
  /** When the newest backup that can be restored was made. */
  lastGoodAt: string | null;
  /** When the next scheduled backup is due. Null when the schedule is off. */
  nextRunAt: string | null;
  /** The process that makes the backups. Null when none has been heard of lately. */
  runner: Omit<RunnerReport, 'at'> | null;
  /** The version this server runs, to compare backups with. */
  appVersion: string;
  /** What all kept backups take up together. */
  totalBytes: number;
  /** The last thirty days, oldest first: what became of the backups of each day. */
  days: { date: string; good: number; failed: number }[];
  pools: { id: string; name: string; driver: string; isDefault: boolean; isActive: boolean }[];
  backups: BackupView[];
}

type BackupRow = Backup & {
  storagePool: { id: string; name: string };
  createdBy: { id: string; displayName: string } | null;
};

const WITH_NAMES = {
  storagePool: { select: { id: true, name: true } },
  createdBy: { select: { id: true, displayName: true } },
} as const;

function fileNameOf(storageKey: string | null): string | null {
  return storageKey ? (storageKey.split('/').pop() ?? null) : null;
}

export function backupView(backup: BackupRow): BackupView {
  return {
    id: backup.id,
    status: backup.status,
    trigger: backup.trigger,
    pool: backup.storagePool,
    fileName: fileNameOf(backup.storageKey),
    sizeBytes: backup.sizeBytes === null ? null : Number(backup.sizeBytes),
    sha256: backup.sha256,
    entries: backup.entries,
    appVersion: backup.appVersion,
    migration: backup.migration,
    error: backup.error,
    createdBy: backup.createdBy,
    createdAt: backup.createdAt.toISOString(),
    startedAt: backup.startedAt?.toISOString() ?? null,
    finishedAt: backup.finishedAt?.toISOString() ?? null,
  };
}

const subjectOf = (backupId: string) => `backup:${backupId}`;

/** Backups as admins see them: the list, the settings, asking for one, taking one home. */
@Injectable()
export class BackupsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(EventPublisher) private readonly events: EventPublisher,
  ) {}

  async settings(): Promise<BackupSettings> {
    const stored = await this.prisma.setting.findUnique({ where: { key: BACKUP_SETTINGS_KEY } });
    return readBackupSettings(stored?.value);
  }

  async updateSettings(settings: BackupSettings): Promise<BackupSettings> {
    if (settings.storagePoolId) {
      const pool = await this.prisma.storagePool.findUnique({
        where: { id: settings.storagePoolId },
      });
      if (!pool) {
        throw new UnprocessableEntityException('This storage pool does not exist');
      }
      if (!pool.isActive) {
        throw new UnprocessableEntityException(
          `The storage pool "${pool.name}" is switched off. Choose another one.`,
        );
      }
    }
    await this.prisma.setting.upsert({
      where: { key: BACKUP_SETTINGS_KEY },
      create: { key: BACKUP_SETTINGS_KEY, value: settings },
      update: { value: settings },
    });
    return settings;
  }

  /** What the runner last said, or null when it has been silent for too long. */
  async runner(): Promise<RunnerReport | null> {
    const stored = await this.redis.get(BACKUP_RUNNER_KEY);
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored) as RunnerReport;
    } catch {
      return null;
    }
  }

  async overview(now = new Date()): Promise<BackupOverview> {
    // The pool every installation has is created on first use.
    await this.storage.ensureDefaultPool();
    const calendarStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        (CALENDAR_DAYS - 1) * DAY_MS,
    );
    const [settings, runner, backups, lastGood, total, recent, pools] = await Promise.all([
      this.settings(),
      this.runner(),
      this.prisma.backup.findMany({
        orderBy: { createdAt: 'desc' },
        take: LISTED,
        include: WITH_NAMES,
      }),
      this.prisma.backup.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.backup.aggregate({ _sum: { sizeBytes: true } }),
      this.prisma.backup.findMany({
        where: { createdAt: { gte: calendarStart }, status: { in: ['COMPLETED', 'FAILED'] } },
        select: { createdAt: true, status: true },
      }),
      this.prisma.storagePool.findMany({
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        select: { id: true, name: true, driver: true, isDefault: true, isActive: true },
      }),
    ]);

    const days = Array.from({ length: CALENDAR_DAYS }, (_, index) => ({
      date: new Date(calendarStart.getTime() + index * DAY_MS).toISOString().slice(0, 10),
      good: 0,
      failed: 0,
    }));
    for (const backup of recent) {
      const day = days[Math.floor((backup.createdAt.getTime() - calendarStart.getTime()) / DAY_MS)];
      if (day) {
        day[backup.status === 'COMPLETED' ? 'good' : 'failed'] += 1;
      }
    }

    return {
      settings,
      protection: protectionOf(settings, lastGood?.createdAt ?? null, now),
      lastGoodAt: lastGood?.createdAt.toISOString() ?? null,
      nextRunAt: nextSlot(settings, now)?.toISOString() ?? null,
      runner: runner && { pgDump: runner.pgDump, server: runner.server, problem: runner.problem },
      appVersion: appVersion(),
      totalBytes: Number(total._sum.sizeBytes ?? 0),
      days,
      pools,
      backups: backups.map(backupView),
    };
  }

  /** The pool backups go to: the chosen one while it can be used, the default one otherwise. */
  async destinationPoolId(settings: BackupSettings): Promise<string> {
    if (settings.storagePoolId) {
      const pool = await this.prisma.storagePool.findUnique({
        where: { id: settings.storagePoolId },
        select: { id: true, isActive: true },
      });
      if (pool?.isActive) {
        return pool.id;
      }
    }
    return (await this.storage.getDefaultPool()).id;
  }

  /**
   * Asks for a backup now. The process with the scheduler role makes it,
   * within about twenty seconds.
   */
  async request(adminId: string | undefined): Promise<BackupView> {
    const waiting = await this.prisma.backup.findFirst({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
      select: { id: true },
    });
    if (waiting) {
      throw new ConflictException('A backup is being made already. Wait until it is finished.');
    }
    const backup = await this.prisma.backup.create({
      data: {
        trigger: 'MANUAL',
        storagePoolId: await this.destinationPoolId(await this.settings()),
        appVersion: appVersion(),
        createdById: adminId ?? null,
      },
      include: WITH_NAMES,
    });
    this.events.publish({ type: 'backup', backupId: backup.id });
    return backupView(backup);
  }

  private async find(id: string): Promise<BackupRow> {
    const backup = await this.prisma.backup.findUnique({ where: { id }, include: WITH_NAMES });
    if (!backup) {
      throw new NotFoundException('Backup not found');
    }
    return backup;
  }

  /** Deletes a backup and its file. */
  async remove(id: string): Promise<BackupView> {
    const backup = await this.find(id);
    if (backup.status === 'RUNNING') {
      throw new ConflictException('This backup is being made right now. Delete it afterwards.');
    }
    if (backup.storageKey) {
      const driver = await this.storage.getDriver(backup.storagePoolId);
      await driver.delete(backup.storageKey);
    }
    await this.prisma.backup.delete({ where: { id } });
    this.events.publish({ type: 'backup', backupId: id });
    return backupView(backup);
  }

  /**
   * A link that downloads the file, for a minute. The browser follows it
   * without the admin's token, so a large file goes straight to disk.
   */
  async downloadLink(id: string): Promise<{ backup: BackupView; path: string; expiresAt: string }> {
    const backup = await this.find(id);
    if (backup.status !== 'COMPLETED' || !backup.storageKey) {
      throw new ConflictException('Only a finished backup can be downloaded');
    }
    const expiresAt = Math.floor(Date.now() / 1000) + DOWNLOAD_LINK_SECONDS;
    const token = createPlaybackToken(subjectOf(id), expiresAt, this.config.playbackSigningSecret);
    return {
      backup: backupView(backup),
      path: `/v1/backups/${id}/file?token=${token}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  /** Opens the file behind a download link. */
  async openFile(
    id: string,
    token: string,
  ): Promise<{ stream: Readable; size: number; fileName: string }> {
    const check = verifyPlaybackToken(token, subjectOf(id), this.config.playbackSigningSecret);
    if (!check.valid) {
      throw new ForbiddenException(
        check.reason === 'expired'
          ? 'This download link has run out. Ask for a new one.'
          : 'This download link is not valid',
      );
    }
    const backup = await this.find(id);
    if (backup.status !== 'COMPLETED' || !backup.storageKey) {
      throw new NotFoundException('Backup not found');
    }
    const driver = await this.storage.getDriver(backup.storagePoolId);
    const info = await driver.stat(backup.storageKey);
    if (!info) {
      throw new NotFoundException('The file of this backup is no longer in its storage pool');
    }
    return {
      stream: await driver.read(backup.storageKey),
      size: info.size,
      fileName: fileNameOf(backup.storageKey) ?? `backup${BACKUP_FILE_EXTENSION}`,
    };
  }
}
