// SPDX-License-Identifier: AGPL-3.0-only
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Asset, type JobType, Prisma, PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import { type ContentKey, ContentKeysService } from '../crypto/content-keys.service.js';
import { EncodingProfilesService } from '../encoding-profiles/encoding-profiles.service.js';
import type { StorageDriver } from '../storage/storage-driver.js';
import { StorageService } from '../storage/storage.service.js';
import { FfmpegRunner } from './ffmpeg/ffmpeg-runner.js';
import { toPercent } from './ffmpeg/progress.js';
import { decideProcessingMode } from './media/decision.js';
import {
  buildCopyArgs,
  buildKeyInfo,
  buildPosterArgs,
  CONTENT_KEY_URI,
  buildTranscodeArgs,
  MASTER_PLAYLIST_NAME,
  MEDIA_PLAYLIST_NAME,
} from './media/hls-command.js';
import { planRenditions } from './media/ladder.js';
import {
  aacCodecString,
  avcCodecString,
  avcCodecStringFromProfile,
  buildMasterPlaylist,
  type MasterVariant,
  measureBitrates,
  parseMediaPlaylist,
} from './media/master-builder.js';
import {
  maxKeyframeGap,
  type MediaInfo,
  parseProbe,
  unsupportedSourceReason,
} from './media/media-info.js';
import { buildSpriteArgs, buildSpriteVtt, planSprite } from './media/sprite.js';
import {
  buildSubtitleArgs,
  buildSubtitlePlaylist,
  planSubtitles,
  SUBTITLE_FILE_NAME,
  SUBTITLE_PLAYLIST_NAME,
  type SubtitleTrackPlan,
} from './media/subtitles.js';
import { outputPrefix, PipelineService } from './pipeline.service.js';

/**
 * An error that trying again cannot fix, such as a file without video.
 * The job fails at once instead of being retried.
 */
export class NonRetryableProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableProcessingError';
  }
}

export interface StepContext {
  jobId: string;
  assetId: string;
  signal: AbortSignal;
  /** Reports progress from 0 to 100. */
  onProgress: (percent: number) => void;
}

/** Length of the part of the source that is checked for keyframes, in seconds. */
const KEYFRAME_SAMPLE_SECONDS = 60;
const POSTER_MAX_HEIGHT = 720;
/** The poster is taken this far into the video, but never later than the cap. */
const POSTER_POSITION_FRACTION = 0.1;
const POSTER_POSITION_CAP_SECONDS = 30;

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.vtt': 'text/vtt',
};

/** Lists every file under a directory, as paths relative to it with forward slashes. */
async function listFiles(directory: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
}

/**
 * The work of each processing job: probe, remux or transcode, thumbnails.
 *
 * Each step reads the source through the asset's storage driver, lets FFmpeg
 * write into a private working directory, and uploads the results through the
 * same driver. Steps do not know about the queue. ProcessingConsumer calls them.
 */
@Injectable()
export class ProcessingSteps {
  private readonly logger = new Logger(ProcessingSteps.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(EncodingProfilesService) private readonly profiles: EncodingProfilesService,
    @Inject(PipelineService) private readonly pipelineService: PipelineService,
    @Inject(FfmpegRunner) private readonly ffmpeg: FfmpegRunner,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(ContentKeysService) private readonly contentKeys: ContentKeysService,
  ) {}

  /** Runs the step for a job type and returns what is stored as the job's output. */
  async run(type: JobType, context: StepContext): Promise<Record<string, unknown>> {
    switch (type) {
      case 'PROBE':
        return this.withWorkDirectory(context, (directory) => this.probe(context, directory));
      case 'REMUX':
      case 'TRANSCODE':
        return this.withWorkDirectory(context, (directory) =>
          this.encode(type, context, directory),
        );
      case 'THUMBNAILS':
        return this.withWorkDirectory(context, (directory) => this.thumbnails(context, directory));
      default:
        throw new NonRetryableProcessingError(`Job type ${type} is not implemented yet`);
    }
  }

