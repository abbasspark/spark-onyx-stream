// SPDX-License-Identifier: AGPL-3.0-only
import type { MediaInfo, SubtitleStreamInfo } from './media-info.js';
import {
  buildSubtitleArgs,
  buildSubtitlePlaylist,
  planSubtitles,
  subtitleMediaLines,
  withSubtitleTracks,
  withUniqueLabels,
} from './subtitles.js';
import { buildMasterPlaylist } from './master-builder.js';

function media(subtitles: Partial<SubtitleStreamInfo>[]): MediaInfo {
  return {
    container: 'matroska,webm',
    durationMs: 60_000,
    sizeBytes: 1,
    bitrate: 1,
    video: null,
    audio: [],
    subtitles: subtitles.map((stream, index) => ({
      index,
      codec: 'subrip',
      language: null,
      title: null,
      isDefault: false,
      isForced: false,
      ...stream,
    })),
  };
}

describe('planSubtitles', () => {
  it('maps language codes and uses the title as the label', () => {
    const plan = planSubtitles(
      media([
        { language: 'eng', isDefault: true },
        { language: 'ger', title: 'Deutsch (SDH)' },
      ]),
    );

    expect(plan.tracks).toEqual([
      {
        streamIndex: 0,
        slug: '0-en',
        language: 'en',
        label: 'English',
        isDefault: true,
        isForced: false,
      },
      {
        streamIndex: 1,
        slug: '1-de',
        language: 'de',
        label: 'Deutsch (SDH)',
        isDefault: false,
        isForced: false,
      },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('skips picture-based subtitles and says why', () => {
    const plan = planSubtitles(
      media([{ codec: 'hdmv_pgs_subtitle', language: 'eng' }, { language: 'fre' }]),
    );

    expect(plan.tracks.map((track) => track.slug)).toEqual(['0-fr']);
    expect(plan.tracks[0]?.streamIndex).toBe(1);
    expect(plan.skipped[0]).toContain('hdmv_pgs_subtitle');
  });

  it('gives tracks without a language a neutral label', () => {
    const plan = planSubtitles(media([{}, {}]));

    expect(plan.tracks.map((track) => track.label)).toEqual(['Track 1', 'Track 2']);
    expect(plan.tracks.map((track) => track.language)).toEqual(['und', 'und']);
  });

  it('keeps labels unique', () => {
    const plan = planSubtitles(
      media([{ language: 'eng' }, { language: 'eng' }, { language: 'eng' }]),
    );

    expect(plan.tracks.map((track) => track.label)).toEqual(['English', 'English 2', 'English 3']);
    expect(new Set(plan.tracks.map((track) => track.slug)).size).toBe(3);
  });

  it('passes unknown but well-formed language codes through', () => {
    expect(planSubtitles(media([{ language: 'swe' }])).tracks[0]).toMatchObject({
      language: 'swe',
      label: 'swe',
    });
  });
});

describe('buildSubtitleArgs', () => {
  it('converts the chosen stream to WebVTT', () => {
    expect(buildSubtitleArgs('/s.mkv', 2, '/o/subtitles.vtt')).toEqual([
      '-i',
      '/s.mkv',
      '-map',
      '0:s:2',
      '-c:s',
      'webvtt',
      '-y',
      '/o/subtitles.vtt',
    ]);
  });
});

describe('buildSubtitlePlaylist', () => {
  it('presents the file as one segment of the full duration', () => {
    const playlist = buildSubtitlePlaylist(13_033);

    expect(playlist).toContain('#EXT-X-TARGETDURATION:14');
    expect(playlist).toContain('#EXTINF:13.033,\nsubtitles.vtt');
    expect(playlist).toContain('#EXT-X-ENDLIST');
  });
});

describe('subtitleMediaLines', () => {
  it('builds one line per track', () => {
    const tracks = planSubtitles(
      media([{ language: 'eng' }, { language: 'ger', isForced: true }]),
    ).tracks;

    expect(subtitleMediaLines(tracks)).toEqual([
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,URI="subs/0-en/playlist.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Deutsch",LANGUAGE="de",DEFAULT=YES,AUTOSELECT=YES,FORCED=YES,URI="subs/1-de/playlist.m3u8"',
    ]);
  });

  it('keeps quotes and line breaks in a title from breaking the playlist', () => {
    const hostile = planSubtitles(media([{ title: 'Eng"lish\n#EXT-X-ENDLIST' }])).tracks;
    const lines = subtitleMediaLines(hostile);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('NAME="Eng lish #EXT-X-ENDLIST"');
    expect(lines[0]).not.toContain('\n');
  });
});

describe('withSubtitleTracks', () => {
  const variant = {
    name: '720p',
    width: 1280,
    height: 720,
    bitrates: { peak: 3_000_000, average: 2_500_000 },
    codecs: ['avc1.64001f', 'mp4a.40.2'],
    frameRate: 25,
  };
  const german = {
    streamIndex: 0,
    slug: '0-de',
    language: 'de',
    label: 'Deutsch',
    isDefault: false,
    isForced: false,
  };
  const arabic = { ...german, slug: 'u-1', language: 'ar', label: 'العربية' };

  it('gives the same playlist as building it anew', () => {
    const bare = buildMasterPlaylist([variant]);
    const one = buildMasterPlaylist([variant], [german]);
    const two = buildMasterPlaylist([variant], [german, arabic]);
    expect(withSubtitleTracks(bare, [german])).toBe(one);
    expect(withSubtitleTracks(one, [german, arabic])).toBe(two);
    expect(withSubtitleTracks(two, [german])).toBe(one);
    expect(withSubtitleTracks(two, [])).toBe(bare);
    expect(withSubtitleTracks(bare, [])).toBe(bare);
  });
});

describe('withUniqueLabels', () => {
  it('numbers names that are taken', () => {
    expect(
      withUniqueLabels([{ label: 'English' }, { label: 'English' }, { label: 'English' }]).map(
        (track) => track.label,
      ),
    ).toEqual(['English', 'English 2', 'English 3']);
  });
});
