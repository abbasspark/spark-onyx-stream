// SPDX-License-Identifier: AGPL-3.0-only
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { LIVE_PLAYLIST_NAME } from './live-command.js';

export interface PlaylistSegment {
  name: string;
  seconds: number;
}

/** The segments a media playlist lists, with their lengths. */
export function parseSegments(playlist: string): PlaylistSegment[] {
  const segments: PlaylistSegment[] = [];
  let seconds: number | null = null;

  for (const raw of playlist.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      const value = Number.parseFloat(line.slice('#EXTINF:'.length));
      seconds = Number.isFinite(value) && value > 0 ? value : null;
    } else if (line.length > 0 && !line.startsWith('#')) {
      if (seconds !== null) {
        segments.push({ name: line, seconds });
      }
      seconds = null;
    }
  }
  return segments;
}

/**
 * Bits per second of what a channel currently sends out, measured over the
 * segments in its playlist. Null when there is nothing to measure yet.
 */
export async function measureBitrate(directory: string): Promise<number | null> {
  try {
    const segments = parseSegments(
      await readFile(path.join(directory, LIVE_PLAYLIST_NAME), 'utf8'),
    );
    const sizes = await Promise.all(
      segments.map((segment) =>
        // Names come from a file FFmpeg wrote. Only plain file names are looked at all the same.
        path.basename(segment.name) === segment.name
          ? stat(path.join(directory, segment.name)).then(
              (info) => info.size,
              () => null,
            )
          : null,
      ),
    );

    let bytes = 0;
    let seconds = 0;
    segments.forEach((segment, index) => {
      const size = sizes[index];
      if (size !== null && size !== undefined) {
        bytes += size;
        seconds += segment.seconds;
      }
    });
    return seconds > 0 ? Math.round((bytes * 8) / seconds) : null;
  } catch {
    return null;
  }
}
