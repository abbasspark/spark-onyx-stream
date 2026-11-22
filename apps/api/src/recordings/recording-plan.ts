// SPDX-License-Identifier: AGPL-3.0-only

/** The longest stretch one recording may cover. */
export const MAX_RECORDING_MS = 8 * 60 * 60 * 1000;
/** A recording may begin this far in the past, which is as far back as a channel can keep. */
export const MAX_PAST_START_MS = 4 * 60 * 60 * 1000;

/** A segment of a playlist with the moment it was sent. */
export interface DatedSegment {
  name: string;
  seconds: number;
  /** When the segment begins, as Unix milliseconds. */
  startsAt: number;
}

/**
 * The segments of a media playlist with their times. Channels write the time
 * of every segment. Should one be missing, it follows from the one before.
 * Segments before the first known time are left out.
 */
export function parseDatedSegments(playlist: string): DatedSegment[] {
  const segments: DatedSegment[] = [];
  let seconds: number | null = null;
  let date: number | null = null;
  let next: number | null = null;

  for (const raw of playlist.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      const value = Number.parseFloat(line.slice('#EXTINF:'.length));
      seconds = Number.isFinite(value) && value > 0 ? value : null;
    } else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) {
      // FFmpeg writes the offset without a colon ("+0100"), which Date does not read.
      const text = line
        .slice('#EXT-X-PROGRAM-DATE-TIME:'.length)
        .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
      const parsed = Date.parse(text);
      date = Number.isNaN(parsed) ? null : parsed;
    } else if (line.length > 0 && !line.startsWith('#')) {
      const startsAt: number | null = date ?? next;
      if (seconds !== null && startsAt !== null) {
        segments.push({ name: line, seconds, startsAt });
        next = startsAt + seconds * 1000;
      }
      seconds = null;
      date = null;
    }
  }
  return segments;
}

/**
 * The segment a recording goes on from: the one that covers a moment, or the
 * oldest one when that moment is no longer kept. Null when the moment lies
 * ahead of everything the playlist has, which means waiting.
 */
export function pickStart(
  segments: readonly DatedSegment[],
  from: number,
): { index: number; at: number } | null {
  const index = segments.findIndex((segment) => segment.startsAt + segment.seconds * 1000 > from);
  if (index === -1) {
    return null;
  }
  return { index, at: (segments[index] as DatedSegment).startsAt };
}

/**
 * Arguments for FFmpeg to copy a stretch of a channel from its own playlist
 * into a file. The file is written in pieces, so what is there stays usable
 * when the process is stopped.
 */
export function buildRecordArgs(
  playlist: string,
  startIndex: number,
  seconds: number,
  output: string,
): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    // The playlist and its segments are local files of this server.
    '-allowed_extensions',
    'ALL',
    '-protocol_whitelist',
    'file,crypto',
    '-live_start_index',
    String(startIndex),
    '-i',
    playlist,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c',
    'copy',
    '-t',
    seconds.toFixed(3),
    '-movflags',
    '+frag_keyframe+empty_moov+default_base_moof',
    '-f',
    'mp4',
    output,
  ];
}

/** Arguments for FFmpeg to join the parts of a recording, listed in a file, without re-encoding. */
export function buildJoinArgs(listFile: string, output: string): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    output,
  ];
}

/** A file name for the library made from the title of a recording. */
export function recordingFileName(title: string, startsAt: Date): string {
  const base = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  const day = startsAt.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `${base || 'recording'}-${day}.mp4`;
}
