// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import type { MediaInfo } from '../processing/media/media-info.js';
import { inputOptions, type LiveSource } from './live-source.js';

export const LIVE_PLAYLIST_NAME = 'index.m3u8';

/** Video codecs players take as they are. Anything else needs transcoding. */
const COPY_VIDEO_CODECS = ['h264', 'hevc'];

/** Thrown when a source cannot be repackaged without re-encoding the video. */
export class UnsupportedSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedSourceError';
  }
}

/** What a source carries, in the form kept on the channel. */
export interface SourceStreams {
  videoCodec: string;
  width: number;
  height: number;
  frameRate: number | null;
  audioCodec: string | null;
  audioChannels: number | null;
}

/** How a source is turned into the channel's output. */
export interface OutputPlan {
  streams: SourceStreams;
  /** Tag HEVC the way Apple players expect it. */
  tagHevc: boolean;
  /** "copy" passes the audio on, "aac" encodes it, "none" means the source has no audio. */
  audio: 'copy' | 'aac' | 'none';
  /** Channels of the encoded audio. Only used with "aac". */
  audioChannels: number;
}

/**
 * Decides how to package a probed source.
 *
 * Video is never touched in this mode. Audio is passed on when it is AAC and
 * encoded otherwise, which costs little: MP2 and AC-3 are common in broadcast
 * feeds and browsers play neither.
 *
 * @throws UnsupportedSourceError when the video would have to be re-encoded.
 */
export function planOutput(info: MediaInfo): OutputPlan {
  if (!info.video) {
    throw new UnsupportedSourceError('The source carries no video');
  }
  if (!COPY_VIDEO_CODECS.includes(info.video.codec)) {
    throw new UnsupportedSourceError(
      `The source sends ${info.video.codec.toUpperCase()} video. Channels are repackaged without re-encoding, which needs H.264 or HEVC`,
    );
  }

  const audio = info.audio.find((stream) => stream.isDefault) ?? info.audio[0] ?? null;
  return {
    streams: {
      videoCodec: info.video.codec,
      width: info.video.width,
      height: info.video.height,
      frameRate: info.video.frameRate,
      audioCodec: audio?.codec ?? null,
      audioChannels: audio?.channels ?? null,
    },
    tagHevc: info.video.codec === 'hevc',
    audio: !audio ? 'none' : audio.codec === 'aac' ? 'copy' : 'aac',
    audioChannels: Math.min(audio?.channels || 2, 2),
  };
}

/** Arguments for ffprobe to describe a source. */
export function buildProbeArgs(source: LiveSource): string[] {
  return [
    ...inputOptions(source),
    '-analyzeduration',
    '5000000',
    '-probesize',
    '5000000',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    source.url,
  ];
}

export interface LiveOutputSettings {
  /** Directory of the channel's playlist and segments. */
  directory: string;
  /** Wanted length of a segment in seconds. Segments end on key frames of the source. */
  segmentSeconds: number;
  /** Segments kept in the playlist. */
  playlistSegments: number;
  /** Names the header file of this run: the stream may differ after a restart. */
  runId: string;
}

/**
 * Arguments for FFmpeg to pull a source and write it as HLS with fMP4 segments.
 *
 * Segment numbers follow the clock, so they keep rising across restarts and a
 * player that is watching goes on instead of starting over.
 */
export function buildLiveArgs(
  source: LiveSource,
  plan: OutputPlan,
  settings: LiveOutputSettings,
): string[] {
  const audio =
    plan.audio === 'none'
      ? []
      : plan.audio === 'copy'
        ? ['-map', '0:a:0', '-c:a', 'copy']
        : ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k', '-ac', String(plan.audioChannels)];

  return [
    '-hide_banner',
    '-nostdin',
    '-nostats',
    '-loglevel',
    'warning',
    '-progress',
    'pipe:1',
    '-stats_period',
    '1',
    ...inputOptions(source),
    '-i',
    source.url,
    '-map',
    '0:v:0',
    '-c:v',
    'copy',
    ...(plan.tagHevc ? ['-tag:v', 'hvc1'] : []),
    ...audio,
    '-sn',
    '-dn',
    '-f',
    'hls',
    '-hls_time',
    String(settings.segmentSeconds),
    '-hls_list_size',
    String(settings.playlistSegments),
    // Segments that left the playlist stay a little longer for players that are behind.
    '-hls_delete_threshold',
    '3',
    '-hls_segment_type',
    'fmp4',
    '-hls_flags',
    'delete_segments+independent_segments+program_date_time+temp_file+omit_endlist',
    '-hls_start_number_source',
    'epoch',
    '-hls_fmp4_init_filename',
    `init-${settings.runId}.mp4`,
    '-hls_segment_filename',
    path.join(settings.directory, 'seg-%d.m4s'),
    path.join(settings.directory, LIVE_PLAYLIST_NAME),
  ];
}
