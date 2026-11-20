// SPDX-License-Identifier: AGPL-3.0-only

/** Layout of a sprite sheet: small pictures taken at regular times, arranged in a grid. */
export interface SpritePlan {
  /** Seconds between two pictures. */
  intervalSeconds: number;
  /** Number of pictures. */
  count: number;
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
}

const TILE_WIDTH = 160;
const COLUMNS = 10;
/** One sheet holds at most this many pictures, which keeps it a single modest image. */
const MAX_TILES = 100;
const MIN_INTERVAL_SECONDS = 2;

/**
 * Plans the sprite sheet a player shows while the viewer hovers over the seek bar.
 *
 * Short videos get a picture every two seconds. Longer ones get wider
 * intervals, so the whole video always fits one sheet of at most 100 pictures.
 *
 * @param width Displayed width of the video, after any rotation.
 * @param height Displayed height of the video, after any rotation.
 * @returns Null when the video is too short for more than one picture.
 */
export function planSprite(durationMs: number, width: number, height: number): SpritePlan | null {
  const durationSeconds = durationMs / 1000;
  if (durationSeconds < MIN_INTERVAL_SECONDS * 2 || width <= 0 || height <= 0) {
    return null;
  }

  const intervalSeconds = Math.max(MIN_INTERVAL_SECONDS, Math.ceil(durationSeconds / MAX_TILES));
  const count = Math.min(MAX_TILES, Math.max(1, Math.floor(durationSeconds / intervalSeconds)));
  // Even height, as JPEG with 4:2:0 color needs.
  const tileHeight = Math.max(2, Math.round((TILE_WIDTH * height) / width / 2) * 2);

  return {
    intervalSeconds,
    count,
    columns: Math.min(COLUMNS, count),
    rows: Math.ceil(count / COLUMNS),
    tileWidth: TILE_WIDTH,
    tileHeight,
  };
}

export interface SpriteCommandInput {
  sourcePath: string;
  outputPath: string;
  videoStreamIndex: number;
  plan: SpritePlan;
}

/** Builds the FFmpeg arguments that write the sprite sheet as one JPEG. */
export function buildSpriteArgs(input: SpriteCommandInput): string[] {
  const { plan } = input;
  return [
    '-i',
    input.sourcePath,
    '-map',
    `0:v:${input.videoStreamIndex}`,
    '-vf',
    [
      `fps=1/${plan.intervalSeconds}`,
      `scale=${plan.tileWidth}:${plan.tileHeight}`,
      `tile=${plan.columns}x${plan.rows}`,
    ].join(','),
    // One sheet, even if rounding gives a frame more than planned.
    '-frames:v',
    '1',
    '-q:v',
    '5',
    '-an',
    '-sn',
    '-y',
    input.outputPath,
  ];
}

function timestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(Math.floor(seconds))}.${pad(Math.round((seconds % 1) * 1000), 3)}`;
}

/**
 * Builds the WebVTT file that tells a player which part of the sheet belongs
 * to which time range, using the "#xywh=" media fragment.
 *
 * @param imageName File name of the sheet, relative to the WebVTT file.
 */
export function buildSpriteVtt(plan: SpritePlan, durationMs: number, imageName: string): string {
  const durationSeconds = durationMs / 1000;
  const cues: string[] = ['WEBVTT', ''];

  for (let index = 0; index < plan.count; index += 1) {
    const start = index * plan.intervalSeconds;
    const isLast = index === plan.count - 1;
    const end = isLast ? Math.max(durationSeconds, start + 0.001) : start + plan.intervalSeconds;
    const x = (index % plan.columns) * plan.tileWidth;
    const y = Math.floor(index / plan.columns) * plan.tileHeight;

    cues.push(
      `${timestamp(start)} --> ${timestamp(end)}`,
      `${imageName}#xywh=${x},${y},${plan.tileWidth},${plan.tileHeight}`,
      '',
    );
  }

  return cues.join('\n');
}
