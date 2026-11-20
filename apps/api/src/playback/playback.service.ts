// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import { ContentKeysService } from '../crypto/content-keys.service.js';
import { outputPrefix } from '../processing/pipeline.service.js';
import { createPlaybackToken, verifyPlaybackToken } from './playback-token.js';

export const MEDIA_ROUTE = 'media';

/** Extra validity on top of the video's length, so a paused session does not run out. */
const DURATION_FACTOR = 1.5;
const DURATION_MARGIN_SECONDS = 10 * 60;

/** How long the storage pool of an asset is remembered, to avoid a database query per segment. */
const ASSET_CACHE_MS = 30_000;

export interface PlaybackInfo {
  protocol: 'hls';
  /** URL of the HLS multivariant playlist. Relative to the API origin unless MEDIA_BASE_URL is set. */
  manifestUrl: string;
  /** URL of the poster picture, or null when there is none. */
  posterUrl: string | null;
  /**
   * URL of the WebVTT file for seek-bar previews, or null when there is none.
   * Its cues point into a sprite sheet next to it.
   */
  thumbnailTrackUrl: string | null;
  /** When the URLs stop working. */
  expiresAt: Date;
}

/** Where a requested media file lives. */
export interface MediaLocation {
  storagePoolId: string;
  /** Storage key of the file. */
  key: string;
}

/** Path of the content key under an asset's playback URL. It is not a file in storage. */
export const CONTENT_KEY_PATH = 'hls/key';

/** Generated files a playback token may read, relative to the asset's output folder. */
const ALLOWED_FILE_PATTERN = /^(hls|thumbs)\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

@Injectable()
export class PlaybackService {
  private readonly assetCache = new Map<string, { storagePoolId: string | null; until: number }>();

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(ContentKeysService) private readonly contentKeys: ContentKeysService,
  ) {}

  /** Issues signed URLs for playing an asset. */
  async createPlayback(assetId: string): Promise<PlaybackInfo> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { thumbnails: true },
    });

    if (!asset || asset.status === 'DELETED') {
      throw new NotFoundException('Asset not found');
    }
    if (asset.status !== 'READY') {
      throw new ConflictException(
        `The asset is not ready to play. Its status is ${asset.status.toLowerCase()}`,
      );
    }
    if (!asset.manifestPath) {
      throw new ConflictException(
        'The asset was stored without processing and has no stream to play',
      );
    }

    const durationSeconds = (asset.durationMs ?? 0) / 1000;
    const lifetimeSeconds = Math.max(
      this.config.playbackUrlTtlSeconds,
      Math.ceil(durationSeconds * DURATION_FACTOR) + DURATION_MARGIN_SECONDS,
    );
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + lifetimeSeconds;
    const token = createPlaybackToken(
      asset.id,
      expiresAtSeconds,
      this.config.playbackSigningSecret,
    );

    const prefix = `${outputPrefix(asset.id)}/`;
    const urlFor = (storageKey: string): string =>
      `${this.config.mediaBaseUrl}/v1/${MEDIA_ROUTE}/${asset.id}/${token}/${storageKey.slice(prefix.length)}`;

    const poster = asset.thumbnails.find((thumbnail) => thumbnail.type === 'POSTER');
    const spriteVtt = asset.thumbnails.find((thumbnail) => thumbnail.type === 'SPRITE_VTT');
    return {
      protocol: 'hls',
      manifestUrl: urlFor(asset.manifestPath),
      posterUrl: poster ? urlFor(poster.path) : null,
      thumbnailTrackUrl: spriteVtt ? urlFor(spriteVtt.path) : null,
      expiresAt: new Date(expiresAtSeconds * 1000),
    };
  }

  /**
   * Resolves a media request to a file in storage.
   *
   * @returns Null when the token is invalid, the path is not a playable file
   * or the asset cannot be played. The caller answers all of these the same
   * way, so a request learns nothing about which assets exist.
   */
  async locate(assetId: string, token: string, filePath: string): Promise<MediaLocation | null> {
    if (!verifyPlaybackToken(token, assetId, this.config.playbackSigningSecret).valid) {
      return null;
    }
    if (
      filePath === CONTENT_KEY_PATH ||
      !ALLOWED_FILE_PATTERN.test(filePath) ||
      filePath.includes('..')
    ) {
      return null;
    }

    const storagePoolId = await this.readyAssetPool(assetId);
    if (!storagePoolId) {
      return null;
    }
    return { storagePoolId, key: `${outputPrefix(assetId)}/${filePath}` };
  }

  /**
   * Returns the content key of an encrypted asset for a valid playback token.
   *
   * @returns Null when the token is invalid, the asset cannot be played or it
   * has no key. The caller answers all of these the same way.
   */
  async contentKey(assetId: string, token: string): Promise<Buffer | null> {
    if (!verifyPlaybackToken(token, assetId, this.config.playbackSigningSecret).valid) {
      return null;
    }
    if (!(await this.readyAssetPool(assetId))) {
      return null;
    }

    // A player asks for the key once per quality, so it is read fresh each time.
    // A remembered key would be wrong for a while after reprocessing.
    return (await this.contentKeys.find(assetId))?.key ?? null;
  }

  /** Returns the storage pool of an asset that is ready to play, or null. Cached briefly. */
  private async readyAssetPool(assetId: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.assetCache.get(assetId);
    if (cached && cached.until > now) {
      return cached.storagePoolId;
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { status: true, storagePoolId: true },
    });
    const storagePoolId = asset?.status === 'READY' ? asset.storagePoolId : null;

    if (this.assetCache.size > 10_000) {
      this.assetCache.clear();
    }
    this.assetCache.set(assetId, { storagePoolId, until: now + ASSET_CACHE_MS });
    return storagePoolId;
  }
}
