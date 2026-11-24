// SPDX-License-Identifier: AGPL-3.0-only
import type { ProcessingMode } from '@onyx/database';
import type { MediaInfo } from './media-info.js';

export interface DecisionInput {
  info: MediaInfo;
  /** Largest keyframe distance found in the sampled part of the source, in seconds. */
  maxKeyframeGapSeconds: number | null;
  /** Segment length of the encoding profile, in seconds. */
  segmentSeconds: number;
  /** A mode chosen by the person who created the asset. It wins over the automatic choice. */
  forcedMode?: ProcessingMode | null;
}

export interface Decision {
  mode: ProcessingMode;
  /** Why this mode was chosen, in words suitable for the panel. */
  reason: string;
}

/** Pixel formats every browser and device can decode. */
const COMPATIBLE_PIXEL_FORMATS = ['yuv420p', 'yuvj420p'];
/** Allowance for rounding in keyframe times. */
const GAP_TOLERANCE_SECONDS = 0.1;

/**
 * Chooses how a source file is processed.
 *
 * COPY repackages the existing streams without re-encoding. It is fast and
 * lossless, and it is chosen only when the result plays everywhere and can be
 * cut into segments of the profile's length. Anything else is transcoded.
 * PASSTHROUGH is never chosen automatically.
 *
 * @throws Error when the file has no video stream.
 */
export function decideProcessingMode(input: DecisionInput): Decision {
  const { info, maxKeyframeGapSeconds, segmentSeconds, forcedMode } = input;

  if (!info.video) {
    throw new Error('The file contains no video stream');
  }
  if (forcedMode) {
    return { mode: forcedMode, reason: 'Chosen when the asset was created' };
  }

  const reasonsToTranscode: string[] = [];
  const { video } = info;

  if (video.codec !== 'h264') {
    reasonsToTranscode.push(`the video codec is ${video.codec}, not H.264`);
  }
  if (video.pixelFormat !== null && !COMPATIBLE_PIXEL_FORMATS.includes(video.pixelFormat)) {
    reasonsToTranscode.push(`the pixel format ${video.pixelFormat} does not play on all devices`);
  }
  if (video.rotation !== 0) {
    reasonsToTranscode.push('the video is stored rotated');
  }

  // The sound does not decide: it is kept apart from the picture, and each
  // stream is copied or encoded by itself.

  if (maxKeyframeGapSeconds === null) {
    reasonsToTranscode.push('no keyframes were found');
  } else if (maxKeyframeGapSeconds > segmentSeconds + GAP_TOLERANCE_SECONDS) {
    reasonsToTranscode.push(
      `keyframes are up to ${maxKeyframeGapSeconds.toFixed(1)} s apart, more than the ${segmentSeconds} s segment length`,
    );
  }

  if (reasonsToTranscode.length > 0) {
    return {
      mode: 'TRANSCODE',
      reason: `Transcoding because ${reasonsToTranscode.join(', and ')}`,
    };
  }
  return { mode: 'COPY', reason: 'The picture is already H.264 with regular keyframes' };
}
