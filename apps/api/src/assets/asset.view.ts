// SPDX-License-Identifier: AGPL-3.0-only
import type { Asset } from '@onyx/database';

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
