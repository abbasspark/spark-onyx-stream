// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import { type HlsEncryption, MEDIA_PLAYLIST_NAME } from './hls-command.js';
import type { AudioStreamInfo, MediaInfo } from './media-info.js';
import { knownLanguage, languageNameOf, quoted } from './subtitles.js';

/**
 * The sound of a video is kept apart from its picture.
 *
 * The qualities hold the picture only. Every sound stream of the source, and
 * every sound file added later, is a rendition of its own: a folder with a
 * playlist and sound-only segments, named in the multivariant playlist. A
 * player plays the picture of the quality that fits the connection with the
 * sound of the language the viewer likes.
 *
 * Kept apart, a language can be added to a video, or taken out of it,
 * without touching the picture, and the sound is stored once instead of
 * once per quality.
 *
 * Videos processed before this have their one sound inside the segments of
 * the picture. They play as they always did, and are listed as "in the
 * video" until they are processed again.
 */

export const AUDIO_GROUP_ID = 'audio';
/** Every track folder starts with this, beside the folders of the qualities. */
export const AUDIO_FOLDER_PREFIX = 'audio-';
/** Sound that is encoded here: stereo AAC, which every device plays. */
export const ALTERNATE_AUDIO_CODEC = 'mp4a.40.2';
export const ALTERNATE_AUDIO_CHANNELS = 2;
export const DEFAULT_ALTERNATE_BITRATE = 128_000;
/** The most sound tracks one video has. */
export const MAX_AUDIO_TRACKS = 32;

/** The sound stream players start with: the one the file marks, or the first. */
export function mainAudioStream(info: Pick<MediaInfo, 'audio'>): AudioStreamInfo | null {
  return info.audio.find((stream) => stream.isDefault) ?? info.audio[0] ?? null;
}

/** A language tag for players, from what a media file says: "en" for "eng". "und" when unknown. */
export function audioLanguage(tag: string | null | undefined): string {
  const known = knownLanguage(tag);
  if (known) {
    return known.code;
  }
  return tag && /^[a-z]{2,3}$/.test(tag) ? tag : 'und';
}

/** What a track is called when nobody named it: the language in itself, or the tag. */
export function audioLabel(language: string, position: number): string {
  if (language === 'und') {
    return `Track ${position}`;
  }
  return languageNameOf(language) ?? knownLanguage(language)?.name ?? language;
}

/** A sound stream of the source as a track of the video. */
export interface AudioTrackPlan {
  /** Position among the source's sound streams, for "-map 0:a:N". */
  streamIndex: number;
  /** Folder of the track inside the HLS output. */
  folder: string;
  language: string;
  label: string;
  isDefault: boolean;
  /** How many channels the track will have. */
  channels: number;
  /**
   * Whether the stream is taken as it is. AAC is, when the picture is too:
   * surround stays surround and nothing is lost. Everything else is encoded
   * to stereo AAC.
   */
  copy: boolean;
  /** The codec the track will have, as ffprobe names it. */
  codec: string;
  /** The profile of a copied AAC stream, for the codec string of the playlist. */
  profile: string | null;
}

/**
 * Makes a track of every sound stream of a source, in the order of the file.
 * Streams beyond the limit, and streams with nothing to play, are left out.
 *
 * @param copyCompatible Whether streams that every device plays are taken as
 *   they are. True when the picture is copied too.
 */
export function planAudio(
  info: Pick<MediaInfo, 'audio'>,
  copyCompatible = false,
): {
  tracks: AudioTrackPlan[];
  skipped: string[];
} {
  const main = mainAudioStream(info);
  const skipped: string[] = [];
  const tracks: AudioTrackPlan[] = [];
  for (const stream of info.audio) {
    if (tracks.length >= MAX_AUDIO_TRACKS) {
      skipped.push(
        `Sound stream ${stream.index + 1} was left out: a video has ${MAX_AUDIO_TRACKS}`,
      );
      continue;
    }
    if (stream.channels === 0) {
      skipped.push(`Sound stream ${stream.index + 1} (${stream.codec}) has no channels to play`);
      continue;
    }
    const language = audioLanguage(stream.language);
    const copy = copyCompatible && stream.codec === 'aac';
    tracks.push({
      streamIndex: stream.index,
      folder: `${AUDIO_FOLDER_PREFIX}${stream.index}-${language}`,
      language,
      label: audioLabel(language, tracks.length + 1),
      isDefault: stream === main,
      channels: copy ? stream.channels : ALTERNATE_AUDIO_CHANNELS,
      copy,
      codec: 'aac',
      profile: copy ? stream.profile : 'LC',
    });
  }
  // The stream the file marks may be one that was left out.
  if (tracks.length > 0 && !tracks.some((track) => track.isDefault)) {
    (tracks[0] as AudioTrackPlan).isDefault = true;
  }
  return { tracks: withUniqueAudioLabels(tracks), skipped };
}

