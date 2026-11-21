// SPDX-License-Identifier: AGPL-3.0-only
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config.js';
import { SecretBox } from '../crypto/secret-box.js';
import { EventPublisher } from '../events/event-publisher.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import {
  type EncoderSettings,
  encoderSettings,
  hashStreamKey,
  INGEST_USER,
  isIngestPassword,
  keyOfPath,
  newStreamKey,
} from './ingest.js';
import { IngestClient } from './ingest-client.js';
import { LIVE_NUDGE_CHANNEL } from './live-state.js';

/** What the ingest server asks before it lets a connection do something. */
export interface IngestAuthRequest {
  action: string;
  path: string;
  user: string;
  password: string;
}

/** Stream keys of pushed channels, and the answers to the ingest server. */
@Injectable()
export class IngestService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(SecretBox) private readonly secrets: SecretBox,
    @Inject(EventPublisher) private readonly events: EventPublisher,
    @Inject(IngestClient) private readonly client: IngestClient,
  ) {}

  /** A new stream key in the two forms that are stored. */
  issueKey(): { streamKeyHash: string; streamKeyEncrypted: string } {
    const key = newStreamKey();
    return { streamKeyHash: hashStreamKey(key), streamKeyEncrypted: this.secrets.encrypt(key) };
  }

  /**
   * Whether the ingest server may let a connection through.
   *
   * An encoder may publish to the path of its stream key while the channel is
   * switched on. Everything else (reading a stream, the control API) is for
   * the platform itself, which signs in with its own password.
   */
  async authorize(request: IngestAuthRequest): Promise<boolean> {
    if (request.action !== 'publish') {
      return (
        request.user === INGEST_USER &&
        isIngestPassword(request.password, this.config.playbackSigningSecret)
      );
    }

    const key = keyOfPath(request.path);
    if (!key) {
      return false;
    }
    const channel = await this.prisma.channel.findUnique({
      where: { streamKeyHash: hashStreamKey(key) },
      select: { ingest: true, enabled: true },
    });
    // A channel that is switched off refuses its encoder, which shows the operator at once that it is off.
    return channel !== null && channel.ingest === 'PUSH' && channel.enabled;
  }

  /** What to enter in an encoder for a channel. Shows the stream key. */
  async settings(channelId: string): Promise<EncoderSettings> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { ingest: true, streamKeyEncrypted: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    if (channel.ingest !== 'PUSH' || !channel.streamKeyEncrypted) {
      throw new BadRequestException('This channel is pulled from an address and has no stream key');
    }
    return this.settingsOf(this.secrets.decrypt(channel.streamKeyEncrypted));
  }

  /**
   * Replaces the stream key of a channel. The old key stops working at once
   * and an encoder that is connected with it is disconnected.
   */
  async replaceKey(channelId: string): Promise<EncoderSettings> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { ingest: true, streamKeyEncrypted: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    if (channel.ingest !== 'PUSH') {
      throw new BadRequestException('This channel is pulled from an address and has no stream key');
    }

    const key = newStreamKey();
    await this.prisma.channel.update({
      where: { id: channelId },
      data: { streamKeyHash: hashStreamKey(key), streamKeyEncrypted: this.secrets.encrypt(key) },
    });
    if (channel.streamKeyEncrypted) {
      await this.disconnect(channel.streamKeyEncrypted);
    }
    this.events.publish({ type: 'channel', channelId, change: 'updated' });
    this.redis.publish(LIVE_NUDGE_CHANNEL, channelId).catch(() => undefined);
    return this.settingsOf(key);
  }

  /** Closes the connection of the encoder of a stored stream key, if one is connected. */
  async disconnect(streamKeyEncrypted: string): Promise<void> {
    try {
      await this.client.kick(this.secrets.decrypt(streamKeyEncrypted));
    } catch {
      // The channel is no longer read either way.
    }
  }

  private settingsOf(key: string): EncoderSettings {
    return encoderSettings(key, {
      rtmp: this.config.ingest.publicRtmpUrl,
      srt: this.config.ingest.publicSrtUrl,
    });
  }
}
