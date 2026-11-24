// SPDX-License-Identifier: AGPL-3.0-only
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { EventPublisher } from '../events/event-publisher.js';
import { FfmpegRunner } from '../processing/ffmpeg/ffmpeg-runner.js';
import { mainAudioStream } from '../processing/media/audio.js';
import { parseProbe } from '../processing/media/media-info.js';
import { StorageService } from '../storage/storage.service.js';
import { findSharedPart, fingerprint, SAMPLE_RATE } from './fingerprint.js';
import {
  buildListenArgs,
  creditsFrom,
  introFrom,
  listenSeconds,
  MIN_CREDITS_SECONDS,
  MIN_INTRO_SECONDS,
  partnersOf,
} from './marker-detection.js';
import { type MarkerInput, markersProblem, normalizeMarkers } from './marker.rules.js';

/** What is known of the sound of one episode: the fingerprint of its start and of its end. */
interface Heard {
  episodeId: string;
  number: number;
  assetId: string;
  durationMs: number;
  /** Where the part of the end that was listened to begins, in seconds. */
  tailStart: number;
  head: Uint32Array;
  tail: Uint32Array;
}

export interface DetectionContext {
  jobId: string;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
}

/** The job could not do anything, and trying again would not change that. */
export class DetectionImpossibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DetectionImpossibleError';
  }
}

/**
 * Finds the intros and the credits of the episodes of a season, by what
 * their sound has in common.
 *
 * Each episode is listened to at its start and at its end, and compared with
 * its neighbours. What two episodes share at the start is their intro; what
 * they share at the end is their credits. A recap cannot be found this way:
 * it is different in every episode.
 *
 * What is found is stored as "detected", for an admin to check. Markers an
 * admin set are left alone unless the search is told to replace them.
 */
@Injectable()
export class MarkerDetector {
  private readonly logger = new Logger(MarkerDetector.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(FfmpegRunner) private readonly ffmpeg: FfmpegRunner,
    @Inject(EventPublisher) private readonly events: EventPublisher,
  ) {}