/** Gives every track a name no other has, as HLS requires inside a group. */
export function withUniqueAudioLabels<T extends { label: string }>(tracks: readonly T[]): T[] {
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

export interface AudioCommandInput {
  /** A media file with sound: the source of the video, or an added sound file. */
  sourcePath: string;
  /** Position of the stream among the sound streams of that file. */
  streamIndex: number;
  /** Empty folder the playlist and segments of the track are written to. */
  outputDirectory: string;
  segmentSeconds: number;
  /** Bits per second, for sound that is encoded. */
  bitrate: number;
  /** True takes the stream as it is. It has to be AAC. */
  copy?: boolean;
  /** Left out, the segments are not encrypted. */
  encryption?: HlsEncryption;
}

/**
 * Builds the FFmpeg arguments that make one sound stream into a sound-only
 * HLS rendition, in the same kind of segments as the picture: encoded to
 * stereo AAC, or taken as it is.
 */
export function buildAudioArgs(input: AudioCommandInput): string[] {
  const segments = input.encryption
    ? [
        '-hls_segment_type',
        'mpegts',
        '-hls_key_info_file',
        input.encryption.keyInfoPath,
        '-hls_segment_filename',
        path.join(input.outputDirectory, 'seg-%05d.ts'),
      ]
    : [
        '-hls_segment_type',
        'fmp4',
        '-hls_fmp4_init_filename',
        'init.mp4',
        '-hls_segment_filename',
        path.join(input.outputDirectory, 'seg-%05d.m4s'),
      ];
  return [
    '-i',
    input.sourcePath,
    '-map',
    `0:a:${input.streamIndex}`,
    '-vn',
    '-sn',
    '-dn',
    ...(input.copy
      ? ['-c:a', 'copy']
      : ['-c:a', 'aac', '-ac', String(ALTERNATE_AUDIO_CHANNELS), '-b:a', String(input.bitrate)]),
    '-f',
    'hls',
    '-hls_time',
    String(input.segmentSeconds),
    '-hls_playlist_type',
    'vod',
    '-hls_flags',
    'independent_segments',
    ...segments,
    path.join(input.outputDirectory, MEDIA_PLAYLIST_NAME),
  ];
}

/** A track as the multivariant playlist names it. */
export interface AudioMediaEntry {
  /**
   * Folder of the track inside the HLS output. Null for sound inside the
   * segments of the picture, in a video from before sound was kept apart.
   */
  folder: string | null;
  language: string;
  label: string;
  isDefault: boolean;
  channels: number;
}

/** Builds the EXT-X-MEDIA lines that list the sound tracks of a video. */
export function audioMediaLines(tracks: readonly AudioMediaEntry[]): string[] {
  return tracks.map((track) =>
    [
      '#EXT-X-MEDIA:TYPE=AUDIO',
      `GROUP-ID=${quoted(AUDIO_GROUP_ID)}`,
      `NAME=${quoted(track.label)}`,
      ...(track.language === 'und' ? [] : [`LANGUAGE=${quoted(track.language)}`]),
      `DEFAULT=${track.isDefault ? 'YES' : 'NO'}`,
      'AUTOSELECT=YES',
      ...(track.channels > 0 ? [`CHANNELS=${quoted(String(track.channels))}`] : []),
      // Without an address the sound is the one inside the video segments.
      ...(track.folder ? [`URI=${quoted(`${track.folder}/${MEDIA_PLAYLIST_NAME}`)}`] : []),
    ].join(','),
  );
}

const withoutSoundCodec = (line: string): string =>
  line.replace(/CODECS="([^"]*)"/, (_match, codecs: string) => {
    const kept = codecs.split(',').filter((codec) => !codec.startsWith('mp4a'));
    return `CODECS="${kept.join(',')}"`;
  });

const withSoundCodec = (line: string, codec: string): string =>
  line.replace(/CODECS="([^"]*)"/, (_match, codecs: string) =>
    codecs.includes('mp4a') ? `CODECS="${codecs}"` : `CODECS="${codecs},${codec}"`,
  );

/**
 * Puts a list of sound tracks into a multivariant playlist, in place of the
 * ones it lists, and points every quality at them. The qualities stay as
 * they are otherwise.
 *
 * A video with its sound inside the picture, from before sound was kept
 * apart, is left exactly as it is: it needs no list and cannot take one.
 *
 * @param codec The codec string of the sound, for qualities that name none yet.
 */
export function withAudioTracks(
  master: string,
  tracks: readonly AudioMediaEntry[],
  codec: string = ALTERNATE_AUDIO_CODEC,
): string {
  if (tracks.some((track) => track.folder === null)) {
    return master;
  }
  // The sound of a video that listed tracks before was never inside its picture.
  const hadTracks = master.split('\n').some((line) => line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'));
  const group = `,AUDIO=${quoted(AUDIO_GROUP_ID)}`;

  const lines = master
    .split('\n')
    .filter((line) => !line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'))
    .map((line) => {
      if (!line.startsWith('#EXT-X-STREAM-INF:')) {
        return line;
      }
      const bare = line.replace(/,AUDIO="[^"]*"/, '');
      if (tracks.length > 0) {
        return `${withSoundCodec(bare, codec)}${group}`;
      }
      // The last track is gone: the qualities are the picture alone again.
      return hadTracks ? withoutSoundCodec(bare) : bare;
    });
  const first = lines.findIndex(
    (line) => line.startsWith('#EXT-X-STREAM-INF:') || line.startsWith('#EXT-X-MEDIA:'),
  );
  lines.splice(first === -1 ? lines.length : first, 0, ...audioMediaLines(tracks));
  return lines.join('\n');
}
