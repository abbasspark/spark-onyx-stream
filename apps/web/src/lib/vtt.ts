// SPDX-License-Identifier: AGPL-3.0-only

/** One small preview picture: a region of a sheet, shown for a span of the video. */
export interface PreviewCue {
  start: number;
  end: number;
  /** Address of the sheet. */
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Reads "00:01:02.500" or "01:02.500" as seconds. */
function parseTime(text: string): number | null {
  const parts = text.trim().split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }
  const numbers = parts.map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return numbers.reduce((total, value) => total * 60 + value, 0);
}

/**
 * Reads a WebVTT file of seek-bar previews. Each cue names a picture and,
 * after "#xywh=", the region of it to show. Cues that cannot be read are
 * skipped, because a missing preview must never break playback.
 *
 * @param baseUrl Absolute address of the file. Picture names are relative to it.
 */
export function parsePreviewTrack(text: string, baseUrl: string): PreviewCue[] {
  const cues: PreviewCue[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const timing = lines[index]?.match(/^(\S+)\s+-->\s+(\S+)/);
    const target = lines[index + 1]?.trim();
    if (!timing || !target) {
      continue;
    }
    const start = parseTime(timing[1] ?? '');
    const end = parseTime(timing[2] ?? '');
    const region = target.match(/^(.*)#xywh=(\d+),(\d+),(\d+),(\d+)$/);
    if (start === null || end === null || !region) {
      continue;
    }

    let url: string;
    try {
      url = new URL(region[1] ?? '', baseUrl).toString();
    } catch {
      continue;
    }
    cues.push({
      start,
      end,
      url,
      x: Number(region[2]),
      y: Number(region[3]),
      width: Number(region[4]),
      height: Number(region[5]),
    });
  }
  return cues;
}

/** The preview for a moment of the video. The cues are in order of time. */
export function findPreview(cues: readonly PreviewCue[], seconds: number): PreviewCue | undefined {
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const cue = cues[middle] as PreviewCue;
    if (seconds < cue.start) {
      high = middle - 1;
    } else if (seconds >= cue.end) {
      low = middle + 1;
    } else {
      return cue;
    }
  }
  // Not inside any cue, for example in the final seconds: the picture just before.
  return cues[Math.max(0, high)];
}
