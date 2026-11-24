// SPDX-License-Identifier: AGPL-3.0-only
import type { MediaInfo } from './media-info.js';

/** Subtitle formats that are text and can be converted to WebVTT. Picture-based formats cannot. */
const TEXT_SUBTITLE_CODECS = ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text'];

export const SUBTITLE_GROUP_ID = 'subs';
export const SUBTITLE_FILE_NAME = 'subtitles.vtt';
export const SUBTITLE_PLAYLIST_NAME = 'playlist.m3u8';

/** Two-letter codes and display names for the three-letter language codes found in media files. */
const LANGUAGES: Record<string, { code: string; name: string }> = {
  eng: { code: 'en', name: 'English' },
  ger: { code: 'de', name: 'Deutsch' },
  deu: { code: 'de', name: 'Deutsch' },
  fre: { code: 'fr', name: 'Français' },
  fra: { code: 'fr', name: 'Français' },
  spa: { code: 'es', name: 'Español' },
  ita: { code: 'it', name: 'Italiano' },
  por: { code: 'pt', name: 'Português' },
  dut: { code: 'nl', name: 'Nederlands' },
  nld: { code: 'nl', name: 'Nederlands' },
  ara: { code: 'ar', name: 'العربية' },
  tur: { code: 'tr', name: 'Türkçe' },
  rus: { code: 'ru', name: 'Русский' },
  pol: { code: 'pl', name: 'Polski' },
  jpn: { code: 'ja', name: '日本語' },
  kor: { code: 'ko', name: '한국어' },
  chi: { code: 'zh', name: '中文' },
  zho: { code: 'zh', name: '中文' },
  hin: { code: 'hi', name: 'हिन्दी' },
};

/**
 * What a language tag found in a media file is to a player: its short code
 * and its own name. Undefined for a tag that is not in the list.
 */
export function knownLanguage(
  tag: string | null | undefined,
): { code: string; name: string } | undefined {
  return tag ? LANGUAGES[tag] : undefined;
}

/** The name of a language in itself, by its short code: "Deutsch" for "de". Undefined when not known. */
export function languageNameOf(code: string): string | undefined {
  return Object.values(LANGUAGES).find((language) => language.code === code)?.name;
}

/** A subtitle stream of the source that will become a WebVTT track. */
export interface SubtitleTrackPlan {
  /** Position among the source's subtitle streams, for "-map 0:s:N". */
  streamIndex: number;
  /** Folder name of the track inside the HLS output, unique per asset. */
  slug: string;
  /** Language tag for the player, for example "en". "und" when unknown. */
  language: string;
  /** Name shown in the player's subtitle menu, unique per asset. */
  label: string;
  isDefault: boolean;
  isForced: boolean;
}

export interface SubtitlePlan {
  tracks: SubtitleTrackPlan[];
  /** Subtitle streams that were left out, with the reason, for the job output. */
  skipped: string[];
}

/** Chooses the subtitle streams that can be converted and gives each a slug and a label. */
export function planSubtitles(info: MediaInfo): SubtitlePlan {
  const tracks: SubtitleTrackPlan[] = [];
  const skipped: string[] = [];
  const usedLabels = new Set<string>();

  for (const stream of info.subtitles) {
    if (!TEXT_SUBTITLE_CODECS.includes(stream.codec)) {
      skipped.push(
        `Subtitle stream ${stream.index + 1} (${stream.codec}) is picture-based and cannot be converted to text`,
      );
      continue;
    }

    const known = stream.language ? LANGUAGES[stream.language] : undefined;
    const language =
      known?.code ??
      (stream.language && /^[a-z]{2,3}$/.test(stream.language) ? stream.language : 'und');

    let label =
      stream.title?.trim() ||
      known?.name ||
      (language === 'und' ? `Track ${tracks.length + 1}` : language);
    // Players list tracks by name, and HLS requires the names in a group to differ.
    let suffix = 2;
    const base = label;
    while (usedLabels.has(label)) {
      label = `${base} ${suffix}`;
      suffix += 1;
    }
    usedLabels.add(label);

    tracks.push({
      streamIndex: stream.index,
      slug: `${tracks.length}-${language}`,
      language,
      label,
      isDefault: stream.isDefault,
      isForced: stream.isForced,
    });
  }

  return { tracks, skipped };
}

/** Builds the FFmpeg arguments that convert one subtitle stream to a WebVTT file. */
export function buildSubtitleArgs(
  sourcePath: string,
  streamIndex: number,
  outputPath: string,
): string[] {
  return ['-i', sourcePath, '-map', `0:s:${streamIndex}`, '-c:s', 'webvtt', '-y', outputPath];
}

/** Builds the HLS media playlist that presents a whole WebVTT file as one segment. */
export function buildSubtitlePlaylist(durationMs: number): string {
  const seconds = Math.max(1, durationMs / 1000);
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    `#EXT-X-TARGETDURATION:${Math.ceil(seconds)}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    `#EXTINF:${seconds.toFixed(3)},`,
    SUBTITLE_FILE_NAME,
    '#EXT-X-ENDLIST',
    '',
  ].join('\n');
}

/** Quotes a value for an HLS attribute. Quotes and line breaks cannot appear inside one. */
export function quoted(value: string): string {
  return `"${value.replace(/["\r\n]/g, ' ').trim()}"`;
}

/**
 * Builds the EXT-X-MEDIA lines that list subtitle tracks in a multivariant playlist.
 *
 * Only forced tracks are marked as default, so ordinary subtitles stay off
 * until the viewer turns them on.
 */
export function subtitleMediaLines(tracks: readonly SubtitleTrackPlan[]): string[] {
  return tracks.map((track) =>
    [
      '#EXT-X-MEDIA:TYPE=SUBTITLES',
      `GROUP-ID=${quoted(SUBTITLE_GROUP_ID)}`,
      `NAME=${quoted(track.label)}`,
      `LANGUAGE=${quoted(track.language)}`,
      `DEFAULT=${track.isForced ? 'YES' : 'NO'}`,
      'AUTOSELECT=YES',
      `FORCED=${track.isForced ? 'YES' : 'NO'}`,
      `URI=${quoted(`subs/${track.slug}/${SUBTITLE_PLAYLIST_NAME}`)}`,
    ].join(','),
  );
}

/**
 * Puts a list of subtitle tracks into a multivariant playlist that exists,
 * in place of the ones it lists. Used when tracks are added, renamed or
 * removed after the video was processed: the qualities stay as they are.
 */
export function withSubtitleTracks(master: string, tracks: readonly SubtitleTrackPlan[]): string {
  const group = `,SUBTITLES=${quoted(SUBTITLE_GROUP_ID)}`;
  const lines = master
    .split('\n')
    .filter((line) => !line.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES'))
    .map((line) => {
      if (!line.startsWith('#EXT-X-STREAM-INF:')) {
        return line;
      }
      const bare = line.replace(/,SUBTITLES="[^"]*"/, '');
      return tracks.length > 0 ? `${bare}${group}` : bare;
    });
  const first = lines.findIndex((line) => line.startsWith('#EXT-X-STREAM-INF:'));
  lines.splice(first === -1 ? lines.length : first, 0, ...subtitleMediaLines(tracks));
  return lines.join('\n');
}

/** Gives every track a name no other has, as HLS requires inside a group. */
export function withUniqueLabels<T extends { label: string }>(tracks: readonly T[]): T[] {
  const used = new Set<string>();
  return tracks.map((track) => {
    let label = track.label;
    for (let suffix = 2; used.has(label); suffix += 1) {
      label = `${track.label} ${suffix}`;
    }
    used.add(label);
    return { ...track, label };
  });
}