  // --- Probe ---------------------------------------------------------------

  private async probe(
    context: StepContext,
    workDirectory: string,
  ): Promise<Record<string, unknown>> {
    const asset = await this.loadAsset(context.assetId);
    const driver = await this.storage.getDriver(asset.storagePoolId);
    const sourcePath = await this.localSource(asset, driver, workDirectory);

    let probeJson: string;
    try {
      probeJson = await this.ffmpeg.ffprobe(
        ['-print_format', 'json', '-show_format', '-show_streams', sourcePath],
        context.signal,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'FfmpegError') {
        throw new NonRetryableProcessingError('The file is not a media file that can be read');
      }
      throw error;
    }

    const info = parseProbe(probeJson);
    const unsupported = unsupportedSourceReason(info);
    if (unsupported || !info.video) {
      throw new NonRetryableProcessingError(unsupported ?? 'The file contains no video stream');
    }

    const profile = asset.encodingProfileId
      ? await this.profiles.get(asset.encodingProfileId)
      : await this.profiles.getDefault();

    const decision = decideProcessingMode({
      info,
      maxKeyframeGapSeconds: await this.sampleKeyframeGap(sourcePath, info, context.signal),
      segmentSeconds: profile.segmentSeconds,
      forcedMode: asset.processingMode,
    });

    await this.prisma.asset.update({
      where: { id: asset.id },
      data: {
        probe: JSON.parse(probeJson) as Prisma.InputJsonValue,
        durationMs: info.durationMs,
        width: info.video.width,
        height: info.video.height,
        frameRate: info.video.frameRate,
        videoCodec: info.video.codec,
        audioCodec: info.audio[0]?.codec ?? null,
        processingMode: decision.mode,
        encodingProfileId: profile.id,
      },
    });

    await this.pipelineService.afterProbe(asset.id, decision.mode);

    return { mode: decision.mode, reason: decision.reason, profile: profile.name };
  }

  private async sampleKeyframeGap(
    sourcePath: string,
    info: MediaInfo,
    signal: AbortSignal,
  ): Promise<number | null> {
    if (!info.video) {
      return null;
    }
    const output = await this.ffmpeg.ffprobe(
      [
        '-select_streams',
        `v:${info.video.index}`,
        '-skip_frame',
        'nokey',
        '-show_entries',
        'frame=pts_time',
        '-of',
        'csv=p=0',
        '-read_intervals',
        `%+${KEYFRAME_SAMPLE_SECONDS}`,
        sourcePath,
      ],
      signal,
    );

    const times = output
      .split('\n')
      .map((line) => Number(line.split(',')[0]))
      .filter((time) => Number.isFinite(time));
    const sampled = Math.min(
      KEYFRAME_SAMPLE_SECONDS,
      info.durationMs ? info.durationMs / 1000 : KEYFRAME_SAMPLE_SECONDS,
    );
    return maxKeyframeGap(times, sampled);
  }

  // --- Remux and transcode -------------------------------------------------

