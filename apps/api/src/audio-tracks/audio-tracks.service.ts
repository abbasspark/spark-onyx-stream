// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { type Readable, Transform } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { type Asset, type AudioTrack, PrismaClient } from '@onyx/database';
import { EventPublisher } from '../events/event-publisher.js';
import { JobsService } from '../jobs/jobs.service.js';
import {
  AUDIO_FOLDER_PREFIX,
  type AudioMediaEntry,
  audioLabel,
  audioLanguage,
  mainAudioStream,
  MAX_AUDIO_TRACKS,
  withAudioTracks,
  withUniqueAudioLabels,
} from '../processing/media/audio.js';
import { parseProbe } from '../processing/media/media-info.js';
import { StorageService } from '../storage/storage.service.js';
import { audioPrefix } from './audio-paths.js';

/** The largest sound file taken: three hours of uncompressed surround fit. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024 * 1024;

/** File names a sound file may have. Others are taken too, and read by what is inside. */
const KNOWN_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.flac',
  '.ogg',
  '.opus',
  '.ac3',
  '.eac3',
  '.mka',
  '.mp4',
  '.mkv',
  '.mov',
  '.webm',
];

export interface AddAudioInput {
  /** The name of the file, to read the language from when none is given. */
  fileName?: string | null;
  language?: string | null;
  label?: string | null;
}

export interface UpdateAudioInput {
  language?: string;
  label?: string;
  /** True makes this the track players start with. */
  isDefault?: true;
}

/** The folder of a track inside the HLS output, from the path of its playlist. Null for sound inside the video. */
export function folderOf(track: Pick<AudioTrack, 'playlistPath'>): string | null {
  return track.playlistPath ? (track.playlistPath.split('/').at(-2) ?? null) : null;
}

/** "film.de.mp3" and "Film - German.m4a" say their language in the name. */
export function languageFromFileName(fileName: string): string | null {
  const stem = fileName.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  const last =
    stem
      .split(/[._\-\s]+/)
      .at(-1)
      ?.toLowerCase() ?? '';
  if (/^[a-z]{2,3}$/.test(last)) {
    const language = audioLanguage(last);
    // Two letters at the end of a name are a language far more often than three.
    return language !== 'und' && (last.length === 2 || language !== last) ? language : null;
  }
  return null;
}

function muxedFirst(tracks: readonly AudioTrack[]): AudioTrack[] {
  const rank = (track: AudioTrack) =>
    track.playlistPath === null ? 0 : track.source === 'EMBEDDED' ? 1 : 2;
  return [...tracks].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.streamIndex ?? 0) - (b.streamIndex ?? 0) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

/**
 * The sound tracks of a video: the ones its source file brought, and the
 * ones added afterwards, such as a dubbed version.
 *
 * The rows of the database are the truth. After every change the lines of
 * the multivariant playlist are written anew from them. The file of an added
 * track is kept outside the output, so that processing the video again,
 * which replaces the whole output, can make the track again.
 */
@Injectable()
export class AudioTracksService {
  private readonly logger = new Logger(AudioTracksService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(EventPublisher) private readonly events: EventPublisher,
  ) {}

  /**
   * The tracks of a video: the one inside the video first, then the others
   * of the source, then the added ones.
   */
  async list(assetId: string): Promise<AudioTrack[]> {
    const asset = await this.assetOrThrow(assetId);
    await this.ensureMain(asset);
    return muxedFirst(await this.prisma.audioTrack.findMany({ where: { assetId } }));
  }

