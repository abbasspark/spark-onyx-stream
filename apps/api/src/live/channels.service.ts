// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Channel, type ChannelMode, type ChannelStatus, PrismaClient } from '@onyx/database';
import type { Redis } from 'ioredis';
import { slugify, uniqueSlug } from '../catalog/slug.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { SecretBox } from '../crypto/secret-box.js';
import { EventPublisher } from '../events/event-publisher.js';
import {
  FfmpegAbortedError,
  FfmpegError,
  FfmpegNotFoundError,
  FfmpegRunner,
} from '../processing/ffmpeg/ffmpeg-runner.js';
import { parseProbe } from '../processing/media/media-info.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import type { CreateChannelInput, UpdateChannelInput } from './channels.schemas.js';
import { buildProbeArgs, copyObstacle, planOutput, type SourceStreams } from './live-command.js';
import { DEFAULT_LIVE_QUALITIES, ladderFor } from './live-ladder.js';
import { parseSource } from './live-source.js';
import { type ChannelHealth, healthKey, LIVE_NUDGE_CHANNEL, parseHealth } from './live-state.js';

/** Time a source gets to answer when an admin tests it. */
const PROBE_TIMEOUT_MS = 15_000;
/** After this long without a live process, an enabled channel says so. */
const UNATTENDED_AFTER_MS = 12_000;

/**
 * What the panel shows for a channel. "WAITING" is not stored: it stands for
 * an enabled channel that no live process reports on.
 */
export type ChannelState = ChannelStatus | 'WAITING';

export interface ChannelView {
  id: string;
  name: string;
  slug: string;
  number: number | null;
  description: string | null;
  /** The source without anything secret. */
  source: string;
  mode: ChannelMode;
  /** The qualities chosen for transcoding. Empty for a channel that is passed through. */
  qualities: number[];
  /**
   * The qualities the channel is encoded into, best first, once the source is
   * known: chosen heights above the source are left out. Null otherwise.
   */
  outputs: { name: string; height: number; videoKbps: number }[] | null;
  enabled: boolean;
  status: ChannelState;
  statusMessage: string | null;
  startedAt: string | null;
  restartCount: number;
  streams: SourceStreams | null;
  /** Figures of the running stream. Null while no live process runs the channel. */
  health: {
    bitrate: number | null;
    speed: number | null;
    lastDataAt: string | null;
    node: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelDetails extends ChannelView {
  /** The latest lines of the live process, oldest first. */
  log: string[];
}

/** What testing a source found. */
export type ProbeResult =
  | {
      ok: true;
      streams: SourceStreams;
      /** What happens to the audio of a channel that is passed through. */
      audio: 'copy' | 'aac' | 'none';
      /** Why the source cannot be passed through and needs transcoding. Null when it can. */
      copyObstacle: string | null;
    }
  | { ok: false; reason: string };

@Injectable()
export class ChannelsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(SecretBox) private readonly secrets: SecretBox,
    @Inject(EventPublisher) private readonly events: EventPublisher,
    @Inject(FfmpegRunner) private readonly ffmpeg: FfmpegRunner,
  ) {}

  async list(): Promise<ChannelView[]> {
    const channels = await this.prisma.channel.findMany({
      orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    });
    const health = await Promise.all(channels.map((channel) => this.healthOf(channel.id)));
    return channels.map((channel, index) => toView(channel, health[index] ?? null));
  }

  async get(id: string): Promise<ChannelDetails> {
    const channel = await this.find(id);
    const health = await this.healthOf(id);
    return { ...toView(channel, health), log: channel.enabled ? (health?.log ?? []) : [] };
  }

  /** The full address of the source, for the edit form. It may carry a password. */
  async source(id: string): Promise<{ source: string }> {
    return { source: this.secrets.decrypt((await this.find(id)).sourceEncrypted) };
  }

