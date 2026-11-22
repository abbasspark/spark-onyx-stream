// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import { type Audience, DeliveryRouter } from '../delivery/delivery-router.service.js';
import { createPlaybackToken, verifyPlaybackToken } from '../playback/playback-token.js';
import { LIVE_PLAYLIST_NAME } from './live-command.js';
import { channelDirectory } from './live-state.js';

export const LIVE_ROUTE = 'live';

/** The files a live process writes: a playlist, header files and segments. Nothing else is served. */
const FILE_PATTERN = /^[A-Za-z0-9_-]{1,80}\.(m3u8|mp4|m4s)$/;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface LivePlaybackInfo {
  protocol: 'hls';
  url: string;
  expiresAt: string;
}

/**
 * Signed addresses for watching a channel.
 *
 *   /v1/live/<channelId>/<token>/index.m3u8
 *
 * The token is the one used for video on demand, signed over the id of the
 * channel. The playlist names its segments with relative paths, so every
 * request of a session carries the token.
 */
@Injectable()
export class LivePlaybackService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(DeliveryRouter) private readonly delivery: DeliveryRouter,
  ) {}

  async createPlayback(channelId: string, audience: Audience = 'admin'): Promise<LivePlaybackInfo> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const expiresAtSeconds = Math.floor(Date.now() / 1000) + this.config.playbackUrlTtlSeconds;
    const route =
      audience === 'viewer'
        ? await this.delivery.route('live', channel.id)
        : this.delivery.origin();
    const token = createPlaybackToken(channel.id, expiresAtSeconds, route.signingSecret);
    return {
      protocol: 'hls',
      url: `${route.baseUrl}/v1/${LIVE_ROUTE}/${channel.id}/${token}/${LIVE_PLAYLIST_NAME}`,
      expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    };
  }

  /**
   * Path of a requested file on disk. Null when the request is not allowed.
   * No database is asked: a channel that does not run has no files.
   */
  locate(channelId: string, token: string, fileName: string): string | null {
    if (!verifyPlaybackToken(token, channelId, this.config.playbackSigningSecret).valid) {
      return null;
    }
    return this.locateFile(channelId, fileName);
  }

  /** Path of a file an edge asks for. The edge checks the tokens of its viewers itself. */
  locateFile(channelId: string, fileName: string): string | null {
    if (!ID_PATTERN.test(channelId) || !FILE_PATTERN.test(fileName)) {
      return null;
    }
    return path.join(channelDirectory(this.config.live.path, channelId), fileName);
  }
}