  /**
   * @param workDirectory An empty directory of the job, removed by the caller.
   * @returns What is stored as the output of the job.
   * @throws DetectionImpossibleError when the season cannot be searched at all.
   */
  async run(context: DetectionContext, workDirectory: string): Promise<Record<string, unknown>> {
    const job = await this.prisma.job.findUnique({ where: { id: context.jobId } });
    const input = (job?.input ?? {}) as { seasonId?: unknown; overwrite?: unknown };
    if (typeof input.seasonId !== 'string') {
      throw new DetectionImpossibleError('The job names no season');
    }
    const overwrite = input.overwrite === true;
    const episodes = await this.prisma.episode.findMany({
      where: { seasonId: input.seasonId, asset: { status: 'READY', sourcePath: { not: null } } },
      orderBy: { number: 'asc' },
      include: { asset: true },
    });
    if (episodes.length < 2) {
      throw new DetectionImpossibleError(
        'The season needs two episodes with a video that is ready',
      );
    }

    // Listening is most of the work: 0 to 85 percent.
    const notes: string[] = [];
    const heard: Heard[] = [];
    for (const [index, episode] of episodes.entries()) {
      context.signal.throwIfAborted();
      const asset = episode.asset;
      if (!asset?.sourcePath) {
        continue;
      }
      try {
        heard.push({
          episodeId: episode.id,
          number: episode.number,
          assetId: asset.id,
          ...(await this.listen(asset, path.join(workDirectory, asset.id), context.signal)),
        });
      } catch (error) {
        context.signal.throwIfAborted();
        notes.push(
          `Episode ${episode.number} could not be listened to: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      context.onProgress(Math.round(((index + 1) / episodes.length) * 85));
    }
    if (heard.length < 2) {
      throw new DetectionImpossibleError(
        `Fewer than two episodes could be listened to. ${notes.join('. ')}`,
      );
    }

    let intros = 0;
    let credits = 0;
    let kept = 0;
    const perEpisode: { episode: number; intro: boolean; credits: boolean }[] = [];
    for (const [index, episode] of heard.entries()) {
      context.signal.throwIfAborted();
      const durationSeconds = episode.durationMs / 1000;
      let intro: MarkerInput | null = null;
      let ending: MarkerInput | null = null;
      // The first neighbour that shares something decides.
      for (const other of partnersOf(index, heard.length).map((at) => heard[at] as Heard)) {
        intro ??= introFrom(
          findSharedPart(episode.head, other.head, { minSeconds: MIN_INTRO_SECONDS }),
        );
        ending ??= creditsFrom(
          findSharedPart(episode.tail, other.tail, { minSeconds: MIN_CREDITS_SECONDS }),
          episode.tailStart,
          durationSeconds,
        );
        if (intro && ending) {
          break;
        }
      }
      const result = await this.store(episode, [intro, ending], overwrite);
      intros += result.stored.includes('INTRO') ? 1 : 0;
      credits += result.stored.includes('CREDITS') ? 1 : 0;
      kept += result.kept;
      perEpisode.push({
        episode: episode.number,
        intro: result.stored.includes('INTRO'),
        credits: result.stored.includes('CREDITS'),
      });
      context.onProgress(85 + Math.round(((index + 1) / heard.length) * 15));
    }

    this.logger.log(
      `Season ${input.seasonId}: found ${intros} intros and ${credits} credits in ${heard.length} episodes`,
    );
    return {
      seasonId: input.seasonId,
      episodes: heard.length,
      intros,
      credits,
      /** Markers an admin set that were found again and left as they are. */
      keptManual: kept,
      perEpisode,
      ...(notes.length > 0 ? { notes } : {}),
    };
  }

  /** Reads the start and the end of the sound of a video and fingerprints both. */
  private async listen(
    asset: {
      id: string;
      storagePoolId: string;
      sourcePath: string | null;
      probe: unknown;
      durationMs: number | null;
    },
    directory: string,
    signal: AbortSignal,
  ): Promise<Pick<Heard, 'durationMs' | 'tailStart' | 'head' | 'tail'>> {
    const info = parseProbe(JSON.stringify(asset.probe ?? {}));
    const stream = mainAudioStream(info);
    const durationMs = asset.durationMs ?? info.durationMs ?? 0;
    const seconds = listenSeconds(durationMs);
    if (!stream) {
      throw new Error('it has no sound');
    }
    if (seconds < MIN_INTRO_SECONDS) {
      throw new Error('it is too short');
    }
    await mkdir(directory, { recursive: true });
    const driver = await this.storage.getDriver(asset.storagePoolId);
    const key = asset.sourcePath as string;
    let sourcePath: string;
    if (driver.localPath) {
      sourcePath = driver.localPath(key);
    } else {
      sourcePath = path.join(directory, `source${path.extname(key)}`);
      await pipeline(await driver.read(key), createWriteStream(sourcePath));
    }

    const tailStart = Math.max(0, durationMs / 1000 - seconds);
    const read = async (name: string, fromSeconds: number): Promise<Uint32Array> => {
      const outputPath = path.join(directory, `${name}.pcm`);
      await this.ffmpeg.ffmpeg(
        buildListenArgs({
          sourcePath,
          streamIndex: stream.index,
          fromSeconds,
          seconds,
          sampleRate: SAMPLE_RATE,
          outputPath,
        }),
        { signal },
      );
      const bytes = await readFile(outputPath);
      await rm(outputPath, { force: true });
      return fingerprint(
        new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2)),
      );
    };
    const head = await read('head', 0);
    const tail = await read('tail', tailStart);
    if (!driver.localPath) {
      await rm(sourcePath, { force: true });
    }
    return { durationMs, tailStart, head, tail };
  }

  /**
   * Stores what was found for one video beside what is there: a marker an
   * admin set stays, unless told otherwise, and what was found earlier and
   * is not found now goes.
   */
  private async store(
    episode: Heard,
    found: readonly (MarkerInput | null)[],
    overwrite: boolean,
  ): Promise<{ stored: string[]; kept: number }> {
    const existing = await this.prisma.assetMarker.findMany({
      where: { assetId: episode.assetId },
    });
    const manual = existing.filter((marker) => marker.source === 'MANUAL');
    const stays = overwrite
      ? manual.filter((marker) => !found.some((other) => other?.kind === marker.kind))
      : manual;
    let kept = 0;
    const next: (MarkerInput & { source: 'MANUAL' | 'DETECTED' })[] = stays.map((marker) => ({
      kind: marker.kind,
      startMs: marker.startMs,
      endMs: marker.endMs,
      source: 'MANUAL',
    }));
    const stored: string[] = [];
    for (const marker of found) {
      if (!marker) {
        continue;
      }
      if (stays.some((other) => other.kind === marker.kind)) {
        kept += 1;
        continue;
      }
      // What was found must fit beside what an admin set. If it does not, the admin is right.
      const candidate = [...next, { ...marker, source: 'DETECTED' as const }];
      if (markersProblem(candidate, episode.durationMs) !== null) {
        continue;
      }
      next.push({ ...marker, source: 'DETECTED' });
      stored.push(marker.kind);
    }
    const ordered = normalizeMarkers(next, episode.durationMs).map((marker) => ({
      ...marker,
      source: (
        next.find((other) => other.kind === marker.kind) as { source: 'MANUAL' | 'DETECTED' }
      ).source,
    }));
    await this.prisma.$transaction([
      this.prisma.assetMarker.deleteMany({ where: { assetId: episode.assetId } }),
      this.prisma.assetMarker.createMany({
        data: ordered.map((marker) => ({ assetId: episode.assetId, ...marker })),
      }),
    ]);
    this.events.publish({ type: 'asset', assetId: episode.assetId, change: 'updated' });
    return { stored, kept };
  }
}
