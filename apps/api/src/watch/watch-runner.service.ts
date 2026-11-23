// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaClient, type WatchedFile, type WatchLocation } from '@onyx/database';
import type { Redis } from 'ioredis';
import { safeSourceFilename } from '../assets/source-filename.js';
import { AuditService } from '../audit/audit.service.js';
import { isPlayable } from '../catalog/playable.js';
import { TitlesService } from '../catalog/titles.service.js';
import { AppConfig } from '../config/app-config.js';
import { EventPublisher } from '../events/event-publisher.js';
import { applyMetadataSchema, importMetadataSchema } from '../metadata/metadata.schemas.js';
import { MetadataService } from '../metadata/metadata.service.js';
import { METADATA_SOURCE } from '../metadata/metadata.types.js';
import { PipelineService } from '../processing/pipeline.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import type { StorageDriver, StorageListEntry } from '../storage/storage-driver.js';
import { StorageService } from '../storage/storage.service.js';
import {
  baseName,
  episodeCode,
  importedPath,
  isCandidate,
  isSidecarOf,
  parseWatchedName,
} from './watch-name.js';

/** How often the runner looks for work. A look asked for by hand starts within this time. */
const LOOK_EVERY_MS = 15_000;
export const WATCH_LOCK = 'onyx:watch:run';
/** The lock outlives a few missed renewals, and not much more. */
const LOCK_MS = 90_000;
const RENEW_EVERY_MS = 30_000;
/** Files of one location looked at per look. A place with more is read in the next ones. */
const MAX_FILES_PER_SCAN = 50_000;
/** Files imported per look, so one long queue does not keep new files from being seen. */
const MAX_IMPORTS_PER_LOOK = 10;
const NOTE_KEPT = 500;

/** A problem an admin can do something about. Its message is shown as it is. */
class ImportProblem extends Error {}
/** The title or episode has a video already. */
class ImportConflict extends Error {}

function reasonOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, NOTE_KEPT);
}

/** Whether two sightings of a file are of the same, unchanged file. */
function unchanged(file: Pick<WatchedFile, 'size' | 'modifiedAt'>, entry: StorageListEntry) {
  return (
    file.size === BigInt(entry.size) && file.modifiedAt.getTime() === entry.modifiedAt.getTime()
  );
}

/**
 * Moves a file inside one place. A folder on disk renames it, which is
 * immediate. A bucket has no such thing: the file is copied and then deleted.
 * An older file at the destination is replaced.
 */
export async function moveObject(driver: StorageDriver, from: string, to: string): Promise<void> {
  if (driver.localPath) {
    const target = driver.localPath(to);
    await mkdir(path.dirname(target), { recursive: true });
    await rename(driver.localPath(from), target);
    return;
  }
  await driver.write(to, await driver.read(from));
  await driver.delete(from);
}

/**
 * Looks through the watched locations and imports what it finds.
 *
 * Runs with the API, because importing needs the catalog and the import of
 * details, and one process at a time across all of them. A file goes through
 * three steps, each of which can be repeated after a crash:
 *
 *   seen        a row says the file is there and how large it is
 *   recognised  its name says what it is, or an admin does
 *   imported    its title exists, its video is copied into a storage pool and
 *               processing has started
 *
 * Nothing is taken from a location before its copy in the pool is complete.
 */
