// SPDX-License-Identifier: AGPL-3.0-only
import {
  audioLabel,
  audioLanguage,
  audioMediaLines,
  buildAudioArgs,
  mainAudioStream,
  MAX_AUDIO_TRACKS,
  planAudio,
  withAudioTracks,
} from './audio.js';
import type { AudioStreamInfo } from './media-info.js';

const stream = (index: number, extra: Partial<AudioStreamInfo> = {}): AudioStreamInfo => ({
  index,
  codec: 'aac',
  profile: 'LC',
  channels: 2,
  language: null,
  isDefault: false,
  ...extra,
});

const MASTER = [
  '#EXTM3U',
  '#EXT-X-VERSION:7',
  '#EXT-X-INDEPENDENT-SEGMENTS',
  '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Deutsch",LANGUAGE="de",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,URI="subs/0-de/playlist.m3u8"',
  '#EXT-X-STREAM-INF:BANDWIDTH=900000,AVERAGE-BANDWIDTH=800000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",SUBTITLES="subs"',
  '720p/playlist.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=500000,AVERAGE-BANDWIDTH=400000,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2",SUBTITLES="subs"',
  '360p/playlist.m3u8',
  '',
].join('\n');

const inVideo = { folder: null, language: 'en', label: 'English', isDefault: true, channels: 6 };
const german = {
  folder: 'audio-1-de',
  language: 'de',
  label: 'Deutsch',
  isDefault: false,
  channels: 2,
};

describe('mainAudioStream', () => {
  it('is the stream the file marks, or the first', () => {
    expect(mainAudioStream({ audio: [stream(0), stream(1, { isDefault: true })] })?.index).toBe(1);
    expect(mainAudioStream({ audio: [stream(0), stream(1)] })?.index).toBe(0);
    expect(mainAudioStream({ audio: [] })).toBeNull();
  });
});

describe('audioLanguage and audioLabel', () => {
  it('turns what a file says into a tag for players', () => {
    expect(audioLanguage('eng')).toBe('en');
    expect(audioLanguage('ger')).toBe('de');
    expect(audioLanguage('fi')).toBe('fi');
    expect(audioLanguage(null)).toBe('und');
    expect(audioLanguage('English')).toBe('und');
  });

  it('names a track by its language in itself', () => {
    expect(audioLabel('de', 1)).toBe('Deutsch');
    expect(audioLabel('fi', 1)).toBe('fi');
    expect(audioLabel('und', 3)).toBe('Track 3');
  });
});

describe('planAudio', () => {
  const audio = [
    stream(0, { language: 'ger' }),
    stream(1, { language: 'eng', isDefault: true, channels: 6, profile: 'HE-AAC' }),
    stream(2, { language: 'ger', codec: 'ac3', channels: 6, profile: null }),
  ];

  it('gives every stream a folder, in the order of the file, and encodes to stereo', () => {
    const plan = planAudio({ audio });
    expect(plan.skipped).toEqual([]);
    expect(plan.tracks.map((track) => [track.folder, track.label, track.isDefault])).toEqual([
      ['audio-0-de', 'Deutsch', false],
      ['audio-1-en', 'English', true],
      // The same language twice: the names differ, as HLS asks.
      ['audio-2-de', 'Deutsch 2', false],
    ]);
    for (const track of plan.tracks) {
      expect(track).toMatchObject({ copy: false, channels: 2, codec: 'aac', profile: 'LC' });
    }
  });

  it('takes AAC as it is where the picture is copied too, surround and all', () => {
    const plan = planAudio({ audio }, true);
    expect(plan.tracks.map((track) => [track.copy, track.channels, track.profile])).toEqual([
      [true, 2, 'LC'],
      [true, 6, 'HE-AAC'],
      // Dolby Digital does not play everywhere, so it is encoded.
      [false, 2, 'LC'],
    ]);
  });

  it('has nothing to plan for a silent file', () => {
    expect(planAudio({ audio: [] })).toEqual({ tracks: [], skipped: [] });
  });

  it('leaves out streams without channels and those beyond the limit', () => {
    const plan = planAudio({
      audio: [stream(0, { channels: 0, isDefault: true }), stream(1), stream(2)],
    });
    expect(plan.tracks.map((track) => track.streamIndex)).toEqual([1, 2]);
    // The stream the file marks is gone: players start with the first that is left.
    expect(plan.tracks.map((track) => track.isDefault)).toEqual([true, false]);
    expect(plan.skipped).toEqual(['Sound stream 1 (aac) has no channels to play']);

    const many = Array.from({ length: MAX_AUDIO_TRACKS + 2 }, (_, index) => stream(index));
    const full = planAudio({ audio: many });
    expect(full.tracks).toHaveLength(MAX_AUDIO_TRACKS);
    expect(full.skipped).toHaveLength(2);
  });
});

