// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import type { ChannelMode } from '@onyx/database';
import type { MediaInfo } from '../processing/media/media-info.js';
import { ladderFor, type Rendition } from './live-ladder.js';
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

/** How the picture of a channel is made. */
export type VideoPlan =
  | { kind: 'copy'; /** Tag HEVC the way Apple players expect it. */ tagHevc: boolean }
  | { kind: 'transcode'; /** Best first. */ renditions: Rendition[] };

/** How a source is turned into the channel's output. */
export interface OutputPlan {
  streams: SourceStreams;
  video: VideoPlan;
  /** "copy" passes the audio on, "aac" encodes it, "none" means the source has no audio. */
  audio: 'copy' | 'aac' | 'none';
  /** Channels of the encoded audio. Only used with "aac". */
  audioChannels: number;
}

export interface ChannelProcessing {
  mode: ChannelMode;
  /** Picture heights to encode. Only used with TRANSCODE. */
  qualities: readonly number[];
}

/** Why a source cannot be passed on untouched. Null when it can. */
export function copyObstacle(videoCodec: string): string | null {
  return COPY_VIDEO_CODECS.includes(videoCodec)
    ? null
    : `The source sends ${videoCodec.toUpperCase()} video, which players cannot show as it is. Passing a channel through needs H.264 or HEVC`;
}

/**
 * Decides how to package a probed source.
 *
 * Passing through never touches the video. Audio is passed on when it is AAC
 * and encoded otherwise, which costs little: MP2 and AC-3 are common in
 * broadcast feeds and browsers play neither.
 *
 * Transcoding encodes the video into the chosen qualities, whatever the
 * source sends, and the audio with it.
 *
 * @throws UnsupportedSourceError when the source cannot be used this way.
 */
export function planOutput(info: MediaInfo, processing: ChannelProcessing): OutputPlan {
  if (!info.video) {
    throw new UnsupportedSourceError('The source carries no video');
  }
  const audio = info.audio.find((stream) => stream.isDefault) ?? info.audio[0] ?? null;
  const streams: SourceStreams = {
    videoCodec: info.video.codec,
    width: info.video.width,
    height: info.video.height,
    frameRate: info.video.frameRate,
    audioCodec: audio?.codec ?? null,
    audioChannels: audio?.channels ?? null,
  };
  const audioChannels = Math.min(audio?.channels || 2, 2);

  if (processing.mode === 'TRANSCODE') {
    return {
      streams,
      video: {
        kind: 'transcode',
        renditions: ladderFor(processing.qualities, streams.height, streams.frameRate),
      },
      audio: audio ? 'aac' : 'none',
      audioChannels,
    };
  }

  const obstacle = copyObstacle(streams.videoCodec);
  if (obstacle) {
    throw new UnsupportedSourceError(`${obstacle}. Switch the channel to transcoding`);
  }
  return {
    streams,
    video: { kind: 'copy', tagHevc: streams.videoCodec === 'hevc' },
    audio: !audio ? 'none' : audio.codec === 'aac' ? 'copy' : 'aac',
    audioChannels,
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
  /** Wanted length of a segment in seconds. */
  segmentSeconds: number;
  /** Segments kept in the playlist. */
  playlistSegments: number;
  /** Names the header files of this run: the stream may differ after a restart. */
  runId: string;
  /** Speed setting of the H.264 encoder. Only used when transcoding. */
  preset: string;
}

/** Name of the playlist of one quality of a transcoded channel. */
export function variantPlaylistName(rendition: string): string {
  return `q-${rendition}.m3u8`;
}

/**
 * Arguments for FFmpeg to pull a source and write it as HLS with fMP4 segments.
 *
 * Segment numbers follow the clock, so they keep rising across restarts and a
 * player that is watching goes on instead of starting over.
 *
 * A channel that is passed through has one playlist, "index.m3u8". A
 * transcoded one has a playlist per quality and "index.m3u8" lists them, so
 * the address players open is the same either way.
 */
export function buildLiveArgs(
  source: LiveSource,
  plan: OutputPlan,
  settings: LiveOutputSettings,
): string[] {
  const input = [
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
  ];
  const hls = [
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
  ];

  if (plan.video.kind === 'copy') {
    const audio =
      plan.audio === 'none'
        ? []
        : plan.audio === 'copy'
          ? ['-map', '0:a:0', '-c:a', 'copy']
          : ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k', '-ac', String(plan.audioChannels)];
    return [
      ...input,
      '-map',
      '0:v:0',
      '-c:v',
      'copy',
      ...(plan.video.tagHevc ? ['-tag:v', 'hvc1'] : []),
      ...audio,
      ...hls,
      '-hls_fmp4_init_filename',
      `init-${settings.runId}.mp4`,
      '-hls_segment_filename',
      path.join(settings.directory, 'seg-%d.m4s'),
      path.join(settings.directory, LIVE_PLAYLIST_NAME),
    ];
  }

  const { renditions } = plan.video;
  const hasAudio = plan.audio !== 'none';
  // Interlaced pictures, usual in broadcast feeds, are made whole first. Other pictures pass untouched.
  const split = renditions.map((_, index) => `[s${index}]`).join('');
  const scales = renditions.map(
    (rendition, index) =>
      // The width follows the shape of the picture as it is shown, with square pixels and an even number.
      `[s${index}]scale=w='trunc(oh*dar/2)*2':h=${rendition.height},setsar=1[v${index}]`,
  );
  const filter = [`[0:v:0]yadif=deint=interlaced,split=${renditions.length}${split}`, ...scales];

  // Key frames at the same moments in every quality, so players can switch between them at any segment.
  const keyFrameSeconds = settings.segmentSeconds / Math.ceil(settings.segmentSeconds / 2);

  return [
    ...input,
    '-filter_complex',
    filter.join(';'),
    ...renditions.flatMap((_, index) => [
      '-map',
      `[v${index}]`,
      ...(hasAudio ? ['-map', '0:a:0'] : []),
    ]),
    '-c:v',
    'libx264',
    '-preset',
    settings.preset,
    '-pix_fmt',
    'yuv420p',
    '-sc_threshold',
    '0',
    '-force_key_frames',
    `expr:gte(t,n_forced*${keyFrameSeconds})`,
    ...renditions.flatMap((rendition, index) => [
      `-b:v:${index}`,
      `${rendition.videoKbps}k`,
      `-maxrate:v:${index}`,
      `${rendition.maxrateKbps}k`,
      `-bufsize:v:${index}`,
      `${rendition.videoKbps * 2}k`,
      `-profile:v:${index}`,
      rendition.profile,
    ]),
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', String(plan.audioChannels)] : []),
    ...hls,
    '-var_stream_map',
    renditions
      .map((rendition, index) =>
        hasAudio
          ? `v:${index},a:${index},name:${rendition.name}`
          : `v:${index},name:${rendition.name}`,
      )
      .join(' '),
    '-master_pl_name',
    LIVE_PLAYLIST_NAME,
    '-hls_fmp4_init_filename',
    `init-${settings.runId}-%v.mp4`,
    '-hls_segment_filename',
    path.join(settings.directory, 'seg-%v-%d.m4s'),
    path.join(settings.directory, variantPlaylistName('%v')),
  ];
}