  async create(input: CreateChannelInput): Promise<ChannelView> {
    const source = parseSource(input.source);
    const slug =
      input.slug ??
      (await uniqueSlug(slugify(input.name), async (value) =>
        Boolean(await this.prisma.channel.findUnique({ where: { slug: value } })),
      ));

    try {
      const channel = await this.prisma.channel.create({
        data: {
          name: input.name,
          slug,
          number: input.number,
          description: input.description,
          sourceEncrypted: this.secrets.encrypt(source.url),
          sourceLabel: source.label,
          mode: input.mode,
          qualities: qualitiesOf(input.mode, input.qualities),
          enabled: input.start,
          status: input.start ? 'STARTING' : 'STOPPED',
        },
      });
      this.changed(channel.id, 'created');
      return toView(channel, null);
    } catch (error) {
      throw (await this.conflictOf(error, input.number, null)) ?? error;
    }
  }

  async update(id: string, input: UpdateChannelInput): Promise<ChannelView> {
    const current = await this.find(id);
    const source = input.source === undefined ? null : parseSource(input.source);
    const mode = input.mode ?? current.mode;
    const qualities = qualitiesOf(mode, input.qualities ?? current.qualities);
    const reprocess = mode !== current.mode || qualities.join() !== [...current.qualities].join();

    try {
      const channel = await this.prisma.channel.update({
        where: { id },
        data: {
          name: input.name,
          slug: input.slug,
          number: input.number,
          description: input.description,
          mode,
          qualities,
          // Other qualities need another process: the live process starts the channel over.
          ...(reprocess ? { restartToken: { increment: 1 } } : {}),
          // A new address is noticed by the live process, which then starts the channel over.
          ...(source
            ? { sourceEncrypted: this.secrets.encrypt(source.url), sourceLabel: source.label }
            : {}),
        },
      });
      this.changed(id, 'updated');
      return toView(channel, await this.healthOf(id));
    } catch (error) {
      throw (await this.conflictOf(error, input.number ?? null, id)) ?? error;
    }
  }

  async remove(id: string): Promise<ChannelView> {
    const channel = await this.find(id);
    await this.prisma.channel.delete({ where: { id } });
    this.changed(id, 'deleted');
    return toView(channel, null);
  }

  async start(id: string): Promise<ChannelView> {
    const channel = await this.find(id);
    if (channel.enabled) {
      return toView(channel, await this.healthOf(id));
    }
    const started = await this.prisma.channel.update({
      where: { id },
      data: {
        enabled: true,
        status: 'STARTING',
        statusMessage: null,
        startedAt: null,
        restartCount: 0,
      },
    });
    this.changed(id, 'updated');
    return toView(started, null);
  }

  async stop(id: string): Promise<ChannelView> {
    await this.find(id);
    const stopped = await this.prisma.channel.update({
      where: { id },
      data: { enabled: false, status: 'STOPPED', statusMessage: null, startedAt: null },
    });
    this.changed(id, 'updated');
    return toView(stopped, null);
  }

  /** Starts the stream of a running channel over. Starts a stopped channel. */
  async restart(id: string): Promise<ChannelView> {
    const channel = await this.find(id);
    if (!channel.enabled) {
      return this.start(id);
    }
    const restarted = await this.prisma.channel.update({
      where: { id },
      data: {
        restartToken: { increment: 1 },
        status: 'STARTING',
        statusMessage: null,
        startedAt: null,
        restartCount: 0,
      },
    });
    this.changed(id, 'updated');
    return toView(restarted, await this.healthOf(id));
  }

  /**
   * Connects to a source and says what it carries, without creating anything.
   * A source that cannot be used is an answer, not an error.
   */
  async probe(address: string): Promise<ProbeResult> {
    const source = parseSource(address);
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);