  /**
   * Takes a sound file for a video and queues the work that makes a track of
   * it. The track shows as "processing" until that is done.
   *
   * @throws ConflictException while the video cannot be played, or when it has all the tracks it can have.
   * @throws PayloadTooLargeException for a file beyond the limit.
   */
  async add(assetId: string, body: Readable, input: AddAudioInput = {}): Promise<AudioTrack> {
    const asset = await this.assetOrThrow(assetId);
    if (asset.status !== 'READY' || !asset.manifestPath) {
      throw new ConflictException('Sound can be added once the video is processed and ready');
    }
    await this.ensureMain(asset);
    const existing = await this.prisma.audioTrack.findMany({ where: { assetId } });
    if (existing.some((track) => track.playlistPath === null)) {
      throw new ConflictException(
        'This video was processed before sound was kept apart from the picture. Process it again once, then add sound to it',
      );
    }
    if (existing.length >= MAX_AUDIO_TRACKS) {
      throw new ConflictException(`A video has ${MAX_AUDIO_TRACKS} sound tracks at most`);
    }

    const fileName = input.fileName?.trim() || null;
    const language = input.language ?? (fileName ? languageFromFileName(fileName) : null) ?? 'und';
    const label = this.freeLabel(
      input.label?.trim() || audioLabel(language, existing.length + 1),
      existing,
    );
    const id = randomUUID();
    const extension = fileName ? path.extname(fileName).toLowerCase() : '';
    const sourcePath = `${audioPrefix(assetId)}/${id}${KNOWN_EXTENSIONS.includes(extension) ? extension : '.bin'}`;

    const driver = await this.storage.getDriver(asset.storagePoolId);
    let bytes = 0;
    const counted = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        done(
          bytes > MAX_AUDIO_BYTES
            ? new PayloadTooLargeException(
                `The file is larger than ${MAX_AUDIO_BYTES / 1024 ** 3} GB`,
              )
            : null,
          chunk,
        );
      },
    });
    body.on('error', (error) => counted.destroy(error));
    try {
      await driver.write(sourcePath, body.pipe(counted));
    } catch (error) {
      await driver.delete(sourcePath).catch(() => undefined);
      throw error;
    }
    if (bytes === 0) {
      await driver.delete(sourcePath).catch(() => undefined);
      throw new BadRequestException('The file is empty');
    }

    const track = await this.prisma.audioTrack.create({
      data: {
        id,
        assetId,
        language,
        label,
        codec: 'aac',
        channels: 0,
        bitrate: 0,
        source: 'UPLOADED',
        status: 'PROCESSING',
        sourcePath,
        sourceFilename: fileName?.slice(0, 300) ?? null,
        playlistPath: `${this.hlsPrefix(assetId)}/${AUDIO_FOLDER_PREFIX}u-${id}/playlist.m3u8`,
      },
    });
    await this.account(asset, bytes);
    await this.jobs.enqueue({ type: 'AUDIO', assetId, input: { trackId: id } });
    this.events.publish({ type: 'asset', assetId, change: 'updated' });
    return track;
  }

  /** Renames a track, changes its language, or makes it the one players start with. */
  async update(assetId: string, trackId: string, input: UpdateAudioInput): Promise<AudioTrack> {
    const track = await this.trackOrThrow(assetId, trackId);
    const label = input.label?.trim();
    if (label) {
      const others = await this.prisma.audioTrack.findMany({
        where: { assetId, id: { not: trackId } },
      });
      if (others.some((other) => other.label === label)) {
        throw new ConflictException('Another track of this video has that name already');
      }
    }
    if (input.isDefault && track.status !== 'READY') {
      throw new ConflictException('Only a track that is ready can be the one players start with');
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      if (input.isDefault) {
        await transaction.audioTrack.updateMany({
          where: { assetId, id: { not: trackId } },
          data: { isDefault: false },
        });
      }
      return transaction.audioTrack.update({
        where: { id: track.id },
        data: {
          language: input.language,
          label: label || undefined,
          ...(input.isDefault ? { isDefault: true } : {}),
        },
      });
    });
    await this.publish(assetId);
    return updated;
  }

  /**
   * Takes a track out of a video. The sound inside the video cannot be taken
   * out. A track that came with the source file comes back when the video is
   * processed again.
   */
  async remove(assetId: string, trackId: string): Promise<AudioTrack> {
    const track = await this.trackOrThrow(assetId, trackId);
    if (track.playlistPath === null) {
      throw new ConflictException(
        'This sound is inside the picture of the video. Process the video again to keep it apart',
      );
    }
    if (track.source === 'EMBEDDED' && track.status === 'READY') {
      const others = await this.prisma.audioTrack.count({
        where: { assetId, status: 'READY', id: { not: trackId } },
      });
      if (others === 0) {
        throw new ConflictException(
          'This is the only sound of the video. Add another track first, or it would be silent',
        );
      }
    }
    const asset = await this.assetOrThrow(assetId);
    const driver = await this.storage.getDriver(asset.storagePoolId);
    await this.prisma.audioTrack.delete({ where: { id: track.id } });
    // The work of an added track that is still waiting has nothing left to do.
    await this.cancelJobs(assetId, trackId);
    if (track.isDefault) {
      // Players start with the first of what is left.
      const next = muxedFirst(
        await this.prisma.audioTrack.findMany({ where: { assetId, status: 'READY' } }),
      )[0];
      if (next) {
        await this.prisma.audioTrack.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
    // The playlist stops naming the track before its files go.
    await this.publish(assetId);

    let bytes = 0;
    const folder = track.playlistPath.slice(0, track.playlistPath.lastIndexOf('/'));
    for await (const entry of driver.list(folder)) {
      bytes += entry.size;
    }
    await driver.deletePrefix(folder);
    if (track.sourcePath) {
      bytes += (await driver.stat(track.sourcePath))?.size ?? 0;
      await driver.delete(track.sourcePath).catch(() => undefined);
    }
    await this.account(asset, -bytes);
    return track;
  }

  /** Tries an added track again that could not be made. */
  async retry(assetId: string, trackId: string): Promise<AudioTrack> {
    const track = await this.trackOrThrow(assetId, trackId);
    if (track.status !== 'FAILED' || !track.sourcePath) {
      throw new ConflictException('Only an added track that failed can be tried again');
    }
    const updated = await this.prisma.audioTrack.update({
      where: { id: trackId },
      data: { status: 'PROCESSING', error: null },
    });
    await this.jobs.enqueue({ type: 'AUDIO', assetId, input: { trackId } });
    this.events.publish({ type: 'asset', assetId, change: 'updated' });
    return updated;
  }

  /**
   * Makes the multivariant playlist of a video say what the database says
   * about its sound. Does nothing for a video that cannot be played yet:
   * processing writes its tracks when it gets there.
   */
  async publish(assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status !== 'READY' || !asset.manifestPath) {
      return;
    }
    const driver = await this.storage.getDriver(asset.storagePoolId);
    const entries = this.entries(await this.prisma.audioTrack.findMany({ where: { assetId } }));
    const master = (await this.readAll(await driver.read(asset.manifestPath))).toString('utf8');
    const next = withAudioTracks(master, entries);
    if (next !== master) {
      await driver.write(asset.manifestPath, Buffer.from(next, 'utf8'), {
        contentType: 'application/vnd.apple.mpegurl',
      });
    }
    this.events.publish({ type: 'asset', assetId, change: 'updated' });
  }

  /** The tracks that can be played, as the multivariant playlist names them. */
  entries(tracks: readonly AudioTrack[]): AudioMediaEntry[] {
    const ready = muxedFirst(tracks).filter((track) => track.status === 'READY');
    // Exactly one track is the one players start with.
    const chosen = ready.find((track) => track.isDefault) ?? ready[0];
    return withUniqueAudioLabels(
      ready.map((track) => ({
        folder: folderOf(track),
        language: track.language,
        label: track.label ?? audioLabel(track.language, 1),
        isDefault: track === chosen,
        channels: track.channels,
      })),
    );
  }

  /** Marks an added track as made, or as failed with the reason. */
  async settle(
    trackId: string,
    result:
      | { ok: true; channels: number; bitrate: number; sizeBytes: number }
      | { ok: false; error: string },
  ): Promise<void> {
    await this.prisma.audioTrack.updateMany({
      where: { id: trackId },
      data: result.ok
        ? {
            status: 'READY',
            error: null,
            channels: result.channels,
            bitrate: result.bitrate,
            sizeBytes: BigInt(result.sizeBytes),
          }
        : { status: 'FAILED', error: result.error.slice(0, 500), isDefault: false },
    });
    if (!result.ok) {
      return;
    }
    // The first sound of a silent video is the one players start with.
    const track = await this.prisma.audioTrack.findUnique({ where: { id: trackId } });
    if (
      track &&
      (await this.prisma.audioTrack.count({
        where: { assetId: track.assetId, status: 'READY', isDefault: true },
      })) === 0
    ) {
      await this.prisma.audioTrack.update({ where: { id: trackId }, data: { isDefault: true } });
    }
  }

  /** Adds or takes bytes from what the pool of an asset is said to hold. */
  async account(asset: Pick<Asset, 'storagePoolId'>, bytes: number): Promise<void> {
    if (bytes === 0) {
      return;
    }
    await this.prisma.$executeRaw`
      UPDATE storage_pools
      SET "usedBytes" = GREATEST("usedBytes" + ${BigInt(bytes)}, 0)
      WHERE id = ${asset.storagePoolId}::uuid`;
  }

  // --- Inside --------------------------------------------------------------------

  /**
   * A video made before sound was kept apart has its sound inside its
   * picture and no row for it. The row is written when the tracks are first
   * looked at. Every video made since has a row for each of its tracks.
   */
  private async ensureMain(asset: Asset): Promise<void> {
    if (asset.status !== 'READY' || !asset.probe) {
      return;
    }
    if ((await this.prisma.audioTrack.count({ where: { assetId: asset.id } })) > 0) {
      return;
    }
    let main;
    try {
      main = mainAudioStream(parseProbe(JSON.stringify(asset.probe)));
    } catch {
      return;
    }
    if (!main || main.channels === 0) {
      return;
    }
    const language = audioLanguage(main.language);
    const copied = asset.processingMode === 'COPY';
    await this.prisma.audioTrack.create({
      data: {
        assetId: asset.id,
        language,
        label: audioLabel(language, 1),
        codec: copied ? main.codec : 'aac',
        channels: copied ? main.channels : 2,
        bitrate: 0,
        isDefault: true,
        source: 'EMBEDDED',
        streamIndex: main.index,
        playlistPath: null,
      },
    });
  }

  private async cancelJobs(assetId: string, trackId: string): Promise<void> {
    const waiting = await this.prisma.job.findMany({
      where: { assetId, type: 'AUDIO', status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true, input: true },
    });
    for (const job of waiting) {
      if ((job.input as { trackId?: string } | null)?.trackId === trackId) {
        await this.jobs.cancel(job.id).catch(() => undefined);
      }
    }
  }

  private hlsPrefix(assetId: string): string {
    return `assets/${assetId}/hls`;
  }

  private freeLabel(wanted: string, existing: readonly AudioTrack[]): string {
    const used = new Set(existing.map((track) => track.label));
    let label = wanted.slice(0, 80);
    for (let suffix = 2; used.has(label); suffix += 1) {
      label = `${wanted.slice(0, 76)} ${suffix}`;
    }
    return label;
  }

  private async readAll(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  private async assetOrThrow(assetId: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status === 'DELETED') {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }

  private async trackOrThrow(assetId: string, trackId: string): Promise<AudioTrack> {
    const track = await this.prisma.audioTrack.findFirst({ where: { id: trackId, assetId } });
    if (!track) {
      throw new NotFoundException('Sound track not found');
    }
    return track;
  }
}
