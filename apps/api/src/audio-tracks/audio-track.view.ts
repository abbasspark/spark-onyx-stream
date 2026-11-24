// SPDX-License-Identifier: AGPL-3.0-only
import type { AudioTrack } from '@onyx/database';

/** One language, or one version, of the sound of a video, as the panel sees it. */
export interface AudioTrackView {
  id: string;
  /** Language tag, for example "en". "und" when not known. */
  language: string;
  label: string | null;
  /** EMBEDDED: came with the source file. UPLOADED: a file added afterwards. */
  source: AudioTrack['source'];
  /** PROCESSING while an added file is made into a track, FAILED when it could not be. */
  status: AudioTrack['status'];
  /** Why it failed. */
  error: string | null;
  /** The track players start with when the viewer has no preference. */
  isDefault: boolean;
  /** Whether the sound is inside the video segments. Such a track cannot be removed. */
  inVideo: boolean;
  codec: string;
  /** 0 while not known. */
  channels: number;
  /** Bits per second. 0 while not known, and for sound inside the video. */
  bitrate: number;
  /** Bytes as text. "0" for sound inside the video. */
  sizeBytes: string;
  /** The name of the file an added track was made from. */
  fileName: string | null;
  createdAt: Date;
}

export function toAudioTrackView(track: AudioTrack): AudioTrackView {
  return {
    id: track.id,
    language: track.language,
    label: track.label,
    source: track.source,
    status: track.status,
    error: track.error,
    isDefault: track.isDefault,
    inVideo: track.playlistPath === null,
    codec: track.codec,
    channels: track.channels,
    bitrate: track.bitrate,
    sizeBytes: track.sizeBytes.toString(),
    fileName: track.sourceFilename,
    createdAt: track.createdAt,
  };
}
