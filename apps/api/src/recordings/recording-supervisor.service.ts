// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rm, stat, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import { Transform } from 'node:stream';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient, type Recording } from '@onyx/database';
import type { Redis } from 'ioredis';
import { safeSourceFilename } from '../assets/source-filename.js';
import { AppConfig } from '../config/app-config.js';
import { EventPublisher } from '../events/event-publisher.js';
import { channelDirectory } from '../live/live-state.js';
import { LiveSupervisorService } from '../live/live-supervisor.service.js';
import { FfmpegRunner } from '../processing/ffmpeg/ffmpeg-runner.js';
import { PipelineService } from '../processing/pipeline.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { StorageService } from '../storage/storage.service.js';
import { buildJoinArgs, recordingFileName } from './recording-plan.js';
import { type RecordedParts, RecordingRunner } from './recording-runner.js';

/** How often a live process looks for recordings that are due. */
const CHECK_MS = 3000;
/** A recording starts this long before its planned start, to be ready when it comes. */
const LEAD_MS = 5000;
/** The lock on a recording runs out after this long without its live process. */
const LEASE_MS = 30_000;
/** A recording nobody could make is given up this long after its end. */
const GIVE_UP_AFTER_MS = 2 * 60_000;
/** Less than this is no recording. */
const MIN_SECONDS = 2;

function lockKey(recordingId: string): string {
  return `onyx:live:recording:${recordingId}`;
}

/** Directory the parts of recordings are written to. Nothing in it is served. */
export function recordingsDirectory(livePath: string): string {
  return path.join(livePath, 'recordings');
}

interface Running {
  runner: RecordingRunner;
  endsAt: number;
  /** Set when the recording was called off: what was written is thrown away. */
  discard: boolean;
}

/**
 * Makes the recordings that are due. Runs in processes with the live role,
 * beside the channels: a recording is copied from the files of its channel,
 * which are on the server that runs the channel.
 *
 * The database says what should be recorded. This service looks every few
 * seconds, starts what is due for channels it runs, follows changes to the
 * end of a running recording, and puts a finished one into the library as an
 * asset, where it is processed like an uploaded file.
 */
