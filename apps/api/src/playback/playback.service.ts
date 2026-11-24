// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import { ContentKeysService } from '../crypto/content-keys.service.js';
import { type Audience, DeliveryRouter } from '../delivery/delivery-router.service.js';
import { type P2pInfo, P2pService } from '../p2p/p2p.service.js';
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
  /** What a player needs to share the video with other viewers. Null when P2P is off. */
  p2p: P2pInfo | null;
  /**
   * The sound tracks of the video, the one players start with marked. The
   * playlist names the same tracks: a player picks by language from there.
   * This is for a page that says what a video offers before it plays. Empty
   * for a video with one sound that nobody named.
   */
  audio: { language: string; label: string | null; isDefault: boolean }[];
  /** The subtitle tracks of the video. */
  subtitles: { language: string; label: string | null; isForced: boolean }[];
  /**
   * The stretches a player offers to skip, in the order they come: "RECAP"
   * and "INTRO" with a button while they run, "CREDITS" as the moment to
   * offer what comes next. Times are milliseconds from the start. Credits
   * with "endMs": null run to the end of the video, and from where they
   * begin the video counts as watched.
   */
  markers: { kind: 'RECAP' | 'INTRO' | 'CREDITS'; startMs: number; endMs: number | null }[];
}

/** Where a requested media file lives. */
export interface MediaLocation {
  storagePoolId: string;
  /** Storage key of the file. */
  key: string;
}

/** Path of the content key under an asset's playback URL. It is not a file in storage. */
export const CONTENT_KEY_PATH = 'hls/key';

const ASSET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Generated files a playback token may read, relative to the asset's output folder. */
const ALLOWED_FILE_PATTERN = /^(hls|thumbs)\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

@Injectable()
export class PlaybackService {
  private readonly assetCache = new Map<string, { storagePoolId: string | null; until: number }>();

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(ContentKeysService) private readonly contentKeys: ContentKeysService,
    @Inject(DeliveryRouter) private readonly delivery: DeliveryRouter,
    @Inject(P2pService) private readonly p2p: P2pService,
  ) {}

  /**
   * Signed address of an asset's poster, for showing it in lists.
   *
   * The expiry is rounded up to a full hour, so the address stays the same
   * between requests and browsers can keep the picture.
   *
   * @returns Null when the asset is not ready or has no poster.
   */
  posterUrl(asset: {
    id: string;
    status: string;
    thumbnails: readonly { type: string; path: string }[];
  }): string | null {
    const poster = asset.thumbnails.find((thumbnail) => thumbnail.type === 'POSTER');
    if (asset.status !== 'READY' || !poster) {
      return null;
    }

    const hour = 3600;
    const expiresAtSeconds =
      Math.ceil((Date.now() / 1000 + this.config.playbackUrlTtlSeconds) / hour) * hour;
    const token = createPlaybackToken(
      asset.id,
      expiresAtSeconds,
      this.config.playbackSigningSecret,
    );
    const prefix = `${outputPrefix(asset.id)}/`;
    return `${this.config.mediaBaseUrl}/v1/${MEDIA_ROUTE}/${asset.id}/${token}/${poster.path.slice(prefix.length)}`;
  }

  /**
   * Signs the address of one generated file of an asset.
   *
   * @param storagePath Path of the file in storage, such as "assets/{id}/thumbs/sprite.jpg".
   */
  signedUrl(assetId: string, storagePath: string): string {
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + this.config.playbackUrlTtlSeconds;
    const token = createPlaybackToken(assetId, expiresAtSeconds, this.config.playbackSigningSecret);
    const prefix = `${outputPrefix(assetId)}/`;
    const relative = storagePath.startsWith(prefix)
      ? storagePath.slice(prefix.length)
      : storagePath;
    return `${this.config.mediaBaseUrl}/v1/${MEDIA_ROUTE}/${assetId}/${token}/${relative}`;
  }

  /** Issues signed URLs for playing an asset. */
  async createPlayback(assetId: string, audience: Audience = 'admin'): Promise<PlaybackInfo> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        thumbnails: true,
        audioTracks: { where: { status: 'READY' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        subtitleTracks: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        markers: { orderBy: [{ startMs: 'asc' }, { id: 'asc' }] },
      },
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
    // Viewers are sent to an edge when there is one. Admins always watch from
    // the main server, so a preview shows what is stored and not a copy.
    const route =
      audience === 'viewer' ? await this.delivery.route('video', asset.id) : this.delivery.origin();
    const token = createPlaybackToken(asset.id, expiresAtSeconds, route.signingSecret);

    const prefix = `${outputPrefix(asset.id)}/`;
    const urlFor = (storageKey: string): string =>
      `${route.baseUrl}/v1/${MEDIA_ROUTE}/${asset.id}/${token}/${storageKey.slice(prefix.length)}`;

    const poster = asset.thumbnails.find((thumbnail) => thumbnail.type === 'POSTER');
    const spriteVtt = asset.thumbnails.find((thumbnail) => thumbnail.type === 'SPRITE_VTT');
    return {
      protocol: 'hls',
      manifestUrl: urlFor(asset.manifestPath),
      posterUrl: poster ? urlFor(poster.path) : null,
      thumbnailTrackUrl: spriteVtt ? urlFor(spriteVtt.path) : null,
      expiresAt: new Date(expiresAtSeconds * 1000),
      // Each processing of a video is a swarm of its own: its files differ.
      p2p:
        audience === 'viewer'
          ? this.p2p.forPlayback(
              `video:${asset.id}:${asset.readyAt?.getTime() ?? 0}`,
              expiresAtSeconds,
            )
          : null,
      audio: [...asset.audioTracks]
        // The sound inside the video first, as the playlist lists it.
        .sort((a, b) => Number(a.playlistPath !== null) - Number(b.playlistPath !== null))
        .map((track) => ({
          language: track.language,
          label: track.label,
          isDefault: track.isDefault,
        })),
      subtitles: asset.subtitleTracks.map((track) => ({
        language: track.language,
        label: track.label,
        isForced: track.isForced,
      })),
      markers: asset.markers.map((marker) => ({
        kind: marker.kind,
        startMs: marker.startMs,
        endMs: marker.endMs,
      })),
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
    return this.locateFile(assetId, filePath);
  }

  /**
   * Resolves a file an edge asks for. The edge has proven who it is, and it
   * checks the tokens of its viewers itself, so there is no token here.
   */
  locateFile(assetId: string, filePath: string): Promise<MediaLocation | null> {
    return this.find(assetId, filePath);
  }

  private async find(assetId: string, filePath: string): Promise<MediaLocation | null> {
    if (!ASSET_ID_PATTERN.test(assetId)) {
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
    return this.keyOf(assetId);
  }

  /** The content key of an asset, for an edge that has proven who it is. */
  async keyOf(assetId: string): Promise<Buffer | null> {
    if (!ASSET_ID_PATTERN.test(assetId) || !(await this.readyAssetPool(assetId))) {
      return null;
    }

    // A player asks for the key once per quality, so it is read fresh each time.
    // A remembered key would be wrong for a while after reprocessing.
    return (await this.contentKeys.find(assetId))?.key ?? null;
  }

  /**
   * What tells one processing of an asset from the next. An edge keeps copies
   * of a video's files under this, and drops them when it changes.
   *
   * @returns Null when the asset cannot be played.
   */
  async versionOf(assetId: string): Promise<string | null> {
    if (!ASSET_ID_PATTERN.test(assetId)) {
      return null;
    }
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { status: true, readyAt: true },
    });
    return asset?.status === 'READY' && asset.readyAt ? String(asset.readyAt.getTime()) : null;
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
