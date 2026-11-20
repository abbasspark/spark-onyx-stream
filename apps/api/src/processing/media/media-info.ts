// SPDX-License-Identifier: AGPL-3.0-only

export interface VideoStreamInfo {
  /** Position among the video streams of the file, for "-map 0:v:N". */
  index: number;
  codec: string;
  width: number;
  height: number;
  /** Frames per second. Null when the file does not say. */
  frameRate: number | null;
  pixelFormat: string | null;
  /** Codec profile as ffprobe names it, for example "High". */
  profile: string | null;
  /** Codec level as ffprobe reports it, for example 40 for H.264 level 4.0. */
  level: number | null;
  /** Clockwise rotation the player is asked to apply, in degrees. */
  rotation: number;
}

export interface AudioStreamInfo {
  /** Position among the audio streams of the file, for "-map 0:a:N". */
  index: number;
  codec: string;
  /** Codec profile as ffprobe names it, for example "LC" or "HE-AAC". */
  profile: string | null;
  channels: number;
  /** Language tag from the file, for example "eng". Null when missing. */
  language: string | null;
  isDefault: boolean;
}

export interface SubtitleStreamInfo {
  /** Position among the subtitle streams of the file, for "-map 0:s:N". */
  index: number;
  codec: string;
  language: string | null;
  /** Name given to the track in the file, for example "English (SDH)". */
  title: string | null;
  isDefault: boolean;
  /** Forced tracks carry only translations of foreign-language parts and are shown automatically. */
  isForced: boolean;
}

/** What the platform needs to know about a source file. */
export interface MediaInfo {
  container: string;
  durationMs: number | null;
  sizeBytes: number | null;
  bitrate: number | null;
  /** The first real video stream. Cover images are not counted. Null for audio-only files. */
  video: VideoStreamInfo | null;
  audio: AudioStreamInfo[];
  subtitles: SubtitleStreamInfo[];
}

interface RawStream {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  level?: number;
  width?: number;
  height?: number;
  pix_fmt?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  channels?: number;
  tags?: Record<string, string>;
  disposition?: Record<string, number>;
  side_data_list?: { rotation?: number | string }[];
}

interface RawProbe {
  format?: { format_name?: string; duration?: string; size?: string; bit_rate?: string };
  streams?: RawStream[];
}

function toNumber(value: string | number | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parses a rate such as "30000/1001" into frames per second. */
export function parseFrameRate(rate: string | undefined): number | null {
  if (!rate) {
    return null;
  }
  const [numerator, denominator = '1'] = rate.split('/');
  const value = Number(numerator) / Number(denominator);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) / 1000 : null;
}

function rotationOf(stream: RawStream): number {
  const fromSideData = stream.side_data_list?.find(
    (entry) => entry.rotation !== undefined,
  )?.rotation;
  const raw = toNumber(fromSideData) ?? toNumber(stream.tags?.rotate) ?? 0;
  // Side data gives counter-clockwise negatives such as -90. Normalize to 0, 90, 180 or 270.
  return (((Math.round(raw / 90) * 90) % 360) + 360) % 360;
}

function languageOf(stream: RawStream): string | null {
  const language = stream.tags?.language ?? stream.tags?.LANGUAGE;
  return language && language !== 'und' ? language.toLowerCase() : null;
}

/**
 * Reduces the JSON printed by
 * "ffprobe -print_format json -show_format -show_streams" to MediaInfo.
 *
 * @throws Error when the text is not ffprobe JSON.
 */
