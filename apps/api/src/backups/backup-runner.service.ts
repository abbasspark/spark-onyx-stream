// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { Transform, Writable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { pipeline } from 'node:stream/promises';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Backup, PrismaClient } from '@onyx/database';
import type { Redis } from 'ioredis';
import { appVersion } from '../common/app-version.js';
import { AppConfig } from '../config/app-config.js';
import { EventPublisher } from '../events/event-publisher.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { StorageService } from '../storage/storage.service.js';
import {
  BACKUP_FILE_EXTENSION,
  BackupFileError,
  createBackupReader,
  createBackupWriter,
} from './backup-file.js';
import { BACKUP_SETTINGS_KEY, isDue, readBackupSettings } from './backup-schedule.js';
import { BACKUP_RUNNER_KEY, type RunnerReport } from './backups.service.js';
import {
  connectionEnv,
  countArchiveEntries,
  PgToolError,
  type PgRun,
  runPgTool,
  toolProblem,
  toolVersion,
} from './pg-tools.js';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service.js';

/** How often the runner looks for work. A backup asked for by hand starts within this time. */
const LOOK_EVERY_MS = 20_000;
export const BACKUP_LOCK = 'onyx:backups:run';
/** The lock outlives a few missed renewals, and not much more. */
const LOCK_MS = 90_000;
const RENEW_EVERY_MS = 30_000;
/** The report runs out soon after the runner stops, so the panel notices. */
const REPORT_SECONDS = 90;
/** The tools do not change while the process runs, but the database server can be updated. */
const TOOLS_CHECKED_EVERY_MS = 10 * 60_000;
const KEEP_FAILED_MS = 30 * 24 * 60 * 60 * 1000;
const ERROR_KEPT = 500;

/** "backups/2026-11-22T03-00-04Z-1a2b3c4d.onyxbackup" */
export function backupKey(id: string, at: Date): string {
  const stamp = `${at.toISOString().slice(0, 19).replace(/:/g, '-')}Z`;
  return `backups/${stamp}-${id.replace(/-/g, '').slice(-8)}${BACKUP_FILE_EXTENSION}`;
}

/** What to tell an admin about a failure. Known problems speak for themselves. */
function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, ERROR_KEPT);
}

/**
 * Makes the backups. Runs in processes with the scheduler role, one of them
 * at a time.
 *
 * A backup is the output of pg_dump, encrypted on its way into a storage
 * pool. Nothing is written to a temporary file, so a large database needs no
 * free disk beside the pool. Before a backup counts, its file is read back
 * from the pool, opened and handed to pg_restore: what is listed as finished
 * has been proven to open.
 */
