// SPDX-License-Identifier: AGPL-3.0-only
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { type Asset, type AudioTrack, type JobType, Prisma, PrismaClient } from '@onyx/database';
import { AudioTracksService, folderOf } from '../audio-tracks/audio-tracks.service.js';
import { AppConfig } from '../config/app-config.js';
import { type ContentKey, ContentKeysService } from '../crypto/content-keys.service.js';
import { EncodingProfilesService } from '../encoding-profiles/encoding-profiles.service.js';
import type { StorageDriver } from '../storage/storage-driver.js';
import { StorageService } from '../storage/storage.service.js';
import { SubtitlesService } from '../subtitles/subtitles.service.js';
import { FfmpegRunner } from './ffmpeg/ffmpeg-runner.js';
import { toPercent } from './ffmpeg/progress.js';
import {
  ALTERNATE_AUDIO_CHANNELS,
  type AudioMediaEntry,
  type AudioTrackPlan,
  buildAudioArgs,
  DEFAULT_ALTERNATE_BITRATE,
  planAudio,
  withAudioTracks,
} from './media/audio.js';
import { DetectionImpossibleError, MarkerDetector } from '../markers/marker-detector.js';
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
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service.js';

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
  '.ts': 'video/mp2t',
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
    @Inject(WebhookDeliveryService) private readonly webhooks: WebhookDeliveryService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(EncodingProfilesService) private readonly profiles: EncodingProfilesService,
    @Inject(PipelineService) private readonly pipelineService: PipelineService,
    @Inject(FfmpegRunner) private readonly ffmpeg: FfmpegRunner,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(ContentKeysService) private readonly contentKeys: ContentKeysService,
    @Inject(SubtitlesService) private readonly subtitleFiles: SubtitlesService,
    @Inject(AudioTracksService) private readonly audioTracks: AudioTracksService,
    @Inject(MarkerDetector) private readonly markerDetector: MarkerDetector,
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
      case 'AUDIO':
        return this.withWorkDirectory(context, (directory) => this.addAudio(context, directory));
      case 'MARKERS':
        return this.withWorkDirectory(context, async (directory) => {
          try {
            return await this.markerDetector.run(context, directory);
          } catch (error) {
            if (error instanceof DetectionImpossibleError) {
              throw new NonRetryableProcessingError(error.message);
            }
            throw error;
          }
        });
      case 'CLEANUP':
        return this.cleanup(context);
      default:
        throw new NonRetryableProcessingError(`Job type ${type} is not implemented yet`);
    }
  }

  // --- Cleanup -------------------------------------------------------------

  /** Removes the files of a deleted asset. */
  private async cleanup(context: StepContext): Promise<Record<string, unknown>> {
    try {
      return { freedBytes: Number(await this.pipelineService.purge(context.assetId)) };
    } catch (error) {
      if (error instanceof ConflictException) {
        // The asset is not deleted. Trying again would not change that.
        throw new NonRetryableProcessingError(error.message);
      }
      throw error;
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

    // The qualities hold the picture only. Every sound stream becomes a track
    // of its own, taken as it is where the picture is too.
    const audioPlan = planAudio(info, type === 'REMUX');
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
            audioStreamIndex: null,
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
            audioStreamIndex: null,
            segmentSeconds: profile.segmentSeconds,
            encryption,
          });

    // Encoding the picture is 0 to 80 percent of the job, the sound the next
    // ten, uploading the results the rest.
    await this.ffmpeg.ffmpeg(args, {
      signal: context.signal,
      onPosition: (positionMs) =>
        context.onProgress(Math.round(toPercent(positionMs, info.durationMs) * 0.8)),
    });

    const audioBitrate = Math.max(
      DEFAULT_ALTERNATE_BITRATE,
      ...profile.renditions.map((rendition) => rendition.audioBitrate),
    );
    const sound = await this.encodeTracks(
      asset,
      driver,
      sourcePath,
      audioPlan.tracks,
      { outputDirectory, workDirectory },
      { segmentSeconds: profile.segmentSeconds, bitrate: audioBitrate, encryption },
      contentKey !== null,
      context,
    );

    // Subtitles are written into the same output and listed in the multivariant
    // playlist before anything is uploaded, so players never see a half-finished asset.
    const subtitles = await this.extractSubtitles(sourcePath, info, outputDirectory, context);
    // Tracks an admin added, or that came beside the file, are put back into the new output.
    const added = await this.subtitleFiles.restoreInto(
      asset.id,
      outputDirectory,
      info.durationMs ?? 0,
      subtitles.tracks,
    );

    const variants: MasterVariant[] = [];
    for (const name of renditionNames) {
      variants.push(
        await this.measureVariant(outputDirectory, name, info, null, contentKey, context.signal),
      );
    }
    // What a player needs for a quality is its picture and the sound with it.
    const withSound = variants.map((variant) => ({
      ...variant,
      bitrates: {
        peak: variant.bitrates.peak + sound.bitrate,
        average: variant.bitrates.average + sound.bitrate,
      },
    }));
    await writeFile(
      path.join(outputDirectory, MASTER_PLAYLIST_NAME),
      withAudioTracks(
        buildMasterPlaylist(withSound, [...subtitles.tracks, ...added]),
        sound.entries,
        sound.codec,
      ),
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
    const folderBytes = (folder: string | null): bigint =>
      BigInt(
        folder
          ? files
              .filter((file) => file.startsWith(`${folder}/`))
              .reduce((sum, file) => sum + (sizes.get(file) ?? 0), 0)
          : 0,
      );

    await this.prisma.$transaction([
      this.prisma.rendition.deleteMany({ where: { assetId: asset.id } }),
      this.prisma.rendition.createMany({ data: renditions }),
      this.prisma.audioTrack.deleteMany({ where: { assetId: asset.id, source: 'EMBEDDED' } }),
      this.prisma.audioTrack.createMany({
        data: sound.embedded.map((track) => ({
          assetId: asset.id,
          language: track.language,
          label: track.label,
          codec: track.codec,
          channels: track.channels,
          bitrate: track.bitrate,
          isDefault: track.isDefault,
          source: 'EMBEDDED' as const,
          streamIndex: track.streamIndex,
          playlistPath: `${hlsPrefix}/${track.folder}/${MEDIA_PLAYLIST_NAME}`,
          sizeBytes: folderBytes(track.folder),
        })),
      }),
      ...sound.added.map((track) =>
        this.prisma.audioTrack.updateMany({
          where: { id: track.id },
          data: track.ok
            ? {
                status: 'READY' as const,
                error: null,
                channels: ALTERNATE_AUDIO_CHANNELS,
                bitrate: track.bitrate,
                isDefault: track.isDefault,
                sizeBytes: folderBytes(track.folder),
              }
            : { status: 'FAILED' as const, error: track.error, isDefault: false },
        }),
      ),
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
      // Only an asset still in processing becomes ready. One deleted in the meantime stays deleted.
      this.prisma.asset.updateMany({
        where: { id: asset.id, status: 'PROCESSING' },
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

    // A track added while this ran is not in the playlist written above.
    if ((await this.subtitleFiles.countAdded(asset.id)) !== added.length) {
      await this.subtitleFiles.publish(asset.id);
    }
    // So is a sound track added or changed while this ran.
    await this.audioTracks.publish(asset.id);
    await this.webhooks.announceAsset(asset.id);

    this.logger.log(
      `Asset ${asset.id}: ${type === 'TRANSCODE' ? 'transcoded' : 'repackaged'} into ${renditions.map((r) => r.name).join(', ')}`,
    );

    return {
      renditions: renditions.map((rendition) => rendition.name),
      audio: sound.entries.map((track) => track.label),
      ...(sound.skipped.length > 0 || audioPlan.skipped.length > 0
        ? { audioSkipped: [...audioPlan.skipped, ...sound.skipped] }
        : {}),
      subtitles: subtitles.tracks.map((track) => track.label),
      ...(subtitles.skipped.length > 0 ? { subtitlesSkipped: subtitles.skipped } : {}),
      encrypted: contentKey !== null,
      files: files.length,
      bytes: totalBytes,
    };
  }

  /**
   * Makes the sound tracks of a video beside its picture: the streams of the
   * source, and the files that were added to the video before. A track that
   * cannot be made is reported and left out.
   *
   * What an admin said about a track of the source (its name, its language,
   * that players start with it) is kept, by the position of its stream.
   *
   * @throws Error when the source has sound and none of it could be made:
   *   a video that lost its sound is not one to publish.
   */
  private async encodeTracks(
    asset: Asset,
    driver: StorageDriver,
    sourcePath: string,
    plan: readonly AudioTrackPlan[],
    directories: { outputDirectory: string; workDirectory: string },
    encoding: { segmentSeconds: number; bitrate: number; encryption?: { keyInfoPath: string } },
    encrypted: boolean,
    context: StepContext,
  ): Promise<{
    embedded: (AudioTrackPlan & { bitrate: number })[];
    added: (
      | { id: string; ok: true; folder: string; bitrate: number; isDefault: boolean }
      | { id: string; ok: false; error: string }
    )[];
    entries: AudioMediaEntry[];
    skipped: string[];
    /** The most bits per second any track takes, to add to what a quality needs. */
    bitrate: number;
    /** The codec string of the sound, for the qualities to name. */
    codec: string;
  }> {
    const { outputDirectory, workDirectory } = directories;
    const before = await this.prisma.audioTrack.findMany({ where: { assetId: asset.id } });
    const said = new Map(
      before
        .filter((track) => track.source === 'EMBEDDED' && track.streamIndex !== null)
        .map((track) => [track.streamIndex as number, track]),
    );
    const uploaded = before.filter((track) => track.source === 'UPLOADED' && track.sourcePath);
    const steps = plan.length + uploaded.length;
    let done = 0;
    const advance = () => {
      done += 1;
      context.onProgress(80 + Math.round((done / Math.max(1, steps)) * 10));
    };

    const skipped: string[] = [];
    const embedded: (AudioTrackPlan & { bitrate: number })[] = [];
    for (const track of plan) {
      const kept = said.get(track.streamIndex);
      const described = {
        ...track,
        language: kept?.language ?? track.language,
        label: kept?.label ?? track.label,
        isDefault: kept ? kept.isDefault : track.isDefault,
      };
      const directory = path.join(outputDirectory, track.folder);
      const source = { sourcePath, streamIndex: track.streamIndex };
      try {
        let made;
        try {
          made = await this.encodeAudio(
            source,
            directory,
            { ...encoding, copy: track.copy },
            encrypted,
            context.signal,
          );
        } catch (error) {
          context.signal.throwIfAborted();
          if (!track.copy) {
            throw error;
          }
          // A stream that cannot be taken as it is can still be encoded.
          await rm(directory, { recursive: true, force: true });
          made = await this.encodeAudio(source, directory, encoding, encrypted, context.signal);
          described.copy = false;
          described.channels = ALTERNATE_AUDIO_CHANNELS;
          described.profile = 'LC';
        }
        embedded.push({ ...described, bitrate: made.bitrate });
      } catch (error) {
        context.signal.throwIfAborted();
        await rm(directory, { recursive: true, force: true });
        skipped.push(
          `Sound track "${track.label}" could not be made: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      advance();
    }
    if (plan.length > 0 && embedded.length === 0) {
      throw new Error(`The sound of the file could not be made. ${skipped.join('. ')}`);
    }

    const added: Awaited<ReturnType<ProcessingSteps['encodeTracks']>>['added'] = [];
    for (const track of uploaded) {
      const folder = folderOf(track) as string;
      try {
        const file = await this.localFile(
          driver,
          track.sourcePath as string,
          path.join(workDirectory, `added-${track.id}`),
        );
        const made = await this.encodeAudio(
          { sourcePath: file, streamIndex: 0 },
          path.join(outputDirectory, folder),
          encoding,
          encrypted,
          context.signal,
        );
        added.push({
          id: track.id,
          ok: true,
          folder,
          bitrate: made.bitrate,
          isDefault: track.isDefault,
        });
      } catch (error) {
        context.signal.throwIfAborted();
        await rm(path.join(outputDirectory, folder), { recursive: true, force: true });
        const reason = error instanceof Error ? error.message : String(error);
        added.push({ id: track.id, ok: false, error: reason.slice(0, 500) });
        skipped.push(
          `Added sound track "${track.label ?? track.language}" could not be made: ${reason}`,
        );
      }
      advance();
    }

    // One track is the one players start with: an added one that was chosen, or one of the file.
    const chosenAdded = added.find((track) => track.ok && track.isDefault);
    const chosenEmbedded = embedded.find((track) => track.isDefault) ?? embedded[0];
    for (const track of embedded) {
      track.isDefault = !chosenAdded && track === chosenEmbedded;
    }
    const startsWith =
      chosenAdded ?? (chosenEmbedded ? undefined : added.find((track) => track.ok));
    for (const track of added) {
      if (track.ok) {
        track.isDefault = track === startsWith;
      }
    }
    const byId = new Map(uploaded.map((track) => [track.id, track]));
    const entries: AudioMediaEntry[] = [
      ...embedded.map((track) => ({
        folder: track.folder,
        language: track.language,
        label: track.label,
        isDefault: track.isDefault,
        channels: track.channels,
      })),
      ...added.flatMap((track) => {
        const row = byId.get(track.id) as AudioTrack;
        return track.ok
          ? [
              {
                folder: track.folder,
                language: row.language,
                label: row.label ?? row.language,
                isDefault: track.isDefault,
                channels: ALTERNATE_AUDIO_CHANNELS,
              },
            ]
          : [];
      }),
    ];
    const first = embedded.find((track) => track.isDefault) ?? embedded[0];
    return {
      embedded,
      added,
      entries,
      skipped,
      bitrate: Math.max(
        0,
        ...embedded.map((track) => track.bitrate),
        ...added.map((track) => (track.ok ? track.bitrate : 0)),
      ),
      codec: aacCodecString(first?.profile ?? 'LC'),
    };
  }

  /**
   * Makes one sound stream into a folder of its own and says how many bits
   * per second it came to.
   *
   * @throws Error when FFmpeg produced nothing to play, or left it unencrypted when asked to encrypt.
   */
  private async encodeAudio(
    source: { sourcePath: string; streamIndex: number },
    directory: string,
    encoding: {
      segmentSeconds: number;
      bitrate: number;
      copy?: boolean;
      encryption?: { keyInfoPath: string };
    },
    encrypted: boolean,
    signal: AbortSignal,
    onPosition?: (positionMs: number) => void,
  ): Promise<{ bitrate: number; bytes: number; durationMs: number }> {
    await mkdir(directory, { recursive: true });
    await this.ffmpeg.ffmpeg(
      buildAudioArgs({ ...source, outputDirectory: directory, ...encoding }),
      { signal, onPosition },
    );
    const playlist = parseMediaPlaylist(
      await readFile(path.join(directory, MEDIA_PLAYLIST_NAME), 'utf8'),
    );
    if (playlist.segments.length === 0) {
      throw new Error('FFmpeg produced no sound to play');
    }
    if (encrypted && !playlist.encrypted) {
      // Never publish plain segments for an asset that was asked to be encrypted.
      throw new Error('FFmpeg did not encrypt the sound');
    }
    const segments = await Promise.all(
      playlist.segments.map(async (segment) => ({
        bytes: (await stat(path.join(directory, segment.uri))).size,
        duration: segment.duration,
      })),
    );
    return {
      bitrate: measureBitrates(segments).average,
      bytes: segments.reduce((sum, segment) => sum + segment.bytes, 0),
      durationMs: Math.round(segments.reduce((sum, segment) => sum + segment.duration, 0) * 1000),
    };
  }

  // --- Sound added to a video ------------------------------------------------

  /**
   * Makes a track of a sound file that was added to a video that is ready:
   * encodes it beside the qualities, uploads it and names it in the
   * multivariant playlist. The picture is not touched.
   */
  private async addAudio(
    context: StepContext,
    workDirectory: string,
  ): Promise<Record<string, unknown>> {
    const job = await this.prisma.job.findUnique({ where: { id: context.jobId } });
    const trackId = (job?.input as { trackId?: unknown } | null)?.trackId;
    const track =
      typeof trackId === 'string'
        ? await this.prisma.audioTrack.findFirst({
            where: { id: trackId, assetId: context.assetId },
          })
        : null;
    if (!track || !track.sourcePath || !track.playlistPath) {
      // Removed while it waited. There is nothing to do, and nothing went wrong.
      return { skipped: 'The track is no longer there' };
    }

    try {
      const asset = await this.prisma.asset.findUnique({ where: { id: context.assetId } });
      if (!asset || asset.status !== 'READY' || !asset.manifestPath) {
        // Processing the video makes the track when it gets there.
        return { skipped: 'The video is being processed and will make the track itself' };
      }
      const driver = await this.storage.getDriver(asset.storagePoolId);
      const file = await this.localFile(driver, track.sourcePath, path.join(workDirectory, 'in'));

      let info: MediaInfo;
      try {
        info = parseProbe(
          await this.ffmpeg.ffprobe(
            ['-print_format', 'json', '-show_format', '-show_streams', file],
            context.signal,
          ),
        );
      } catch {
        context.signal.throwIfAborted();
        throw new NonRetryableProcessingError('The file is not a media file that can be read');
      }
      const stream = info.audio.find((candidate) => candidate.isDefault) ?? info.audio[0];
      if (!stream) {
        throw new NonRetryableProcessingError('The file has no sound in it');
      }

      const profile = asset.encodingProfileId
        ? await this.profiles.get(asset.encodingProfileId)
        : await this.profiles.getDefault();
      const contentKey =
        asset.encryption === 'AES_128' ? await this.contentKeys.find(asset.id) : null;
      if (asset.encryption === 'AES_128' && !contentKey) {
        throw new NonRetryableProcessingError(
          'The video is encrypted and its key is not there. Process the video again',
        );
      }
      let encryption: { keyInfoPath: string } | undefined;
      const keyDirectory = path.join(workDirectory, 'keys');
      if (contentKey) {
        const keyPath = path.join(keyDirectory, 'content.key');
        const keyInfoPath = path.join(keyDirectory, 'key.info');
        await mkdir(keyDirectory, { recursive: true, mode: 0o700 });
        await writeFile(keyPath, contentKey.key, { mode: 0o600 });
        await writeFile(keyInfoPath, buildKeyInfo(CONTENT_KEY_URI, keyPath, contentKey.iv), {
          mode: 0o600,
        });
        encryption = { keyInfoPath };
      }

      const folder = folderOf(track) as string;
      const outputDirectory = path.join(workDirectory, 'out', folder);
      const made = await this.encodeAudio(
        { sourcePath: file, streamIndex: stream.index },
        outputDirectory,
        {
          segmentSeconds: profile.segmentSeconds,
          bitrate: Math.max(
            DEFAULT_ALTERNATE_BITRATE,
            ...profile.renditions.map((rendition) => rendition.audioBitrate),
          ),
          encryption,
        },
        contentKey !== null,
        context.signal,
        (positionMs) =>
          context.onProgress(Math.round(toPercent(positionMs, info.durationMs) * 0.9)),
      );
      await rm(keyDirectory, { recursive: true, force: true });

      const prefix = track.playlistPath.slice(0, track.playlistPath.lastIndexOf('/'));
      // A second try starts clean.
      let replaced = 0;
      for await (const entry of driver.list(prefix)) {
        replaced += entry.size;
      }
      await driver.deletePrefix(prefix);
      const files = await listFiles(outputDirectory);
      const sizes = await this.uploadFiles(driver, outputDirectory, prefix, files, context);
      const bytes = [...sizes.values()].reduce((sum, size) => sum + size, 0);

      // Removed in the meantime: what was just uploaded goes again.
      if ((await this.prisma.audioTrack.count({ where: { id: track.id } })) === 0) {
        await driver.deletePrefix(prefix);
        await this.audioTracks.account(asset, -replaced);
        return { skipped: 'The track was removed while it was made' };
      }
      await this.audioTracks.settle(track.id, {
        ok: true,
        channels: ALTERNATE_AUDIO_CHANNELS,
        bitrate: made.bitrate,
        sizeBytes: bytes,
      });
      await this.audioTracks.account(asset, bytes - replaced);
      await this.audioTracks.publish(asset.id);

      // Sound that is much shorter or longer than the picture belongs to another cut.
      const difference = asset.durationMs ? made.durationMs - asset.durationMs : 0;
      const warning =
        Math.abs(difference) > 5000
          ? `The sound is ${Math.round(Math.abs(difference) / 1000)} seconds ${difference > 0 ? 'longer' : 'shorter'} than the video. Check that the file belongs to this cut of it.`
          : null;
      this.logger.log(
        `Asset ${asset.id}: added the sound track "${track.label ?? track.language}"`,
      );
      return {
        track: track.label ?? track.language,
        from: `${stream.codec}, ${stream.channels} channels`,
        files: files.length,
        bytes,
        ...(warning ? { warning } : {}),
      };
    } catch (error) {
      // A file that cannot be made into sound will not become one on a second try.
      const reason = context.signal.aborted
        ? 'Cancelled'
        : error instanceof Error
          ? error.message
          : String(error);
      await this.audioTracks.settle(track.id, { ok: false, error: reason });
      this.announce(context.assetId);
      if (context.signal.aborted || error instanceof NonRetryableProcessingError) {
        throw error;
      }
      throw new NonRetryableProcessingError(reason);
    }
  }

  /** Tells the panel that the tracks of a video changed. */
  private announce(assetId: string): void {
    void this.audioTracks.publish(assetId).catch(() => undefined);
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

  /** The same for any other file of the pool, such as an added sound file. */
  private async localFile(driver: StorageDriver, key: string, target: string): Promise<string> {
    if (driver.localPath) {
      return driver.localPath(key);
    }
    const file = `${target}${path.extname(key)}`;
    await mkdir(path.dirname(file), { recursive: true });
    await pipeline(await driver.read(key), createWriteStream(file));
    return file;
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
