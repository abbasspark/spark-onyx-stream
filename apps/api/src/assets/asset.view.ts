// SPDX-License-Identifier: AGPL-3.0-only
import type { Asset } from '@onyx/database';
import type { AudioTrackView } from '../audio-tracks/audio-track.view.js';

/** An asset as returned by the API. */
export interface AssetView {
  id: string;
  title: string;
  status: Asset['status'];
  storagePoolId: string;
  createdById: string | null;
  source: {
    filename: string | null;
    /** Bytes, as a string because the value can exceed the safe range of a JSON number. */
    bytes: string | null;
    checksum: string | null;
  };
  /** Filled in after probing. */
  media: {
    durationMs: number | null;
    width: number | null;
    height: number | null;
    frameRate: number | null;
    videoCodec: string | null;
    audioCodec: string | null;
  };
  processingMode: Asset['processingMode'];
  encodingProfileId: string | null;
  encryption: Asset['encryption'];
  p2pEnabled: boolean;
  /** Signed address of the poster picture. Null until the asset is ready and has one. */
  posterUrl: string | null;
  readyAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toAssetView(asset: Asset, posterUrl: string | null = null): AssetView {
  return {
    id: asset.id,
    title: asset.title,
    status: asset.status,
    storagePoolId: asset.storagePoolId,
    createdById: asset.createdById,
    source: {
      filename: asset.sourceFilename,
      bytes: asset.sourceBytes?.toString() ?? null,
      checksum: asset.sourceChecksum,
    },
    media: {
      durationMs: asset.durationMs,
      width: asset.width,
      height: asset.height,
      frameRate: asset.frameRate,
      videoCodec: asset.videoCodec,
      audioCodec: asset.audioCodec,
    },
    processingMode: asset.processingMode,
    encodingProfileId: asset.encodingProfileId,
    encryption: asset.encryption,
    p2pEnabled: asset.p2pEnabled,
    posterUrl,
    readyAt: asset.readyAt,
    deletedAt: asset.deletedAt,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

/** The generated outputs of an asset, as returned by GET /v1/assets/{id}/media. */
export interface AssetMediaView {
  /** Qualities, highest first. */
  renditions: {
    name: string;
    width: number;
    height: number;
    /** Average bitrate in bits per second. */
    bitrate: number;
    frameRate: number | null;
    /** Codec strings as written in the playlist, for example "avc1.64001f,mp4a.40.2". */
    codec: string;
    /** Bytes as text. */
    sizeBytes: string;
  }[];
  /** The sound tracks: the one inside the video first, then the other languages and versions. */
  audio: AudioTrackView[];
  subtitles: {
    id: string;
    /** Language code, for example "en". */
    language: string;
    label: string | null;
    source: string;
    isDefault: boolean;
    isForced: boolean;
    /** Signed address of the WebVTT file. Null while the asset is not ready. */
    url: string | null;
  }[];
  /** Signed addresses. Null while the asset is not ready or the picture does not exist. */
  thumbnails: {
    posterUrl: string | null;
    spriteUrl: string | null;
    spriteTrackUrl: string | null;
  };
  /** Size of all qualities together, bytes as text. */
  outputBytes: string;
}