@Injectable()
export class BackupRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BackupRunner.name);
  private timer: NodeJS.Timeout | undefined;
  private busy = false;
  private current: PgRun | undefined;
  private tools: { at: number; report: Omit<RunnerReport, 'at'> } | undefined;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(WebhookDeliveryService) private readonly webhooks: WebhookDeliveryService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(EventPublisher) private readonly events: EventPublisher,
  ) {}

  onApplicationBootstrap(): void {
    // Tests call look() themselves, when they are ready for it.
    if (this.config.nodeEnv === 'test') {
      return;
    }
    this.timer = setInterval(() => void this.look(), LOOK_EVERY_MS);
    this.timer.unref();
    void this.look();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
    // A dump that is cut off leaves a backup marked as failed, not a file that looks whole.
    this.current?.stop();
  }

  /** Looks for work and does it: backups asked for by hand first, then the scheduled one. */
  async look(now = new Date()): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      const report = await this.report();
      const acquired = await this.redis.set(BACKUP_LOCK, String(process.pid), 'PX', LOCK_MS, 'NX');
      if (acquired !== 'OK') {
        return;
      }
      const renewal = setInterval(
        () => void this.redis.pexpire(BACKUP_LOCK, LOCK_MS).catch(() => undefined),
        RENEW_EVERY_MS,
      );
      try {
        await this.failAbandoned();
        for (;;) {
          const waiting = await this.prisma.backup.findFirst({
            where: { status: 'PENDING' },
            orderBy: { createdAt: 'asc' },
          });
          if (!waiting) {
            break;
          }
          await this.run(waiting, report.problem);
        }
        // Without the tools, a scheduled backup is not even tried: one failure
        // a day would say nothing the panel does not say already.
        if (!report.problem) {
          const scheduled = await this.startScheduled(now);
          if (scheduled) {
            await this.run(scheduled, null);
          }
        }
      } finally {
        clearInterval(renewal);
        await this.redis.del(BACKUP_LOCK);
      }
    } catch (error) {
      this.logger.error(`Backups could not be looked after: ${reasonOf(error)}`);
    } finally {
      this.busy = false;
    }
  }

  /** Tells the panel that the runner is alive and which tools it has. */
  private async report(): Promise<Omit<RunnerReport, 'at'>> {
    if (!this.tools || Date.now() - this.tools.at > TOOLS_CHECKED_EVERY_MS) {
      const [pgDump, rows] = await Promise.all([
        toolVersion('pg_dump'),
        this.prisma.$queryRaw<{ server_version: string }[]>`SHOW server_version`,
      ]);
      // "17.2 (Debian 17.2-1.pgdg120+1)" on some systems.
      const server = rows[0]?.server_version.split(' ')[0] ?? null;
      this.tools = {
        at: Date.now(),
        report: { pgDump, server, problem: toolProblem(pgDump, server) },
      };
    }
    const report: RunnerReport = { at: Date.now(), ...this.tools.report };
    await this.redis.set(BACKUP_RUNNER_KEY, JSON.stringify(report), 'EX', REPORT_SECONDS);
    return this.tools.report;
  }

  /**
   * Whoever holds the lock is the only one working, and it is not working
   * yet. A backup still marked as running was cut off, with its process.
   *
   * With one exception: a database that was just restored. A backup holds
   * the database as it was while the backup was being made, its own entry
   * included, and that entry says "running". Its file is whole, though, so a
   * file that opens makes the entry a finished backup again.
   */
  private async failAbandoned(): Promise<void> {
    const abandoned = await this.prisma.backup.findMany({ where: { status: 'RUNNING' } });
    for (const backup of abandoned) {
      const whole = backup.storageKey
        ? await this.readBack(backup.storagePoolId, backup.storageKey, null).catch(() => null)
        : null;
      if (whole) {
        await this.prisma.backup.update({
          where: { id: backup.id },
          data: {
            status: 'COMPLETED',
            sizeBytes: whole.fileBytes,
            sha256: whole.sha256,
            entries: whole.entries,
            finishedAt: backup.startedAt ?? new Date(),
            error: null,
          },
        });
        this.logger.log(`Backup ${backup.storageKey} was found whole and is listed again`);
      } else {
        await this.discardFile(backup);
        await this.prisma.backup.update({
          where: { id: backup.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            error: 'The server stopped while this backup was being made.',
          },
        });
      }
      this.events.publish({ type: 'backup', backupId: backup.id });
    }
  }

  private async startScheduled(now: Date): Promise<Backup | null> {
    const stored = await this.prisma.setting.findUnique({ where: { key: BACKUP_SETTINGS_KEY } });
    const settings = readBackupSettings(stored?.value);
    const last = await this.prisma.backup.findFirst({
      where: { trigger: 'SCHEDULED' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!isDue(settings, last?.createdAt ?? null, now)) {
      return null;
    }
    const chosen = settings.storagePoolId
      ? await this.prisma.storagePool.findFirst({
          where: { id: settings.storagePoolId, isActive: true },
          select: { id: true },
        })
      : null;
    return this.prisma.backup.create({
      data: {
        trigger: 'SCHEDULED',
        storagePoolId: chosen?.id ?? (await this.storage.getDefaultPool()).id,
        appVersion: appVersion(),
      },
    });
  }

  /** Makes one backup, start to finish. Never throws: a failure is written to the backup. */
  private async run(backup: Backup, problem: string | null): Promise<void> {
    const startedAt = new Date();
    const key = backupKey(backup.id, startedAt);
    try {
      const migration = await this.newestMigration();
      await this.prisma.backup.update({
        where: { id: backup.id },
        data: {
          status: 'RUNNING',
          startedAt,
          storageKey: key,
          appVersion: appVersion(),
          migration,
          error: null,
        },
      });
      this.events.publish({ type: 'backup', backupId: backup.id });
      if (problem) {
        throw new PgToolError(problem);
      }

      const written = await this.write(backup.storagePoolId, key, {
        createdAt: startedAt.toISOString(),
        appVersion: appVersion(),
        migration,
      });
      const { entries } = await this.readBack(backup.storagePoolId, key, written.dumpBytes);

      await this.prisma.backup.update({
        where: { id: backup.id },
        data: {
          status: 'COMPLETED',
          sizeBytes: written.fileBytes,
          sha256: written.sha256,
          entries,
          finishedAt: new Date(),
        },
      });
      this.logger.log(`Backup ${key} written: ${written.fileBytes} bytes, ${entries} objects`);
      await this.prune();
    } catch (error) {
      this.logger.error(`Backup ${backup.id} failed: ${reasonOf(error)}`);
      await this.discardFile({ storagePoolId: backup.storagePoolId, storageKey: key });
      await this.prisma.backup
        .update({
          where: { id: backup.id },
          data: { status: 'FAILED', finishedAt: new Date(), error: reasonOf(error) },
        })
        .catch(() => undefined);
    }
    this.events.publish({ type: 'backup', backupId: backup.id });
    await this.webhooks.announceBackup(backup.id);
  }

  private async newestMigration(): Promise<string | null> {
    try {
      const rows = await this.prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY migration_name DESC LIMIT 1`;
      return rows[0]?.migration_name ?? null;
    } catch {
      // A database that was set up without migrations has no such table.
      return null;
    }
  }

  /** pg_dump, encrypted, into the pool. */
  private async write(
    poolId: string,
    key: string,
    note: { createdAt: string; appVersion: string; migration: string | null },
  ): Promise<{ fileBytes: number; dumpBytes: number; sha256: string }> {
    const driver = await this.storage.getDriver(poolId);
    const dump = runPgTool(
      'pg_dump',
      ['--format=custom', '--no-password'],
      connectionEnv(this.config.databaseUrl),
      { output: 'pipe' },
    );
    this.current = dump;
    try {
      let dumpBytes = 0;
      let fileBytes = 0;
      const hash = createHash('sha256');
      const countDump = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          dumpBytes += chunk.length;
          callback(null, chunk);
        },
      });
      const countFile = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          fileBytes += chunk.length;
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      const sealing = pipeline(
        dump.stdout as NodeJS.ReadableStream,
        countDump,
        createBackupWriter(this.config.masterKey, note),
        countFile,
      );
      const storing = driver.write(key, countFile, { contentType: 'application/octet-stream' });
      // A pool that stops taking data must not leave pg_dump waiting for ever.
      storing.catch(() => dump.stop());
      const [dumped, sealed, stored] = await Promise.allSettled([dump.done, sealing, storing]);
      // pg_dump is asked first: when it fails, everything after it fails for that reason.
      for (const step of [dumped, stored, sealed]) {
        if (step.status === 'rejected') {
          throw step.reason;
        }
      }
      return { fileBytes, dumpBytes, sha256: hash.digest('hex') };
    } finally {
      this.current = undefined;
    }
  }

  /**
   * Reads the file back from the pool and proves that it opens: every chunk
   * is checked against the key, the size is compared with what pg_dump wrote,
   * and pg_restore must find the table of contents.
   *
   * @param dumpBytes What pg_dump wrote, or null when that is not known.
   * @returns How many database objects the backup holds, and what the file is.
   */
  private async readBack(
    poolId: string,
    key: string,
    dumpBytes: number | null,
  ): Promise<{ entries: number; fileBytes: number; sha256: string }> {
    const driver = await this.storage.getDriver(poolId);
    const stored = await driver.read(key);
    const list = runPgTool('pg_restore', ['--list'], {}, { input: 'pipe', output: 'pipe' });
    const listing = text(list.stdout as NodeJS.ReadableStream);
    const stdin = list.stdin as Writable;

    let fileBytes = 0;
    const hash = createHash('sha256');
    const countFile = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        fileBytes += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    let opened = 0;
    // pg_restore stops reading once it has the table of contents. The rest of
    // the file is still opened and checked, and then goes nowhere.
    const feed = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        opened += chunk.length;
        if (stdin.destroyed || stdin.writableEnded) {
          callback();
        } else {
          stdin.write(chunk, () => callback());
        }
      },
      final(callback) {
        stdin.end();
        callback();
      },
    });
    try {
      await pipeline(stored, countFile, createBackupReader(this.config.masterKey), feed);
    } catch (error) {
      list.stop();
      throw error;
    }
    if (dumpBytes !== null && opened !== dumpBytes) {
      throw new BackupFileError(
        `The stored backup holds ${opened} bytes where ${dumpBytes} were written`,
      );
    }
    await list.done;
    const entries = countArchiveEntries(await listing);
    if (entries === 0) {
      throw new BackupFileError('The stored backup holds no database objects');
    }
    return { entries, fileBytes, sha256: hash.digest('hex') };
  }

  private async discardFile(backup: Pick<Backup, 'storagePoolId' | 'storageKey'>): Promise<void> {
    if (!backup.storageKey) {
      return;
    }
    try {
      const driver = await this.storage.getDriver(backup.storagePoolId);
      await driver.delete(backup.storageKey);
    } catch (error) {
      this.logger.warn(`Could not remove ${backup.storageKey}: ${reasonOf(error)}`);
    }
  }

  /** Deletes finished backups beyond the number to keep, and old failures. */
  private async prune(): Promise<void> {
    const stored = await this.prisma.setting.findUnique({ where: { key: BACKUP_SETTINGS_KEY } });
    const { keep } = readBackupSettings(stored?.value);
    const surplus = await this.prisma.backup.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      skip: keep,
    });
    for (const backup of surplus) {
      // The row goes only when the file went. Otherwise the file would be lost from sight.
      try {
        if (backup.storageKey) {
          const driver = await this.storage.getDriver(backup.storagePoolId);
          await driver.delete(backup.storageKey);
        }
        await this.prisma.backup.delete({ where: { id: backup.id } });
        this.events.publish({ type: 'backup', backupId: backup.id });
      } catch (error) {
        this.logger.warn(`Could not delete the old backup ${backup.id}: ${reasonOf(error)}`);
      }
    }
    await this.prisma.backup.deleteMany({
      where: { status: 'FAILED', createdAt: { lt: new Date(Date.now() - KEEP_FAILED_MS) } },
    });
  }
}
