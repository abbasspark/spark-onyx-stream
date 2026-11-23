// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { type Asset, PrismaClient, type SubtitleTrack } from '@onyx/database';
import { EventPublisher } from '../events/event-publisher.js';
import {
  buildSubtitlePlaylist,
  SUBTITLE_FILE_NAME,
  SUBTITLE_PLAYLIST_NAME,
  type SubtitleTrackPlan,
  withSubtitleTracks,
  withUniqueLabels,
} from '../processing/media/subtitles.js';
import type { StorageDriver } from '../storage/storage-driver.js';
import { StorageService } from '../storage/storage.service.js';
import { subtitlePrefix } from './subtitle-paths.js';
import {
  defaultLabel,
  parseSubtitleName,
  type SubtitleEncoding,
  SubtitleFileError,
  toWebVtt,
} from './subtitle-file.js';

/** The largest subtitle file taken. A film of three hours has about 200 KB. */
export const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;
/** The most subtitle tracks one video has. */
export const MAX_SUBTITLE_TRACKS = 60;

/** Where the converted file of an added track is kept. */
const keptKey = (track: Pick<SubtitleTrack, 'assetId' | 'id'>) =>
  `${subtitlePrefix(track.assetId)}/${track.id}.vtt`;

/** The folder of a track inside the HLS output, from the path of its file. */
const slugOf = (track: Pick<SubtitleTrack, 'path'>) => track.path.split('/').at(-2) as string;

const toPlan = (track: SubtitleTrack, index: number): SubtitleTrackPlan => ({
  streamIndex: index,
  slug: slugOf(track),
  language: track.language,
  label: track.label ?? track.language,
  isDefault: track.isDefault,
  isForced: track.isForced,
});

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

export interface AddSubtitleInput {
  /** The name of the file, to read the language from when none is given. */
  fileName?: string | null;
  language?: string | null;
  label?: string | null;
  forced?: boolean;
  encoding?: SubtitleEncoding;
}

export interface AddedSubtitle {
  track: SubtitleTrack;
  cues: number;
  /** What the file was: "srt", "vtt" or "ass". */
  format: string;
  /** What its bytes were read as. */
  encoding: string;
  /** Set when the subtitles go on after the video ends, which points at the wrong file. */
  warning: string | null;
}

export interface UpdateSubtitleInput {
  language?: string;
  label?: string;
  isForced?: boolean;
}

/**
 * Subtitle files added to a video after it was made: by an admin in the
 * panel, or found beside a video in a watched location.
 *
 * A track is a WebVTT file in the HLS output and a line in the multivariant
 * playlist. The rows of the database are the truth: after every change the
 * lines of the playlist are written anew from them. The converted file is
 * also kept outside the output, so that processing the video again, which
 * replaces the whole output, can put the track back.
 */
@Injectable()
export class SubtitlesService {
  private readonly logger = new Logger(SubtitlesService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(EventPublisher) private readonly events: EventPublisher,
  ) {}