describe('buildAudioArgs', () => {
  const input = {
    sourcePath: '/in/film.mkv',
    streamIndex: 2,
    outputDirectory: '/out/audio-2-de',
    segmentSeconds: 4,
    bitrate: 128_000,
  };

  it('encodes one stream to stereo AAC without picture, in MP4 segments', () => {
    const args = buildAudioArgs(input);
    expect(args.join(' ')).toContain('-map 0:a:2 -vn -sn -dn -c:a aac -ac 2 -b:a 128000');
    expect(args.join(' ')).toContain('-hls_time 4 -hls_playlist_type vod');
    expect(args.join(' ')).toContain('-hls_segment_type fmp4');
    expect(args).toContain('/out/audio-2-de/seg-%05d.m4s');
    expect(args.at(-1)).toBe('/out/audio-2-de/playlist.m3u8');
    expect(args).not.toContain('-hls_key_info_file');
  });

  it('takes a stream as it is when asked to', () => {
    const args = buildAudioArgs({ ...input, copy: true }).join(' ');
    expect(args).toContain('-map 0:a:2 -vn -sn -dn -c:a copy -f hls');
    expect(args).not.toContain('-b:a');
  });

  it('writes encrypted transport stream segments for an encrypted video', () => {
    const args = buildAudioArgs({ ...input, encryption: { keyInfoPath: '/keys/key.info' } });
    expect(args.join(' ')).toContain('-hls_segment_type mpegts -hls_key_info_file /keys/key.info');
    expect(args).toContain('/out/audio-2-de/seg-%05d.ts');
  });
});

describe('audioMediaLines', () => {
  it('names the sound inside the video without an address, and the others with one', () => {
    expect(audioMediaLines([inVideo, german])).toEqual([
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="6"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Deutsch",LANGUAGE="de",DEFAULT=NO,AUTOSELECT=YES,CHANNELS="2",URI="audio-1-de/playlist.m3u8"',
    ]);
  });

  it('says no language for a track whose language is not known, and keeps names harmless', () => {
    const [line] = audioMediaLines([
      { ...german, language: 'und', label: 'Director\'s "cut"\nnotes', channels: 0 },
    ]);
    expect(line).toBe(
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Director\'s  cut  notes",DEFAULT=NO,AUTOSELECT=YES,URI="audio-1-de/playlist.m3u8"',
    );
  });
});

describe('withAudioTracks', () => {
  /** The qualities of a video whose sound is kept apart: the picture alone. */
  const PICTURE = MASTER.replaceAll(',mp4a.40.2', '');
  const english = { ...inVideo, folder: 'audio-0-en' };

  it('leaves a video with its sound inside the picture exactly as it is', () => {
    expect(withAudioTracks(MASTER, [inVideo])).toBe(MASTER);
    expect(withAudioTracks(MASTER, [inVideo, german])).toBe(MASTER);
    // Nothing is known about its sound: nothing is touched.
    expect(withAudioTracks(MASTER, [])).toBe(MASTER);
  });

  it('lists the tracks first, points every quality at them and names their codec', () => {
    const lines = withAudioTracks(PICTURE, [english, german]).split('\n');
    expect(lines.slice(3, 6)).toEqual([
      ...audioMediaLines([english, german]),
      expect.stringContaining('TYPE=SUBTITLES'),
    ]);
    const qualities = lines.filter((line) => line.startsWith('#EXT-X-STREAM-INF'));
    expect(qualities).toHaveLength(2);
    for (const line of qualities) {
      expect(line).toMatch(/CODECS="avc1\.[0-9a-f]+,mp4a\.40\.2",SUBTITLES="subs",AUDIO="audio"$/);
    }
  });

  it('lists a single track too: its sound is not in the picture', () => {
    const one = withAudioTracks(PICTURE, [english]);
    expect(one).toContain('URI="audio-0-en/playlist.m3u8"');
    expect(one).toContain('AUDIO="audio"');
  });

  it('names the codec it is given, such as that of a copied stream', () => {
    expect(withAudioTracks(PICTURE, [english], 'mp4a.40.5')).toContain(
      'CODECS="avc1.64001f,mp4a.40.5"',
    );
  });

  it('gives the same playlist when done twice, and follows what is added and taken away', () => {
    const one = withAudioTracks(PICTURE, [english]);
    const two = withAudioTracks(one, [english, german]);
    expect(withAudioTracks(two, [english, german])).toBe(two);
    expect(withAudioTracks(two, [english])).toBe(one);
    // The last track gone: the qualities are the picture alone again.
    expect(withAudioTracks(one, [])).toBe(PICTURE);
  });
});