  private async encode(
    type: 'REMUX' | 'TRANSCODE',
    context: StepContext,
    workDirectory: string,
  ): Promise<Record<string, unknown>> {
    const asset = await this.loadAsset(context.assetId);
    if (!asset.probe || !asset.encodingProfileId) {
      throw new NonRetryableProcessingError('The asset has not been probed');
    }

    const info = parseProbe(JSON.stringify(asset.probe));
    if (!info.video) {
      throw new NonRetryableProcessingError('The file contains no video stream');
    }

    const profile = await this.profiles.get(asset.encodingProfileId);
    const driver = await this.storage.getDriver(asset.storagePoolId);
    const sourcePath = await this.localSource(asset, driver, workDirectory);
    const outputDirectory = path.join(workDirectory, 'hls');
    await mkdir(outputDirectory, { recursive: true });

    const audioStream = info.audio.find((stream) => stream.isDefault) ?? info.audio[0] ?? null;
    const sourceHeight = info.video.rotation % 180 === 0 ? info.video.height : info.video.width;

    const planned = type === 'TRANSCODE' ? planRenditions(profile.renditions, sourceHeight) : [];
    const renditionNames =
      type === 'TRANSCODE' ? planned.map((rendition) => rendition.name) : [`${info.video.height}p`];

    // The key lives outside the output folder, so it can never be uploaded with the segments.
    const contentKey = asset.encryption === 'AES_128' ? this.contentKeys.generate() : null;
    const keyPath = path.join(workDirectory, 'keys', 'content.key');
    let encryption: { keyInfoPath: string } | undefined;
    if (contentKey) {
      const keyInfoPath = path.join(workDirectory, 'keys', 'key.info');
      await mkdir(path.dirname(keyPath), { recursive: true, mode: 0o700 });
      await writeFile(keyPath, contentKey.key, { mode: 0o600 });
      await writeFile(keyInfoPath, buildKeyInfo(CONTENT_KEY_URI, keyPath, contentKey.iv), {
        mode: 0o600,
      });
      encryption = { keyInfoPath };
    }

    const args =
      type === 'TRANSCODE'
        ? buildTranscodeArgs({
            sourcePath,
            outputDirectory,
            renditions: planned,
            videoStreamIndex: info.video.index,
            audioStreamIndex: audioStream?.index ?? null,
            timing: {
              segmentSeconds: profile.segmentSeconds,
              keyframeSeconds: profile.keyframeSeconds,
            },
            encryption,
          })
        : buildCopyArgs({
            sourcePath,
            outputDirectory,
            renditionName: renditionNames[0] as string,
            videoStreamIndex: info.video.index,
            audioStreamIndex: audioStream?.index ?? null,
            segmentSeconds: profile.segmentSeconds,
            encryption,
          });

    // Encoding is 0 to 90 percent of the job, uploading the results the rest.
    await this.ffmpeg.ffmpeg(args, {
      signal: context.signal,
      onPosition: (positionMs) =>
        context.onProgress(Math.round(toPercent(positionMs, info.durationMs) * 0.9)),
    });

    // Subtitles are written into the same output and listed in the multivariant
    // playlist before anything is uploaded, so players never see a half-finished asset.
    const subtitles = await this.extractSubtitles(sourcePath, info, outputDirectory, context);

    const audioCodec = audioStream
      ? aacCodecString(type === 'TRANSCODE' ? 'LC' : audioStream.profile)
      : null;
    const variants: MasterVariant[] = [];
    for (const name of renditionNames) {
      variants.push(
        await this.measureVariant(
          outputDirectory,
          name,
          info,
          audioCodec,
          contentKey,
          context.signal,
        ),
      );
    }
    await writeFile(
      path.join(outputDirectory, MASTER_PLAYLIST_NAME),
      buildMasterPlaylist(variants, subtitles.tracks),
    );

    if (contentKey) {
      await rm(path.dirname(keyPath), { recursive: true, force: true });
    }

    const hlsPrefix = `${outputPrefix(asset.id)}/hls`;
    const files = await listFiles(outputDirectory);
    const sizes = await this.uploadFiles(driver, outputDirectory, hlsPrefix, files, context);

    const renditions = variants.map((variant) => {
      const size = files
        .filter((file) => file.startsWith(`${variant.name}/`))
        .reduce((sum, file) => sum + (sizes.get(file) ?? 0), 0);
      return {
        assetId: asset.id,
        name: variant.name,
        width: variant.width,
        height: variant.height,
        bitrate: variant.bitrates.average,
        frameRate: variant.frameRate,
        codec: variant.codecs.join(','),
        playlistPath: `${hlsPrefix}/${variant.name}/${MEDIA_PLAYLIST_NAME}`,
        sizeBytes: BigInt(size),
      };
    });
    const totalBytes = [...sizes.values()].reduce((sum, size) => sum + size, 0);

    await this.prisma.$transaction([
      this.prisma.rendition.deleteMany({ where: { assetId: asset.id } }),
      this.prisma.rendition.createMany({ data: renditions }),
      this.prisma.subtitleTrack.deleteMany({ where: { assetId: asset.id, source: 'EMBEDDED' } }),
      this.prisma.subtitleTrack.createMany({
        data: subtitles.tracks.map((track) => ({
          assetId: asset.id,
          language: track.language,
          label: track.label,
          source: 'EMBEDDED' as const,
          isDefault: track.isDefault,
          isForced: track.isForced,
          path: `${hlsPrefix}/subs/${track.slug}/${SUBTITLE_FILE_NAME}`,
        })),
      }),
      ...this.contentKeys.replaceOperations(asset.id, contentKey),
      this.prisma.asset.update({
        where: { id: asset.id },
        data: {
          status: 'READY',
          manifestPath: `${hlsPrefix}/${MASTER_PLAYLIST_NAME}`,
          readyAt: new Date(),
        },
      }),
      this.prisma.storagePool.update({
        where: { id: asset.storagePoolId },
        data: { usedBytes: { increment: BigInt(totalBytes) } },
      }),
    ]);

    this.logger.log(
      `Asset ${asset.id}: ${type === 'TRANSCODE' ? 'transcoded' : 'repackaged'} into ${renditions.map((r) => r.name).join(', ')}`,
    );

    return {
      renditions: renditions.map((rendition) => rendition.name),
      subtitles: subtitles.tracks.map((track) => track.label),
      ...(subtitles.skipped.length > 0 ? { subtitlesSkipped: subtitles.skipped } : {}),
      encrypted: contentKey !== null,
      files: files.length,
      bytes: totalBytes,
    };
  }