  /**
   * Converts a subtitle file and adds it to a video as a track.
   *
   * @throws BadRequestException when the file is not a subtitle file that can be read.
   */
  async add(assetId: string, data: Buffer, input: AddSubtitleInput = {}): Promise<AddedSubtitle> {
    const asset = await this.assetOrThrow(assetId);
    const named = parseSubtitleName(input.fileName ?? '');
    const language = input.language ?? named.language ?? 'und';
    const forced = input.forced ?? named.forced;

    let converted;
    try {
      converted = toWebVtt(data, {
        fileName: input.fileName,
        language: language === 'und' ? null : language,
        encoding: input.encoding,
      });
    } catch (error) {
      if (error instanceof SubtitleFileError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const existing = await this.prisma.subtitleTrack.findMany({ where: { assetId } });
    if (existing.length >= MAX_SUBTITLE_TRACKS) {
      throw new ConflictException(`A video has ${MAX_SUBTITLE_TRACKS} subtitle tracks at most`);
    }
    const label = this.freeLabel(
      input.label?.trim() || defaultLabel(language, { forced, sdh: named.sdh }),
      existing,
    );

    const id = randomUUID();
    const slug = `u-${id}`;
    const body = Buffer.from(converted.vtt, 'utf8');
    const driver = await this.storage.getDriver(asset.storagePoolId);
    await driver.write(keptKey({ assetId, id }), body, { contentType: 'text/vtt' });
    const track = await this.prisma.subtitleTrack.create({
      data: {
        id,
        assetId,
        language,
        label,
        source: 'UPLOADED',
        isForced: forced,
        path: `${this.hlsPrefix(assetId)}/subs/${slug}/${SUBTITLE_FILE_NAME}`,
      },
    });
    await this.account(asset, body.length);
    await this.publish(assetId);

    const late =
      asset.durationMs !== null && converted.endMs > asset.durationMs + 60_000
        ? 'The last subtitle comes after the end of the video. Check that the file belongs to this cut of it.'
        : null;
    return {
      track,
      cues: converted.cues,
      format: converted.format,
      encoding: converted.encoding,
      warning: late,
    };
  }

  /** Renames a track, changes its language, or makes it a forced one. */
  async update(
    assetId: string,
    trackId: string,
    input: UpdateSubtitleInput,
  ): Promise<SubtitleTrack> {
    const track = await this.trackOrThrow(assetId, trackId);
    const others = (await this.prisma.subtitleTrack.findMany({ where: { assetId } })).filter(
      (other) => other.id !== trackId,
    );
    const label = input.label?.trim();
    if (label && others.some((other) => other.label === label)) {
      throw new ConflictException('Another track of this video has that name already');
    }
    const updated = await this.prisma.subtitleTrack.update({
      where: { id: track.id },
      data: {
        language: input.language,
        label: label || undefined,
        isForced: input.isForced,
      },
    });
    await this.publish(assetId);
    return updated;
  }

  /**
   * Takes a track out of a video. One that came with the source file comes
   * back when the video is processed again.
   */
  async remove(assetId: string, trackId: string): Promise<SubtitleTrack> {
    const track = await this.trackOrThrow(assetId, trackId);
    const asset = await this.assetOrThrow(assetId);
    const driver = await this.storage.getDriver(asset.storagePoolId);
    await this.prisma.subtitleTrack.delete({ where: { id: track.id } });
    // The playlist stops naming the track before its files go.
    await this.publish(assetId);

    let bytes = 0;
    const folder = track.path.slice(0, track.path.lastIndexOf('/'));
    for await (const entry of driver.list(folder)) {
      bytes += entry.size;
    }
    await driver.deletePrefix(folder);
    if (track.source === 'UPLOADED') {
      bytes += (await driver.stat(keptKey(track)))?.size ?? 0;
      await driver.delete(keptKey(track));
    }
    await this.account(asset, -bytes);
    return track;
  }

  /** The WebVTT file of a track, for an admin to look at or download. */
  async read(assetId: string, trackId: string): Promise<{ track: SubtitleTrack; vtt: Buffer }> {
    const track = await this.trackOrThrow(assetId, trackId);
    const asset = await this.assetOrThrow(assetId);
    const driver = await this.storage.getDriver(asset.storagePoolId);
    for (const key of track.source === 'UPLOADED' ? [keptKey(track), track.path] : [track.path]) {
      if (await driver.exists(key)) {
        return { track, vtt: await readAll(await driver.read(key)) };
      }
    }
    throw new NotFoundException('The file of this track is not there');
  }

  /**
   * Makes the output of a video say what the database says: writes the files
   * of added tracks that are missing, and the subtitle lines of the
   * multivariant playlist. Does nothing for a video that cannot be played
   * yet: processing writes its tracks when it gets there.
   */
  async publish(assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status !== 'READY' || !asset.manifestPath) {
      return;
    }
    const driver = await this.storage.getDriver(asset.storagePoolId);
    const tracks = await this.tracksOf(assetId);
    const listed: SubtitleTrack[] = [];
    let written = 0;
    for (const track of tracks) {
      if (track.source === 'UPLOADED' && !(await driver.exists(track.path))) {
        if (!(await driver.exists(keptKey(track)))) {
          this.logger.warn(`Asset ${assetId}: the file of subtitle track ${track.id} is gone`);
          continue;
        }
        const body = await readAll(await driver.read(keptKey(track)));
        const playlist = Buffer.from(buildSubtitlePlaylist(asset.durationMs ?? 0), 'utf8');
        const folder = track.path.slice(0, track.path.lastIndexOf('/'));
        await driver.write(track.path, body, { contentType: 'text/vtt' });
        await driver.write(`${folder}/${SUBTITLE_PLAYLIST_NAME}`, playlist, {
          contentType: 'application/vnd.apple.mpegurl',
        });
        written += body.length + playlist.length;
      }
      listed.push(track);
    }
    await this.writeMaster(driver, asset.manifestPath, listed);
    if (written > 0) {
      await this.account(asset, written);
    }
    this.events.publish({ type: 'asset', assetId, change: 'updated' });
  }

  /**
   * For processing: puts the added tracks of a video into a new output on
   * disk, beside the tracks taken from the source, and says how to list them.
   */
  async restoreInto(
    assetId: string,
    outputDirectory: string,
    durationMs: number,
    taken: readonly SubtitleTrackPlan[],
  ): Promise<SubtitleTrackPlan[]> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return [];
    }
    const driver = await this.storage.getDriver(asset.storagePoolId);
    const tracks = await this.prisma.subtitleTrack.findMany({
      where: { assetId, source: 'UPLOADED' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const plans: SubtitleTrackPlan[] = [];
    for (const track of tracks) {
      if (!(await driver.exists(keptKey(track)))) {
        continue;
      }
      const directory = path.join(outputDirectory, 'subs', slugOf(track));
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, SUBTITLE_FILE_NAME),
        await readAll(await driver.read(keptKey(track))),
      );
      await writeFile(
        path.join(directory, SUBTITLE_PLAYLIST_NAME),
        buildSubtitlePlaylist(durationMs),
      );
      plans.push(toPlan(track, taken.length + plans.length));
    }
    return withUniqueLabels([...taken, ...plans]).slice(taken.length);
  }