export function parseProbe(json: string): MediaInfo {
  let raw: RawProbe;
  try {
    raw = JSON.parse(json) as RawProbe;
  } catch {
    throw new Error('The probe result is not valid JSON');
  }

  const streams = raw.streams ?? [];
  const durationSeconds = toNumber(raw.format?.duration);

  let video: VideoStreamInfo | null = null;
  let videoIndex = 0;
  const audio: AudioStreamInfo[] = [];
  const subtitles: SubtitleStreamInfo[] = [];

  for (const stream of streams) {
    if (stream.codec_type === 'video') {
      const isCoverImage = stream.disposition?.attached_pic === 1;
      if (!video && !isCoverImage && stream.width && stream.height) {
        video = {
          index: videoIndex,
          codec: stream.codec_name ?? 'unknown',
          width: stream.width,
          height: stream.height,
          frameRate: parseFrameRate(stream.avg_frame_rate) ?? parseFrameRate(stream.r_frame_rate),
          pixelFormat: stream.pix_fmt ?? null,
          profile: stream.profile ?? null,
          level: typeof stream.level === 'number' && stream.level > 0 ? stream.level : null,
          rotation: rotationOf(stream),
        };
      }
      videoIndex += 1;
    } else if (stream.codec_type === 'audio') {
      audio.push({
        index: audio.length,
        codec: stream.codec_name ?? 'unknown',
        profile: stream.profile ?? null,
        channels: stream.channels ?? 0,
        language: languageOf(stream),
        isDefault: stream.disposition?.default === 1,
      });
    } else if (stream.codec_type === 'subtitle') {
      subtitles.push({
        index: subtitles.length,
        codec: stream.codec_name ?? 'unknown',
        language: languageOf(stream),
        title: stream.tags?.title ?? stream.tags?.TITLE ?? null,
        isDefault: stream.disposition?.default === 1,
        isForced: stream.disposition?.forced === 1,
      });
    }
  }

  return {
    container: raw.format?.format_name ?? 'unknown',
    durationMs:
      durationSeconds !== null && durationSeconds > 0 ? Math.round(durationSeconds * 1000) : null,
    sizeBytes: toNumber(raw.format?.size),
    bitrate: toNumber(raw.format?.bit_rate),
    video,
    audio,
    subtitles,
  };
}

/** Formats FFmpeg can open as "video" although they are text or still pictures. */
const NON_VIDEO_CONTAINERS = ['tty', 'image2', 'gif'];
const NON_VIDEO_CODECS = ['ansi'];
/** Anything shorter is a picture or an empty file, not a video. */
const MIN_DURATION_MS = 500;

/**
 * Tells whether a probed file can be processed as a video.
 *
 * FFmpeg is generous: it opens a text file as "terminal art" and a photo as a
 * one-frame video. Those would otherwise be encoded into meaningless streams.
 *
 * @returns The reason the file is not usable, or null when it is.
 */
export function unsupportedSourceReason(info: MediaInfo): string | null {
  if (!info.video) {
    return 'The file contains no video stream';
  }

  const containers = info.container.split(',');
  const isNonVideoContainer = containers.some(
    (name) => NON_VIDEO_CONTAINERS.includes(name) || name.endsWith('_pipe'),
  );
  if (isNonVideoContainer || NON_VIDEO_CODECS.includes(info.video.codec)) {
    return 'The file is a text file or a picture, not a video';
  }

  if (info.durationMs === null || info.durationMs < MIN_DURATION_MS) {
    return 'The file has no playable duration';
  }

  return null;
}

/**
 * Largest distance between two neighboring keyframes, in seconds.
 *
 * @param keyframeTimes Presentation times of the keyframes that were sampled.
 * @param sampledSeconds Length of the sampled part of the file. The distance
 * from the last keyframe to the end of the sample counts too, because a
 * missing keyframe there is as much a gap as one between two keyframes.
 * @returns Null when no keyframe was found.
 */
export function maxKeyframeGap(
  keyframeTimes: readonly number[],
  sampledSeconds: number,
): number | null {
  const times = [...keyframeTimes].filter((time) => Number.isFinite(time)).sort((a, b) => a - b);
  if (times.length === 0) {
    return null;
  }

  let largest = 0;
  for (let index = 1; index < times.length; index += 1) {
    largest = Math.max(largest, (times[index] as number) - (times[index - 1] as number));
  }
  const tail = sampledSeconds - (times[times.length - 1] as number);
  return Math.max(largest, tail, 0);
}