  /**
   * Describes one finished quality for the multivariant playlist: its real
   * picture size, its codec strings and the bitrates of its segments.
   */
  private async measureVariant(
    outputDirectory: string,
    name: string,
    info: MediaInfo,
    audioCodec: string | null,
    contentKey: ContentKey | null,
    signal: AbortSignal,
  ): Promise<MasterVariant> {
    const directory = path.join(outputDirectory, name);
    const playlistPath = path.join(directory, MEDIA_PLAYLIST_NAME);
    const playlist = parseMediaPlaylist(await readFile(playlistPath, 'utf8'));
    if (playlist.segments.length === 0) {
      throw new Error(`FFmpeg produced no playable output for ${name}`);
    }
    if (contentKey && !playlist.encrypted) {
      // Never publish plain segments for an asset that was asked to be encrypted.
      throw new Error(`FFmpeg did not encrypt the output for ${name}`);
    }

    const segments = await Promise.all(
      playlist.segments.map(async (segment) => ({
        bytes: (await stat(path.join(directory, segment.uri))).size,
        duration: segment.duration,
      })),
    );

    // The encoder decides the exact width, so it is read back from the output.
    const probed = parseProbe(await this.probeOutput(directory, playlist, contentKey, signal));
    const fromInit = playlist.initUri
      ? avcCodecString(await readFile(path.join(directory, playlist.initUri)))
      : null;
    const videoCodec =
      fromInit ??
      avcCodecStringFromProfile(probed.video?.profile, probed.video?.level) ??
      'avc1.640028';

    return {
      name,
      width: probed.video?.width ?? info.video?.width ?? 0,
      height: probed.video?.height ?? info.video?.height ?? 0,
      bitrates: measureBitrates(segments),
      codecs: audioCodec ? [videoCodec, audioCodec] : [videoCodec],
      frameRate: info.video?.frameRate ?? null,
    };
  }