@Injectable()
export class WatchRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WatchRunner.name);
  private timer: NodeJS.Timeout | undefined;
  private busy = false;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(EventPublisher) private readonly events: EventPublisher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MetadataService) private readonly metadata: MetadataService,
    @Inject(TitlesService) private readonly titles: TitlesService,
    @Inject(PipelineService) private readonly pipeline: PipelineService,
  ) {}

  onApplicationBootstrap(): void {
    // Tests call look() themselves, when they are ready for it.
    if (this.config.nodeEnv === 'test') {
      return;
    }
    this.timer = setInterval(() => void this.look(), LOOK_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Looks for work and does it: locations that are due, then the queue, then what waits to be published. */
  async look(now = new Date()): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    let renewal: NodeJS.Timeout | undefined;
    try {
      const acquired = await this.redis.set(WATCH_LOCK, String(process.pid), 'PX', LOCK_MS, 'NX');
      if (acquired !== 'OK') {
        return;
      }
      renewal = setInterval(
        () => void this.redis.pexpire(WATCH_LOCK, LOCK_MS).catch(() => undefined),
        RENEW_EVERY_MS,
      );
      try {
        await this.recover();
        const locations = await this.prisma.watchLocation.findMany({ where: { isActive: true } });
        for (const location of locations) {
          const due =
            location.scanRequestedAt !== null ||
            location.lastScanAt === null ||
            now.getTime() - location.lastScanAt.getTime() >= location.scanIntervalMinutes * 60_000;
          if (due) {
            await this.scan(location, now);
          }
        }
        await this.importQueued();
        await this.settle();
      } finally {
        await this.redis.del(WATCH_LOCK).catch(() => undefined);
      }
    } catch (error) {
      this.logger.error(`Looking through the watched locations failed: ${reasonOf(error)}`);
    } finally {
      clearInterval(renewal);
      this.busy = false;
    }
  }

  /** Files left "importing" by a process that stopped are queued again. Holding the lock, nobody else is importing. */
  private async recover(): Promise<void> {
    await this.prisma.watchedFile.updateMany({
      where: { state: 'IMPORTING' },
      data: { state: 'QUEUED' },
    });
  }

  // --- Looking through a location ---------------------------------------------------

  /**
   * Compares what a location holds with what is known about it.
   * A failure is written to the location and does not stop the others.
   */
  async scan(location: WatchLocation, now = new Date()): Promise<void> {
    let driver: StorageDriver | undefined;
    try {
      driver = this.storage.createDriver(location);
      const entries: StorageListEntry[] = [];
      for await (const entry of driver.listAll()) {
        if (isCandidate(entry.key)) {
          entries.push(entry);
        }
        if (entries.length >= MAX_FILES_PER_SCAN) {
          break;
        }
      }
      await this.compare(location, entries, now);
      await this.prisma.watchLocation.update({
        where: { id: location.id },
        data: { lastScanAt: now, lastScanError: null, scanRequestedAt: null },
      });
    } catch (error) {
      this.logger.warn(
        `Location "${location.name}" could not be looked through: ${reasonOf(error)}`,
      );
      await this.prisma.watchLocation
        .update({
          where: { id: location.id },
          data: { lastScanAt: now, lastScanError: reasonOf(error), scanRequestedAt: null },
        })
        .catch(() => undefined);
    } finally {
      await driver?.close?.();
    }
    this.events.publish({ type: 'watch', locationId: location.id });
  }

  private async compare(
    location: WatchLocation,
    entries: readonly StorageListEntry[],
    now: Date,
  ): Promise<void> {
    const known = new Map(
      (await this.prisma.watchedFile.findMany({ where: { locationId: location.id } })).map(
        (file) => [file.path, file],
      ),
    );
    // A bucket shows a file only when it is whole. A folder shows it while it is copied.
    const settleMs = location.driver === 'LOCAL' ? this.config.watchSettleSeconds * 1000 : 0;
    const settled = (entry: StorageListEntry) =>
      now.getTime() - entry.modifiedAt.getTime() >= settleMs;
    const recognise = (entry: StorageListEntry) => {
      const parsed = parseWatchedName(entry.key);
      return parsed
        ? {
            state: 'QUEUED' as const,
            metadataId: parsed.metadataId,
            seasonNumber: parsed.seasonNumber,
            episodeNumber: parsed.episodeNumber,
            note: null,
          }
        : {
            state: 'UNRECOGNISED' as const,
            note: 'The name does not start with a TMDB id. Say what this file is.',
          };
    };

    for (const entry of entries) {
      const file = known.get(entry.key);
      known.delete(entry.key);
      const seen = { size: BigInt(entry.size), modifiedAt: entry.modifiedAt };
      if (!file) {
        // A bucket's file is ready at first sight. A folder's is looked at twice.
        const ready = location.driver !== 'LOCAL';
        await this.prisma.watchedFile.create({
          data: {
            locationId: location.id,
            path: entry.key,
            ...seen,
            ...(ready ? recognise(entry) : { state: 'WAITING' }),
          },
        });
      } else if (file.state === 'WAITING') {
        await this.prisma.watchedFile.update({
          where: { id: file.id },
          data: unchanged(file, entry) && settled(entry) ? recognise(entry) : seen,
        });
      } else if (file.state !== 'IMPORTING' && !unchanged(file, entry)) {
        // Another file under a known name: a new delivery, whatever became of the last one.
        await this.prisma.watchedFile.update({
          where: { id: file.id },
          data: {
            ...seen,
            state: 'WAITING',
            matchedByHand: false,
            replace: false,
            publishPending: false,
            note: null,
          },
        });
      }
    }

    // What is gone and was never imported needs no row. What was imported stays as history.
    const gone = [...known.values()]
      .filter((file) => file.state !== 'IMPORTED' && file.state !== 'IMPORTING')
      .map((file) => file.id);
    if (gone.length > 0) {
      await this.prisma.watchedFile.deleteMany({ where: { id: { in: gone } } });
    }
  }

  // --- Importing ------------------------------------------------------------------

  private async importQueued(): Promise<void> {
    const queued = await this.prisma.watchedFile.findMany({
      where: { state: 'QUEUED', location: { isActive: true } },
      orderBy: [{ firstSeenAt: 'asc' }, { path: 'asc' }],
      take: MAX_IMPORTS_PER_LOOK,
      include: { location: true },
    });
    for (const file of queued) {
      await this.importFile(file, file.location);
    }
  }

  /** Imports one file. Whatever happens ends up in the state and the note of its row. */
  async importFile(file: WatchedFile, location: WatchLocation): Promise<void> {
    const claimed = await this.prisma.watchedFile.updateMany({
      where: { id: file.id, state: 'QUEUED' },
      data: { state: 'IMPORTING', note: null },
    });
    if (claimed.count === 0) {
      return;
    }
    this.events.publish({ type: 'watch', locationId: location.id });

    let driver: StorageDriver | undefined;
    try {
      driver = this.storage.createDriver(location);
      const target = await this.resolveTarget(file);
      // A published title keeps its video until the new one plays. See settle().
      const attachNow = !target.hasVideo || !target.published;
      const assetId = await this.copyIntoLibrary(file, location, driver, target.assetName);
      if (attachNow) {
        await this.attach(target, assetId);
      }
      await this.prisma.watchedFile.update({
        where: { id: file.id },
        data: {
          state: 'IMPORTED',
          titleId: target.titleId,
          episodeId: target.episodeId,
          assetId,
          importedAt: new Date(),
          publishPending: location.autoPublish,
          // Kept on while the video still has to take the place of the one before.
          replace: !attachNow,
          note: null,
        },
      });
      await this.audit.record({
        action: 'watch.import',
        entityType: 'Title',
        entityId: target.titleId,
        metadata: { location: location.name, path: file.path, assetId },
      });
      this.logger.log(`Imported ${file.path} of "${location.name}" as ${target.assetName}`);
      await this.clearAway(file, location, driver);
    } catch (error) {
      const conflict = error instanceof ImportConflict;
      if (!conflict && !(error instanceof ImportProblem)) {
        this.logger.warn(`Importing ${file.path} of "${location.name}" failed: ${reasonOf(error)}`);
      }
      await this.prisma.watchedFile
        .update({
          where: { id: file.id },
          data: { state: conflict ? 'CONFLICT' : 'FAILED', note: reasonOf(error) },
        })
        .catch(() => undefined);
    } finally {
      await driver?.close?.();
      this.events.publish({ type: 'watch', locationId: location.id });
    }
  }

  /**
   * Finds the title, and for an episode the episode, a file belongs to.
   * A title the catalog does not have yet is imported from TMDB as a draft.
   */
  private async resolveTarget(file: WatchedFile): Promise<{
    titleId: string;
    episodeId: string | null;
    assetName: string;
    hasVideo: boolean;
    published: boolean;
  }> {
    if (!file.metadataId) {
      throw new ImportProblem('Nobody has said what this file is yet');
    }
    const isEpisode = file.seasonNumber !== null && file.episodeNumber !== null;
    const specials = file.seasonNumber === 0;

    let title = await this.prisma.title.findFirst({
      where: { metadataSource: METADATA_SOURCE, metadataId: file.metadataId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, type: true, assetId: true, status: true },
    });
    if (!title) {
      const result = await this.metadata.importNew(
        importMetadataSchema.parse({ id: file.metadataId, specials, allowDuplicate: true }),
        null,
      );
      title = {
        id: result.title.id,
        name: result.title.name,
        type: result.title.type,
        assetId: null,
        status: result.title.status,
      };
    }

    if (!isEpisode) {
      if (title.assetId && !file.replace) {
        throw new ImportConflict(
          `"${title.name}" has a video already. Choose "Replace the video" to use this file instead.`,
        );
      }
      return {
        titleId: title.id,
        episodeId: null,
        assetName: title.name,
        hasVideo: title.assetId !== null,
        published: title.status === 'PUBLISHED',
      };
    }

    const season = file.seasonNumber as number;
    const number = file.episodeNumber as number;
    const find = (titleId: string) =>
      this.prisma.episode.findFirst({
        where: { number, season: { titleId, number: season } },
        select: { id: true, name: true, assetId: true, status: true },
      });
    let episode = await find(title.id);
    if (!episode) {
      // The series was imported before this episode existed. Ask the source again.
      await this.metadata.applyTo(
        title.id,
        applyMetadataSchema.parse({ id: file.metadataId, specials }),
      );
      episode = await find(title.id);
    }
    const code = episodeCode(season, number);
    if (!episode) {
      throw new ImportProblem(
        `TMDB lists no ${code} for "${title.name}". Add the episode to the series by hand, then try again.`,
      );
    }
    if (episode.assetId && !file.replace) {
      throw new ImportConflict(
        `${code} of "${title.name}" has a video already. Choose "Replace the video" to use this file instead.`,
      );
    }
    return {
      titleId: title.id,
      episodeId: episode.id,
      assetName: `${title.name} ${code} · ${episode.name}`.slice(0, 200),
      hasVideo: episode.assetId !== null,
      published: episode.status === 'PUBLISHED',
    };
  }

  /**
   * Copies the file into a storage pool as the source of a new video, and
   * starts its processing: the same as an upload that has just finished.
   *
   * @returns the id of the new asset.
   */
  private async copyIntoLibrary(
    file: WatchedFile,
    location: WatchLocation,
    source: StorageDriver,
    name: string,
  ): Promise<string> {
    const pool = location.storagePoolId
      ? await this.prisma.storagePool.findUnique({ where: { id: location.storagePoolId } })
      : await this.storage.getDefaultPool();
    if (!pool?.isActive) {
      throw new ImportProblem('The storage pool of this location is missing or not active');
    }
    if (file.size > BigInt(this.config.uploadMaxBytes)) {
      throw new ImportProblem(
        'The file is larger than the largest video this installation accepts (UPLOAD_MAX_BYTES)',
      );
    }

    const asset = await this.prisma.asset.create({
      data: {
        title: name,
        storagePoolId: pool.id,
        sourceFilename: baseName(file.path),
        processingMode: location.processingMode,
        encodingProfileId: location.encodingProfileId,
      },
    });
    const key = `sources/${asset.id}/${safeSourceFilename(baseName(file.path))}`;
    const target = await this.storage.getDriverForPool(pool);
    try {
      const hash = createHash('sha256');
      let bytes = 0n;
      const hashing = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk);
          bytes += BigInt(chunk.length);
          callback(null, chunk);
        },
      });
      const stream = await source.read(file.path);
      stream.on('error', (error) => hashing.destroy(error));
      await target.write(key, stream.pipe(hashing), { contentType: 'application/octet-stream' });
      if (bytes !== file.size) {
        throw new ImportProblem(
          'The file changed while it was copied. It is looked at again with the next look.',
        );
      }
      const checksum = `sha256:${hash.digest('hex')}`;
      await this.prisma.$transaction([
        this.prisma.asset.update({
          where: { id: asset.id },
          data: {
            status: 'UPLOADED',
            sourcePath: key,
            sourceBytes: bytes,
            sourceChecksum: checksum,
          },
        }),
        this.prisma.storagePool.update({
          where: { id: pool.id },
          data: { usedBytes: { increment: bytes } },
        }),
      ]);
      await this.audit.record({
        action: 'asset.upload_complete',
        entityType: 'Asset',
        entityId: asset.id,
        metadata: { bytes: Number(bytes), checksum, via: 'watch', location: location.name },
      });
    } catch (error) {
      // Half a video helps nobody: the row and what was written of the file go again.
      await target.deletePrefix(`sources/${asset.id}`).catch(() => undefined);
      await this.prisma.asset.delete({ where: { id: asset.id } }).catch(() => undefined);
      throw error;
    }
    this.events.publish({ type: 'asset', assetId: asset.id, change: 'uploaded' });
    // If this fails the video is stored all the same, and maintenance starts it later.
    await this.pipeline
      .start(asset.id)
      .catch((error) =>
        this.logger.error(`Asset ${asset.id}: could not start processing: ${reasonOf(error)}`),
      );
    return asset.id;
  }

  private async attach(
    target: { titleId: string; episodeId: string | null },
    assetId: string,
  ): Promise<void> {
    if (target.episodeId) {
      await this.prisma.episode.update({ where: { id: target.episodeId }, data: { assetId } });
    } else {
      await this.prisma.title.update({ where: { id: target.titleId }, data: { assetId } });
    }
  }

  /** Does with an imported file what its location says: move it away, keep it or delete it. */
  private async clearAway(
    file: WatchedFile,
    location: WatchLocation,
    driver: StorageDriver,
  ): Promise<void> {
    if (location.afterImport === 'KEEP') {
      return;
    }
    try {
      // Subtitles and notes of the same name travel with their video.
      const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
      const companions: string[] = [];
      for await (const entry of folder ? driver.list(folder) : driver.listAll()) {
        if (isSidecarOf(file.path, entry.key)) {
          companions.push(entry.key);
        }
      }
      for (const key of [file.path, ...companions]) {
        if (location.afterImport === 'DELETE') {
          await driver.delete(key);
        } else {
          await moveObject(driver, key, importedPath(key));
        }
      }
    } catch (error) {
      await this.prisma.watchedFile.update({
        where: { id: file.id },
        data: {
          note: `Imported, but the file could not be ${location.afterImport === 'DELETE' ? 'deleted' : 'moved to "imported"'}: ${reasonOf(error)}`.slice(
            0,
            NOTE_KEPT,
          ),
        },
      });
    }
  }

  // --- After processing -----------------------------------------------------------

  /**
   * Finishes what had to wait for a video to play: putting it in the place of
   * the one a published title had, and publishing what a location publishes
   * by itself.
   */
  async settle(): Promise<void> {
    const waiting = await this.prisma.watchedFile.findMany({
      where: { state: 'IMPORTED', OR: [{ publishPending: true }, { replace: true }] },
      include: {
        asset: { select: { id: true, status: true, manifestPath: true } },
        title: { select: { id: true, status: true } },
        episode: { select: { id: true, status: true } },
      },
      take: 200,
    });
    for (const file of waiting) {
      const done = { publishPending: false, replace: false };
      if (!file.asset || !file.title || file.asset.status === 'DELETED') {
        await this.prisma.watchedFile.update({ where: { id: file.id }, data: done });
        continue;
      }
      if (file.asset.status === 'FAILED') {
        await this.prisma.watchedFile.update({
          where: { id: file.id },
          data: {
            ...done,
            note: 'The video could not be processed, so nothing was published or replaced. See the video in the library.',
          },
        });
        continue;
      }
      if (!isPlayable(file.asset)) {
        continue;
      }
      try {
        if (file.replace) {
          await this.attach({ titleId: file.title.id, episodeId: file.episodeId }, file.asset.id);
        }
        if (file.publishPending) {
          if (file.episode && file.episode.status !== 'PUBLISHED') {
            await this.titles.updateEpisode(file.episode.id, { status: 'PUBLISHED' });
          }
          if (file.title.status === 'DRAFT') {
            await this.titles.setStatus(file.title.id, { status: 'PUBLISHED' });
          }
        }
        await this.prisma.watchedFile.update({ where: { id: file.id }, data: done });
      } catch (error) {
        await this.prisma.watchedFile.update({
          where: { id: file.id },
          data: {
            ...done,
            note: `Imported, but not published: ${reasonOf(error)}`.slice(0, NOTE_KEPT),
          },
        });
      }
      this.events.publish({ type: 'watch', locationId: file.locationId });
    }
  }
}