@Injectable()
export class RecordingSupervisorService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RecordingSupervisorService.name);
  private readonly node = `${hostname()}:${process.pid}`;
  private readonly running = new Map<string, Running>();
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private closing = false;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(EventPublisher) private readonly events: EventPublisher,
    @Inject(LiveSupervisorService) private readonly channels: LiveSupervisorService,
    @Inject(FfmpegRunner) private readonly ffmpeg: FfmpegRunner,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(PipelineService) private readonly pipeline: PipelineService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.check(), CHECK_MS);
  }

  onApplicationShutdown(): void {
    this.closing = true;
    if (this.timer) {
      clearInterval(this.timer);
    }
    // The parts stay on disk. After a restart the recording goes on in a new part.
    for (const running of this.running.values()) {
      running.runner.stop();
    }
  }

  /** Recordings this process is writing right now. */
  runningIds(): string[] {
    return [...this.running.keys()];
  }

  /** Starts what is due, follows what changed and gives up what nobody could record. */
  async check(): Promise<void> {
    if (this.busy || this.closing) {
      return;
    }
    this.busy = true;
    try {
      await this.pass();
    } catch (error) {
      this.logger.warn(`Could not check the recordings: ${(error as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private async pass(): Promise<void> {
    const now = Date.now();
    const due = await this.prisma.recording.findMany({
      where: {
        status: { in: ['SCHEDULED', 'RECORDING'] },
        startsAt: { lte: new Date(now + LEAD_MS) },
      },
    });
    const byId = new Map(due.map((recording) => [recording.id, recording]));

    for (const [id, running] of this.running) {
      const recording = byId.get(id);
      if (!recording) {
        // Called off or deleted while it ran.
        running.discard = true;
        running.runner.stop();
      } else {
        await this.redis.set(lockKey(id), this.node, 'PX', LEASE_MS).catch(() => undefined);
        if (recording.endsAt.getTime() !== running.endsAt) {
          running.endsAt = recording.endsAt.getTime();
          running.runner.setEnd(recording.endsAt);
        }
      }
    }

    for (const recording of due) {
      if (this.running.has(recording.id) || this.closing) {
        continue;
      }
      if (!recording.channelId) {
        await this.fail(recording, 'The channel was deleted before the recording was made');
        continue;
      }
      if (!this.channels.runningIds().includes(recording.channelId)) {
        // Another live process may run the channel. If none does until the end, it is given up.
        if (now > recording.endsAt.getTime() + GIVE_UP_AFTER_MS && (await this.claim(recording))) {
          await this.fail(recording, 'Nothing was recorded: the channel was not on air');
        }
        continue;
      }
      if (await this.claim(recording)) {
        this.start(recording, recording.channelId);
      }
    }
  }

  private async claim(recording: Recording): Promise<boolean> {
    return (await this.redis.set(lockKey(recording.id), this.node, 'PX', LEASE_MS, 'NX')) === 'OK';
  }

  private start(recording: Recording, channelId: string): void {
    const workDirectory = path.join(recordingsDirectory(this.config.live.path), recording.id);
    const runner = new RecordingRunner({
      channelDirectory: channelDirectory(this.config.live.path, channelId),
      workDirectory,
      startsAt: recording.startsAt,
      endsAt: recording.endsAt,
      ffmpegPath: this.config.ffmpegPath,
      measure: (file) => this.lengthOf(file),
    });
    const running: Running = { runner, endsAt: recording.endsAt.getTime(), discard: false };
    this.running.set(recording.id, running);
    this.logger.log(`Recording "${recording.title}" from ${recording.channelName}`);

    void this.prisma.recording
      .updateMany({
        where: { id: recording.id, status: 'SCHEDULED' },
        data: { status: 'RECORDING' },
      })
      .then(() => this.changed(recording.id))
      .catch(() => undefined);

    void runner
      .run()
      .then(async (recorded) => {
        if (this.closing) {
          return;
        }
        if (running.discard) {
          await rm(workDirectory, { recursive: true, force: true });
          return;
        }
        await this.finish(recording, recorded, workDirectory);
      })
      .catch((error: unknown) => this.fail(recording, describe(error)))
      .finally(async () => {
        this.running.delete(recording.id);
        if (!this.closing) {
          await this.redis.del(lockKey(recording.id)).catch(() => undefined);
        }
      });
  }

  /** Joins the parts of a recording, stores the file and hands it to the library. */
  private async finish(
    recording: Recording,
    recorded: RecordedParts,
    workDirectory: string,
  ): Promise<void> {
    if (recorded.seconds < MIN_SECONDS || recorded.parts.length === 0) {
      await this.fail(recording, 'Nothing was recorded: the channel was not on air');
      await rm(workDirectory, { recursive: true, force: true });
      return;
    }
    const marked = await this.prisma.recording.updateMany({
      where: { id: recording.id, status: { in: ['SCHEDULED', 'RECORDING'] } },
      data: { status: 'FINISHING', recordedSeconds: Math.round(recorded.seconds) },
    });
    if (marked.count === 0) {
      // Called off in the last moment.
      await rm(workDirectory, { recursive: true, force: true });
      return;
    }
    this.changed(recording.id);

    try {
      let file = recorded.parts[0] as string;
      if (recorded.parts.length > 1) {
        const list = path.join(workDirectory, 'parts.txt');
        await writeFile(
          list,
          recorded.parts.map((part) => `file '${part.replaceAll("'", "'\\''")}'`).join('\n'),
        );
        file = path.join(workDirectory, 'joined.mp4');
        await this.ffmpeg.ffmpeg(buildJoinArgs(list, file));
      }

      const pool = await this.storage.getDefaultPool();
      const bytes = (await stat(file)).size;
      const filename = recordingFileName(recording.title, recording.startsAt);
      const asset = await this.prisma.asset.create({
        data: {
          title: recording.title,
          storagePoolId: pool.id,
          createdById: recording.createdById,
          sourceFilename: filename,
        },
      });
      const key = `sources/${asset.id}/${safeSourceFilename(filename)}`;
      const hash = createHash('sha256');
      const hashing = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      const source = createReadStream(file);
      source.on('error', (error) => hashing.destroy(error));
      const driver = await this.storage.getDriver(pool.id);
      await driver.write(key, source.pipe(hashing), { contentType: 'video/mp4' });

      await this.prisma.$transaction([
        this.prisma.asset.update({
          where: { id: asset.id },
          data: {
            status: 'UPLOADED',
            sourcePath: key,
            sourceBytes: BigInt(bytes),
            sourceChecksum: `sha256:${hash.digest('hex')}`,
          },
        }),
        this.prisma.storagePool.update({
          where: { id: pool.id },
          data: { usedBytes: { increment: BigInt(bytes) } },
        }),
        this.prisma.recording.update({
          where: { id: recording.id },
          data: {
            status: 'DONE',
            statusMessage:
              recorded.parts.length > 1
                ? `Recorded in ${recorded.parts.length} parts: the channel was interrupted in between`
                : null,
            assetId: asset.id,
            bytes: BigInt(bytes),
          },
        }),
      ]);
      this.events.publish({ type: 'asset', assetId: asset.id, change: 'uploaded' });
      this.changed(recording.id);
      // Should this fail, the file is safely stored and the scheduler starts processing later.
      await this.pipeline.start(asset.id).catch((error: unknown) => {
        this.logger.warn(`Asset ${asset.id}: processing not started yet: ${describe(error)}`);
      });
      this.logger.log(
        `Recording "${recording.title}" is in the library (${Math.round(recorded.seconds)} s)`,
      );
    } catch (error) {
      await this.fail(recording, `The recording could not be stored: ${describe(error)}`);
      return;
    }
    await rm(workDirectory, { recursive: true, force: true });
  }

  private async fail(recording: Recording, message: string): Promise<void> {
    this.logger.warn(`Recording "${recording.title}": ${message}`);
    await this.prisma.recording
      .updateMany({
        where: { id: recording.id, status: { in: ['SCHEDULED', 'RECORDING', 'FINISHING'] } },
        data: { status: 'FAILED', statusMessage: message },
      })
      .catch(() => undefined);
    this.changed(recording.id);
  }

  private async lengthOf(file: string): Promise<number> {
    try {
      const output = await this.ffmpeg.ffprobe([
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        file,
      ]);
      const seconds = Number.parseFloat(output.trim());
      return Number.isFinite(seconds) ? seconds : 0;
    } catch {
      return 0;
    }
  }

  private changed(recordingId: string): void {
    this.events.publish({ type: 'recording', recordingId });
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
