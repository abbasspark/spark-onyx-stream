// SPDX-License-Identifier: AGPL-3.0-only
import { subtitleMediaLines, SUBTITLE_GROUP_ID, type SubtitleTrackPlan } from './subtitles.js';

/**
 * The multivariant playlist is written here and not taken from FFmpeg.
 * FFmpeg leaves a variant out of its own playlist when it does not know the
 * stream's bitrate, which is the normal case when a Matroska file is copied.
 * Measuring the finished segments also gives truer bitrates than the targets.
 */

export interface MediaSegment {
  uri: string;
  /** Length in seconds. */
  duration: number;
}

export interface MediaPlaylistInfo {
  /** File name of the initialization segment, from EXT-X-MAP. Null when there is none. */
  initUri: string | null;
  /** True when the segments are encrypted (EXT-X-KEY with a method other than NONE). */
  encrypted: boolean;
  segments: MediaSegment[];
}

/** Reads the segments and the initialization segment from an HLS media playlist. */
export function parseMediaPlaylist(content: string): MediaPlaylistInfo {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const segments: MediaSegment[] = [];
  let initUri: string | null = null;
  let encrypted = false;
  let pendingDuration: number | null = null;

  for (const line of lines) {
    if (line.startsWith('#EXT-X-MAP:')) {
      initUri = /URI="([^"]+)"/.exec(line)?.[1] ?? null;
    } else if (line.startsWith('#EXT-X-KEY:')) {
      encrypted = !/METHOD=NONE\b/.test(line);
    } else if (line.startsWith('#EXTINF:')) {
      const duration = Number(line.slice('#EXTINF:'.length).split(',')[0]);
      pendingDuration = Number.isFinite(duration) ? duration : null;
    } else if (line.length > 0 && !line.startsWith('#') && pendingDuration !== null) {
      segments.push({ uri: line, duration: pendingDuration });
      pendingDuration = null;
    }
  }

  return { initUri, encrypted, segments };
}

export interface Bitrates {
  /** Highest bitrate of any one segment, in bits per second. Players use it to avoid stalls. */
  peak: number;
  /** Bitrate over the whole stream, in bits per second. */
  average: number;
}

/** Computes peak and average bitrate from segment sizes and durations. */
export function measureBitrates(
  segments: readonly { bytes: number; duration: number }[],
): Bitrates {
  let peak = 0;
  let totalBits = 0;
  let totalSeconds = 0;

  for (const segment of segments) {
    const bits = segment.bytes * 8;
    totalBits += bits;
    totalSeconds += segment.duration;
    // Very short final segments would give absurd peaks, so they only count toward the average.
    if (segment.duration >= 0.5) {
      peak = Math.max(peak, bits / segment.duration);
    }
  }

  const average = totalSeconds > 0 ? totalBits / totalSeconds : 0;
  return { peak: Math.round(Math.max(peak, average)), average: Math.round(average) };
}

const hex = (value: number): string => value.toString(16).padStart(2, '0');

/**
 * Reads the H.264 codec string, such as "avc1.64001f", from an MP4
 * initialization segment. The three bytes after the version in the "avcC"
 * box are the profile, the constraint flags and the level, which is exactly
 * what the string encodes.
 *
 * @returns Null when the segment holds no H.264 configuration.
 */
export function avcCodecString(initSegment: Buffer): string | null {
  const position = initSegment.indexOf('avcC', 0, 'latin1');
  if (position === -1 || position + 8 > initSegment.length) {
    return null;
  }
  const profile = initSegment[position + 5] as number;
  const constraints = initSegment[position + 6] as number;
  const level = initSegment[position + 7] as number;
  return `avc1.${hex(profile)}${hex(constraints)}${hex(level)}`;
}

/** Profile number and constraint flags of the H.264 profiles, as two hexadecimal bytes. */
const AVC_PROFILES: Record<string, string> = {
  'Constrained Baseline': '42e0',
  Baseline: '4200',
  Main: '4d40',
  Extended: '5800',
  High: '6400',
  'High 10': '6e00',
  'High 4:2:2': '7a00',
  'High 4:4:4 Predictive': 'f400',
};

/**
 * Builds the H.264 codec string from the profile name and level ffprobe
 * reports. Used for MPEG-TS output, which has no initialization segment to
 * read the exact bytes from.
 *
 * @returns Null when the profile is unknown or the level is missing.
 */
export function avcCodecStringFromProfile(
  profile: string | null | undefined,
  level: number | null | undefined,
): string | null {
  const prefix = profile ? AVC_PROFILES[profile] : undefined;
  if (!prefix || !level || level < 1 || level > 255) {
    return null;
  }
  return `avc1.${prefix}${hex(level)}`;
}

/** Maps an AAC profile name from ffprobe to its codec string. Unknown profiles count as AAC-LC. */
export function aacCodecString(profile: string | null | undefined): string {
  switch (profile) {
    case 'HE-AAC':
      return 'mp4a.40.5';
    case 'HE-AACv2':
      return 'mp4a.40.29';
    default:
      return 'mp4a.40.2';
  }
}

export interface MasterVariant {
  /** Folder name of the quality, for example "720p". */
  name: string;
  width: number;
  height: number;
  bitrates: Bitrates;
  /** Codec strings of the video and, if present, the audio. */
  codecs: string[];
  frameRate: number | null;
}

/**
 * Builds the HLS multivariant playlist: the subtitle tracks, then one entry
 * per quality, highest first.
 */
export function buildMasterPlaylist(
  variants: readonly MasterVariant[],
  subtitles: readonly SubtitleTrackPlan[] = [],
): string {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-INDEPENDENT-SEGMENTS'];

  if (subtitles.length > 0) {
    lines.push(...subtitleMediaLines(subtitles));
  }

  const ordered = [...variants].sort(
    (a, b) => b.height - a.height || b.bitrates.peak - a.bitrates.peak,
  );
  for (const variant of ordered) {
    const attributes = [
      `BANDWIDTH=${variant.bitrates.peak}`,
      `AVERAGE-BANDWIDTH=${variant.bitrates.average}`,
      `RESOLUTION=${variant.width}x${variant.height}`,
      `CODECS="${variant.codecs.join(',')}"`,
      ...(variant.frameRate ? [`FRAME-RATE=${variant.frameRate.toFixed(3)}`] : []),
      ...(subtitles.length > 0 ? [`SUBTITLES="${SUBTITLE_GROUP_ID}"`] : []),
    ];
    lines.push(`#EXT-X-STREAM-INF:${attributes.join(',')}`, `${variant.name}/playlist.m3u8`);
  }

  return `${lines.join('\n')}\n`;
}
