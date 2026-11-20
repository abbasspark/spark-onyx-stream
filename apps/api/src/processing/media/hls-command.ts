// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import type { PlannedRendition } from './ladder.js';

export const MASTER_PLAYLIST_NAME = 'master.m3u8';
export const MEDIA_PLAYLIST_NAME = 'playlist.m3u8';

export interface HlsTiming {
  /** Segment length in seconds. */
  segmentSeconds: number;
  /** Distance between keyframes in seconds. Must divide the segment length evenly. */
  keyframeSeconds: number;
}

/** Arguments shared by every HLS output: fragmented MP4 segments in an on-demand playlist. */
function hlsOutputArgs(
  outputDirectory: string,
  segmentSeconds: number,
  streamMap: string,
): string[] {
  return [
    '-f',
    'hls',
    '-hls_time',
    String(segmentSeconds),
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    'fmp4',
    '-hls_flags',
    'independent_segments',
    '-hls_fmp4_init_filename',
    'init.mp4',
    '-hls_segment_filename',
    path.join(outputDirectory, '%v', 'seg-%05d.m4s'),
    '-master_pl_name',
    MASTER_PLAYLIST_NAME,
    '-var_stream_map',
    streamMap,
    path.join(outputDirectory, '%v', MEDIA_PLAYLIST_NAME),
  ];
}

export interface TranscodeCommandInput {
  sourcePath: string;
  /** Empty directory the playlists and segments are written to. */
  outputDirectory: string;
  renditions: readonly PlannedRendition[];
  /** Position of the video stream among the source's video streams. */
  videoStreamIndex: number;
  /** Position of the audio stream to use among the source's audio streams. Null for no audio. */
  audioStreamIndex: number | null;
  timing: HlsTiming;
}

/**
 * Builds the FFmpeg arguments that encode a source into an HLS ladder.
 *
 * Every rendition gets keyframes at exactly the same times, with scene-change
 * keyframes switched off, so segments line up across renditions. Players need
 * that to switch quality without a glitch, and peers need it to share segments.
 */
export function buildTranscodeArgs(input: TranscodeCommandInput): string[] {
  const { renditions, timing } = input;
  if (renditions.length === 0) {
    throw new Error('At least one rendition is required');
  }
  if (timing.segmentSeconds % timing.keyframeSeconds !== 0) {
    throw new Error('The keyframe interval must divide the segment length evenly');
  }

  const hasAudio = input.audioStreamIndex !== null;
  const count = renditions.length;

  // Split the decoded video once and scale each copy. "-2" keeps the aspect ratio with an even width.
  const splitOutputs = renditions.map((_, index) => `[v${index}]`).join('');
  const scales = renditions.map(
    (rendition, index) => `[v${index}]scale=-2:${rendition.height}[v${index}o]`,
  );
  const filter = [`[0:v:${input.videoStreamIndex}]split=${count}${splitOutputs}`, ...scales].join(
    ';',
  );

  const maps: string[] = [];
  const perRendition: string[] = [];
  renditions.forEach((rendition, index) => {
    maps.push('-map', `[v${index}o]`);
    if (hasAudio) {
      maps.push('-map', `0:a:${input.audioStreamIndex}`);
    }

    perRendition.push(
      `-b:v:${index}`,
      String(rendition.videoBitrate),
      `-maxrate:v:${index}`,
      String(Math.round(rendition.videoBitrate * 1.07)),
      `-bufsize:v:${index}`,
      String(Math.round(rendition.videoBitrate * 1.5)),
      `-preset:v:${index}`,
      rendition.preset,
    );
    if (hasAudio) {
      perRendition.push(`-b:a:${index}`, String(rendition.audioBitrate));
    }
  });

  const streamMap = renditions
    .map((rendition, index) => `v:${index}${hasAudio ? `,a:${index}` : ''},name:${rendition.name}`)
    .join(' ');

  return [
    '-i',
    input.sourcePath,
    '-filter_complex',
    filter,
    ...maps,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-sc_threshold',
    '0',
    '-force_key_frames',
    `expr:gte(t,n_forced*${timing.keyframeSeconds})`,
    ...(hasAudio ? ['-c:a', 'aac', '-ac', '2'] : []),
    ...perRendition,
    // Subtitles and data streams are handled separately.
    '-sn',
    '-dn',
    ...hlsOutputArgs(input.outputDirectory, timing.segmentSeconds, streamMap),
  ];
}

export interface CopyCommandInput {
  sourcePath: string;
  outputDirectory: string;
  /** Name of the single rendition, for example "1080p". */
  renditionName: string;
  videoStreamIndex: number;
  audioStreamIndex: number | null;
  segmentSeconds: number;
}

/**
 * Builds the FFmpeg arguments that repackage a source into HLS without
 * re-encoding. Segments are cut at the source's own keyframes.
 */
export function buildCopyArgs(input: CopyCommandInput): string[] {
  const hasAudio = input.audioStreamIndex !== null;

  return [
    '-i',
    input.sourcePath,
    '-map',
    `0:v:${input.videoStreamIndex}`,
    ...(hasAudio ? ['-map', `0:a:${input.audioStreamIndex}`] : []),
    '-c',
    'copy',
    '-sn',
    '-dn',
    ...hlsOutputArgs(
      input.outputDirectory,
      input.segmentSeconds,
      `v:0${hasAudio ? ',a:0' : ''},name:${input.renditionName}`,
    ),
  ];
}

export interface PosterCommandInput {
  sourcePath: string;
  outputPath: string;
  videoStreamIndex: number;
  /** Position in the source to take the picture from, in seconds. */
  atSeconds: number;
  /** Largest height of the picture. A smaller source is not enlarged. */
  maxHeight: number;
}

/** Builds the FFmpeg arguments that save one frame as a JPEG picture. */
export function buildPosterArgs(input: PosterCommandInput): string[] {
  return [
    // Seeking before the input is fast, because FFmpeg jumps to the nearest keyframe first.
    '-ss',
    input.atSeconds.toFixed(3),
    '-i',
    input.sourcePath,
    '-map',
    `0:v:${input.videoStreamIndex}`,
    '-frames:v',
    '1',
    '-vf',
    `scale=-2:'min(${input.maxHeight},ih)'`,
    '-q:v',
    '3',
    '-y',
    input.outputPath,
  ];
}