  /**
   * Runs ffprobe on one finished quality. An encrypted quality is probed
   * through its first segment, decrypted on the fly, because the playlist
   * points to a key address that only exists on the server.
   */
  private probeOutput(
    directory: string,
    playlist: { segments: { uri: string }[] },
    contentKey: ContentKey | null,
    signal: AbortSignal,
  ): Promise<string> {
    const show = ['-print_format', 'json', '-show_format', '-show_streams'];
    if (!contentKey) {
      return this.ffmpeg.ffprobe([...show, path.join(directory, MEDIA_PLAYLIST_NAME)], signal);
    }

    const firstSegment = path.join(directory, (playlist.segments[0] as { uri: string }).uri);
    return this.ffmpeg.ffprobe(
      [
        '-key',
        contentKey.key.toString('hex'),
        '-iv',
        contentKey.iv.toString('hex'),
        ...show,
        `crypto:${firstSegment}`,
      ],
      signal,
    );
  }

  /**
   * Converts the text subtitle streams of the source to WebVTT, each in its
   * own folder with an HLS playlist. A stream that cannot be converted is
   * reported and left out. It never fails the asset.
   */
  private async extractSubtitles(
    sourcePath: string,
    info: MediaInfo,
    outputDirectory: string,
    context: StepContext,
  ): Promise<{ tracks: SubtitleTrackPlan[]; skipped: string[] }> {
    const plan = planSubtitles(info);
    const tracks: SubtitleTrackPlan[] = [];
    const skipped = [...plan.skipped];

    for (const track of plan.tracks) {
      const directory = path.join(outputDirectory, 'subs', track.slug);
      await mkdir(directory, { recursive: true });

      try {
        await this.ffmpeg.ffmpeg(
          buildSubtitleArgs(
            sourcePath,
            track.streamIndex,
            path.join(directory, SUBTITLE_FILE_NAME),
          ),
          { signal: context.signal },
        );
        await writeFile(
          path.join(directory, SUBTITLE_PLAYLIST_NAME),
          buildSubtitlePlaylist(info.durationMs ?? 0),
        );
        tracks.push(track);
      } catch (error) {
        context.signal.throwIfAborted();
        await rm(directory, { recursive: true, force: true });
        skipped.push(
          `Subtitle track "${track.label}" could not be converted: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { tracks, skipped };
  }

  // --- Thumbnails ----------------------------------------------------------

  private async thumbnails(
    context: StepContext,
    workDirectory: string,
  ): Promise<Record<string, unknown>> {
    const asset = await this.loadAsset(context.assetId);
    if (!asset.probe) {
      throw new NonRetryableProcessingError('The asset has not been probed');
    }
    const info = parseProbe(JSON.stringify(asset.probe));
    if (!info.video) {
      throw new NonRetryableProcessingError('The file contains no video stream');
    }

    const driver = await this.storage.getDriver(asset.storagePoolId);
    const sourcePath = await this.localSource(asset, driver, workDirectory);
    const posterPath = path.join(workDirectory, 'poster.jpg');
    const durationSeconds = (info.durationMs ?? 0) / 1000;

    await this.ffmpeg.ffmpeg(
      buildPosterArgs({
        sourcePath,
        outputPath: posterPath,
        videoStreamIndex: info.video.index,
        atSeconds: Math.min(
          durationSeconds * POSTER_POSITION_FRACTION,
          POSTER_POSITION_CAP_SECONDS,
        ),
        maxHeight: POSTER_MAX_HEIGHT,
      }),
      { signal: context.signal },
    );

    const key = `${outputPrefix(asset.id)}/thumbs/poster.jpg`;
    const size = (await stat(posterPath)).size;
    await driver.write(key, createReadStream(posterPath), { contentType: CONTENT_TYPES['.jpg'] });

    const thumbnails: {
      type: 'POSTER' | 'SPRITE' | 'SPRITE_VTT';
      path: string;
      width?: number;
      height?: number;
    }[] = [{ type: 'POSTER', path: key }];
    let totalBytes = size;

    // The sprite sheet for seek-bar previews, with the WebVTT file that indexes it.
    const rotated = info.video.rotation % 180 !== 0;
    const plan = planSprite(
      info.durationMs ?? 0,
      rotated ? info.video.height : info.video.width,
      rotated ? info.video.width : info.video.height,
    );
    if (plan) {
      const spritePath = path.join(workDirectory, 'sprite.jpg');
      await this.ffmpeg.ffmpeg(
        buildSpriteArgs({
          sourcePath,
          outputPath: spritePath,
          videoStreamIndex: info.video.index,
          plan,
        }),
        { signal: context.signal },
      );

      const spriteKey = `${outputPrefix(asset.id)}/thumbs/sprite.jpg`;
      const vttKey = `${outputPrefix(asset.id)}/thumbs/sprite.vtt`;
      const vtt = Buffer.from(buildSpriteVtt(plan, info.durationMs ?? 0, 'sprite.jpg'));
      await driver.write(spriteKey, createReadStream(spritePath), {
        contentType: CONTENT_TYPES['.jpg'],
      });
      await driver.write(vttKey, vtt, { contentType: CONTENT_TYPES['.vtt'] });

      totalBytes += (await stat(spritePath)).size + vtt.length;
      thumbnails.push(
        { type: 'SPRITE', path: spriteKey, width: plan.tileWidth, height: plan.tileHeight },
        { type: 'SPRITE_VTT', path: vttKey },
      );
    }

    await this.prisma.$transaction([
      this.prisma.thumbnail.deleteMany({ where: { assetId: asset.id } }),
      this.prisma.thumbnail.createMany({
        data: thumbnails.map((thumbnail) => ({ assetId: asset.id, ...thumbnail })),
      }),
      this.prisma.storagePool.update({
        where: { id: asset.storagePoolId },
        data: { usedBytes: { increment: BigInt(totalBytes) } },
      }),
    ]);

    return {
      poster: key,
      sprite: plan ? { pictures: plan.count, everySeconds: plan.intervalSeconds } : null,
      bytes: totalBytes,
    };
  }

  // --- Shared helpers ------------------------------------------------------

  private async loadAsset(assetId: string): Promise<Asset & { sourcePath: string }> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status === 'DELETED') {
      throw new NonRetryableProcessingError('The asset no longer exists');
    }
    if (!asset.sourcePath) {
      throw new NonRetryableProcessingError('The asset has no source file');
    }
    return asset as Asset & { sourcePath: string };
  }

  /**
   * Returns a path FFmpeg can read the source from. A pool on local disk is
   * read in place. From any other pool the file is downloaded first.
   */
  private async localSource(
    asset: Asset & { sourcePath: string },
    driver: StorageDriver,
    workDirectory: string,
  ): Promise<string> {
    if (driver.localPath) {
      return driver.localPath(asset.sourcePath);
    }

    const target = path.join(workDirectory, `source${path.extname(asset.sourcePath)}`);
    await pipeline(await driver.read(asset.sourcePath), createWriteStream(target));
    return target;
  }

  /** Uploads files from a directory and returns the size of each. */
  private async uploadFiles(
    driver: StorageDriver,
    directory: string,
    keyPrefix: string,
    files: readonly string[],
    context: StepContext,
  ): Promise<Map<string, number>> {
    const sizes = new Map<string, number>();

    for (const [index, file] of files.entries()) {
      context.signal.throwIfAborted();

      const fullPath = path.join(directory, ...file.split('/'));
      sizes.set(file, (await stat(fullPath)).size);
      await driver.write(`${keyPrefix}/${file}`, createReadStream(fullPath), {
        contentType: CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      });

      context.onProgress(90 + Math.round(((index + 1) / files.length) * 10));
    }

    return sizes;
  }

  /** Gives a step a private directory and removes it afterwards, whatever happens. */
  private async withWorkDirectory<Result>(
    context: StepContext,
    work: (directory: string) => Promise<Result>,
  ): Promise<Result> {
    const directory = path.join(this.config.processingTempPath, context.jobId);
    await mkdir(directory, { recursive: true });
    try {
      return await work(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