    try {
      const info = parseProbe(await this.ffmpeg.ffprobe(buildProbeArgs(source), abort.signal));
      if (!info.video) {
        return { ok: false, reason: 'The source carries no video' };
      }
      const obstacle = copyObstacle(info.video.codec);
      // Planned as a transcode, which takes any video, to read the streams in one place.
      const plan = planOutput(info, { mode: obstacle ? 'TRANSCODE' : 'COPY', qualities: [] });
      return {
        ok: true,
        streams: plan.streams,
        audio: !plan.streams.audioCodec
          ? 'none'
          : plan.streams.audioCodec === 'aac'
            ? 'copy'
            : 'aac',
        copyObstacle: obstacle,
      };
    } catch (error) {
      if (error instanceof FfmpegNotFoundError) {
        throw error;
      }
      if (error instanceof FfmpegAbortedError || abort.signal.aborted) {
        return { ok: false, reason: 'The source did not answer within 15 seconds' };
      }
      const detail =
        error instanceof FfmpegError
          ? error.stderrTail
              .replaceAll(source.url, source.label)
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0)
              .at(-1)
          : undefined;
      return {
        ok: false,
        reason: detail ? `The source could not be read: ${detail}` : 'The source could not be read',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Says which value of a refused write another channel already has. */
  private async conflictOf(
    error: unknown,
    number: number | null,
    ownId: string | null,
  ): Promise<ConflictException | null> {
    if (!isUniqueViolation(error)) {
      return null;
    }
    const holder =
      number === null ? null : await this.prisma.channel.findUnique({ where: { number } });
    return new ConflictException(
      holder && holder.id !== ownId
        ? `Channel number ${number} belongs to "${holder.name}"`
        : 'Another channel has this address name',
    );
  }

  private async find(id: string): Promise<Channel> {
    const channel = await this.prisma.channel.findUnique({ where: { id } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }

  private async healthOf(id: string): Promise<ChannelHealth | null> {
    try {
      return parseHealth(await this.redis.get(healthKey(id)));
    } catch {
      // Without Redis the figures are missing. The channels themselves are still listed.
      return null;
    }
  }

  /** Tells open panels and the live processes that a channel changed. */
  private changed(channelId: string, change: 'created' | 'updated' | 'deleted'): void {
    this.events.publish({ type: 'channel', channelId, change });
    this.redis.publish(LIVE_NUDGE_CHANNEL, channelId).catch(() => undefined);
  }
}

/** A channel that is passed through keeps no qualities. */
function qualitiesOf(mode: ChannelMode, qualities: readonly number[] | undefined): number[] {
  if (mode === 'COPY') {
    return [];
  }
  return qualities && qualities.length > 0 ? [...qualities] : [...DEFAULT_LIVE_QUALITIES];
}

function toView(channel: Channel, health: ChannelHealth | null): ChannelView {
  const attended = channel.enabled && health !== null;
  const unattendedFor = Date.now() - channel.updatedAt.getTime();

  let status: ChannelState = channel.status;
  let statusMessage = channel.statusMessage;
  if (!channel.enabled) {
    status = 'STOPPED';
    statusMessage = null;
  } else if (!attended) {
    status = 'WAITING';
    statusMessage =
      unattendedFor > UNATTENDED_AFTER_MS
        ? 'No live process is running. Start a process with the "live" role'
        : null;
  }

  return {
    id: channel.id,
    name: channel.name,
    slug: channel.slug,
    number: channel.number,
    description: channel.description,
    source: channel.sourceLabel,
    mode: channel.mode,
    qualities: channel.qualities,
    outputs:
      channel.mode === 'TRANSCODE' && channel.height
        ? ladderFor(channel.qualities, channel.height, channel.frameRate).map((rendition) => ({
            name: rendition.name,
            height: rendition.height,
            videoKbps: rendition.videoKbps,
          }))
        : null,
    enabled: channel.enabled,
    status,
    statusMessage,
    startedAt: attended && status === 'RUNNING' ? (channel.startedAt?.toISOString() ?? null) : null,
    restartCount: channel.restartCount,
    streams:
      channel.videoCodec && channel.width && channel.height
        ? {
            videoCodec: channel.videoCodec,
            width: channel.width,
            height: channel.height,
            frameRate: channel.frameRate,
            audioCodec: channel.audioCodec,
            audioChannels: channel.audioChannels,
          }
        : null,
    health:
      attended && health
        ? {
            bitrate: status === 'RUNNING' ? health.bitrate : null,
            speed: status === 'RUNNING' ? health.speed : null,
            lastDataAt: health.lastDataAt ? new Date(health.lastDataAt).toISOString() : null,
            node: health.node,
          }
        : null,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
  };
}
