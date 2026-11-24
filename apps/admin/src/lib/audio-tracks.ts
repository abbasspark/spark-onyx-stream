// SPDX-License-Identifier: AGPL-3.0-only
//
// The sound tracks of a video: the languages and versions a player offers.
import type { AudioTrack } from '@/api/types';

/** File names offered when a sound file is picked. Other files are read by what is inside. */
export const AUDIO_ACCEPT =
  '.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.ac3,.eac3,.mka,.mp4,.mkv,.mov,.webm,audio/*';

const AUDIO_EXTENSIONS = AUDIO_ACCEPT.split(',').filter((entry) => entry.startsWith('.'));

/** The largest sound file the server takes. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024 * 1024;

export function isAudioFile(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Three-letter codes found in file names, by the tag a player uses. */
const THREE_LETTERS: Record<string, string> = {
  eng: 'en',
  ger: 'de',
  deu: 'de',
  fre: 'fr',
  fra: 'fr',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  dut: 'nl',
  nld: 'nl',
  ara: 'ar',
  tur: 'tr',
  rus: 'ru',
  pol: 'pl',
  jpn: 'ja',
  kor: 'ko',
  chi: 'zh',
  zho: 'zh',
  hin: 'hi',
};

/**
 * The language a file name ends in: "film.de.mp3" and "film_ger.flac" are
 * German. Two letters are taken as a language, three only when known.
 *
 * @returns Null when the name says none.
 */
export function languageFromFileName(name: string): string | null {
  const stem = name.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  const last =
    stem
      .split(/[._\-\s]+/)
      .at(-1)
      ?.toLowerCase() ?? '';
  if (/^[a-z]{2}$/.test(last)) {
    return last;
  }
  return THREE_LETTERS[last] ?? null;
}

/** "Stereo", "5.1", "Mono": what a number of channels is called. */
export function describeChannels(channels: number): string {
  switch (channels) {
    case 0:
      return '–';
    case 1:
      return 'Mono';
    case 2:
      return 'Stereo';
    case 6:
      return '5.1';
    case 8:
      return '7.1';
    default:
      return `${channels} channels`;
  }
}

/** "AAC" for "aac", "Dolby Digital" for "ac3": a codec as people know it. */
export function describeAudioCodec(codec: string): string {
  const known: Record<string, string> = {
    aac: 'AAC',
    mp3: 'MP3',
    ac3: 'Dolby Digital',
    eac3: 'Dolby Digital Plus',
    opus: 'Opus',
    flac: 'FLAC',
    dts: 'DTS',
  };
  return known[codec.toLowerCase()] ?? codec.toUpperCase();
}

/** Where a track comes from, in a few words. */
export function describeOrigin(track: Pick<AudioTrack, 'inVideo' | 'source'>): string {
  if (track.inVideo) {
    return 'Inside the video';
  }
  return track.source === 'EMBEDDED' ? 'From the video file' : 'Added as a file';
}

/** Whether anything about the tracks is still being made, so the list is worth asking for again. */
export function isMakingTracks(tracks: readonly Pick<AudioTrack, 'status'>[] | undefined): boolean {
  return tracks?.some((track) => track.status === 'PROCESSING') ?? false;
}