  /** How many tracks were added to a video by hand or from a watched location. */
  countAdded(assetId: string): Promise<number> {
    return this.prisma.subtitleTrack.count({ where: { assetId, source: 'UPLOADED' } });
  }

  // --- Inside --------------------------------------------------------------------

  private hlsPrefix(assetId: string): string {
    return `assets/${assetId}/hls`;
  }

  /** Tracks of the source first, then the added ones, each in the order they came. */
  private async tracksOf(assetId: string): Promise<SubtitleTrack[]> {
    const tracks = await this.prisma.subtitleTrack.findMany({
      where: { assetId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return [
      ...tracks.filter((track) => track.source === 'EMBEDDED'),
      ...tracks.filter((track) => track.source === 'UPLOADED'),
    ];
  }

  private async writeMaster(
    driver: StorageDriver,
    manifestPath: string,
    tracks: readonly SubtitleTrack[],
  ): Promise<void> {
    const master = (await readAll(await driver.read(manifestPath))).toString('utf8');
    const next = withSubtitleTracks(master, withUniqueLabels(tracks.map(toPlan)));
    if (next !== master) {
      await driver.write(manifestPath, Buffer.from(next, 'utf8'), {
        contentType: 'application/vnd.apple.mpegurl',
      });
    }
  }

  private freeLabel(wanted: string, existing: readonly SubtitleTrack[]): string {
    const used = new Set(existing.map((track) => track.label));
    let label = wanted.slice(0, 80);
    for (let suffix = 2; used.has(label); suffix += 1) {
      label = `${wanted.slice(0, 76)} ${suffix}`;
    }
    return label;
  }

  private async account(asset: Asset, bytes: number): Promise<void> {
    if (bytes === 0) {
      return;
    }
    await this.prisma.$executeRaw`
      UPDATE storage_pools
      SET "usedBytes" = GREATEST("usedBytes" + ${BigInt(bytes)}, 0)
      WHERE id = ${asset.storagePoolId}::uuid`;
  }

  private async assetOrThrow(assetId: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status === 'DELETED') {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }

  private async trackOrThrow(assetId: string, trackId: string): Promise<SubtitleTrack> {
    const track = await this.prisma.subtitleTrack.findFirst({ where: { id: trackId, assetId } });
    if (!track) {
      throw new NotFoundException('Subtitle track not found');
    }
    return track;
  }
}
