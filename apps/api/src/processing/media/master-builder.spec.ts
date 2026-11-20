// SPDX-License-Identifier: AGPL-3.0-only
import {
  aacCodecString,
  avcCodecString,
  avcCodecStringFromProfile,
  buildMasterPlaylist,
  type MasterVariant,
  measureBitrates,
  parseMediaPlaylist,
} from './master-builder.js';
import type { SubtitleTrackPlan } from './subtitles.js';

const PLAYLIST = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:4
#EXT-X-MAP:URI="init_0.mp4"
#EXTINF:4.000000,
seg-00000.m4s
#EXTINF:4.000000,
seg-00001.m4s
#EXTINF:1.033333,
seg-00002.m4s
#EXT-X-ENDLIST
`;

function variant(name: string, height: number, peak: number): MasterVariant {
  return {
    name,
    width: Math.round((height * 16) / 9),
    height,
    bitrates: { peak, average: Math.round(peak * 0.8) },
    codecs: ['avc1.64001f', 'mp4a.40.2'],
    frameRate: 30,
  };
}

describe('parseMediaPlaylist', () => {
  it('reads the initialization segment and the segments with their durations', () => {
    expect(parseMediaPlaylist(PLAYLIST)).toEqual({
      initUri: 'init_0.mp4',
      encrypted: false,
      segments: [
        { uri: 'seg-00000.m4s', duration: 4 },
        { uri: 'seg-00001.m4s', duration: 4 },
        { uri: 'seg-00002.m4s', duration: 1.033333 },
      ],
    });
  });

  it('handles a playlist without segments', () => {
    expect(parseMediaPlaylist('#EXTM3U\n#EXT-X-ENDLIST\n')).toEqual({
      initUri: null,
      encrypted: false,
      segments: [],
    });
  });
});

describe('parseMediaPlaylist with encryption', () => {
  it('recognizes encrypted MPEG-TS playlists', () => {
    const playlist = parseMediaPlaylist(
      [
        '#EXTM3U',
        '#EXT-X-KEY:METHOD=AES-128,URI="../key",IV=0x000102030405060708090a0b0c0d0e0f',
        '#EXTINF:4.000000,',
        'seg-00000.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    );

    expect(playlist.encrypted).toBe(true);
    expect(playlist.initUri).toBeNull();
    expect(playlist.segments).toEqual([{ uri: 'seg-00000.ts', duration: 4 }]);
  });
});

describe('measureBitrates', () => {
  it('computes the peak segment bitrate and the overall average', () => {
    const bitrates = measureBitrates([
      { bytes: 500_000, duration: 4 },
      { bytes: 1_000_000, duration: 4 },
      { bytes: 250_000, duration: 2 },
    ]);

    expect(bitrates.peak).toBe(2_000_000);
    expect(bitrates.average).toBe(1_400_000);
  });

  it('ignores a very short last segment for the peak', () => {
    const bitrates = measureBitrates([
      { bytes: 500_000, duration: 4 },
      { bytes: 50_000, duration: 0.03 },
    ]);

    expect(bitrates.peak).toBeLessThan(1_200_000);
  });

  it('returns zero without segments', () => {
    expect(measureBitrates([])).toEqual({ peak: 0, average: 0 });
  });
});

describe('codec strings', () => {
  it('reads the H.264 codec string from the avcC box', () => {
    const init = Buffer.concat([
      Buffer.from('....ftyp....moov....', 'latin1'),
      Buffer.from('avcC', 'latin1'),
      Buffer.from([0x01, 0x64, 0x00, 0x1f, 0xff]),
    ]);

    expect(avcCodecString(init)).toBe('avc1.64001f');
  });

  it('includes the constraint flags', () => {
    const init = Buffer.concat([
      Buffer.from('avcC', 'latin1'),
      Buffer.from([0x01, 0x42, 0xc0, 0x1e]),
    ]);

    expect(avcCodecString(init)).toBe('avc1.42c01e');
  });

  it('returns null when there is no H.264 configuration', () => {
    expect(avcCodecString(Buffer.from('no such box here'))).toBeNull();
    expect(avcCodecString(Buffer.from('avcC'))).toBeNull();
  });

  it('builds the H.264 codec string from profile and level', () => {
    expect(avcCodecStringFromProfile('High', 31)).toBe('avc1.64001f');
    expect(avcCodecStringFromProfile('Main', 30)).toBe('avc1.4d401e');
    expect(avcCodecStringFromProfile('Constrained Baseline', 30)).toBe('avc1.42e01e');
    expect(avcCodecStringFromProfile('Unknown', 30)).toBeNull();
    expect(avcCodecStringFromProfile('High', null)).toBeNull();
  });

  it('maps AAC profiles', () => {
    expect(aacCodecString('LC')).toBe('mp4a.40.2');
    expect(aacCodecString('HE-AAC')).toBe('mp4a.40.5');
    expect(aacCodecString('HE-AACv2')).toBe('mp4a.40.29');
    expect(aacCodecString(null)).toBe('mp4a.40.2');
  });
});

describe('buildMasterPlaylist', () => {
  it('lists the qualities from the highest down with measured bitrates', () => {
    const master = buildMasterPlaylist([
      variant('360p', 360, 900_000),
      variant('720p', 720, 3_000_000),
    ]);
    const lines = master.split('\n');

    expect(lines.slice(0, 3)).toEqual([
      '#EXTM3U',
      '#EXT-X-VERSION:7',
      '#EXT-X-INDEPENDENT-SEGMENTS',
    ]);
    expect(lines[3]).toBe(
      '#EXT-X-STREAM-INF:BANDWIDTH=3000000,AVERAGE-BANDWIDTH=2400000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",FRAME-RATE=30.000',
    );
    expect(lines[4]).toBe('720p/playlist.m3u8');
    expect(lines[6]).toBe('360p/playlist.m3u8');
    expect(master.endsWith('\n')).toBe(true);
  });

  it('adds subtitle tracks before the qualities and references them on each', () => {
    const tracks: SubtitleTrackPlan[] = [
      {
        streamIndex: 0,
        slug: '0-en',
        language: 'en',
        label: 'English',
        isDefault: false,
        isForced: false,
      },
      {
        streamIndex: 1,
        slug: '1-de',
        language: 'de',
        label: 'Deutsch',
        isDefault: false,
        isForced: true,
      },
    ];
    const master = buildMasterPlaylist(
      [variant('720p', 720, 3_000_000), variant('360p', 360, 900_000)],
      tracks,
    );

    expect(master).toContain(
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,URI="subs/0-en/playlist.m3u8"',
    );
    expect(master).toContain('NAME="Deutsch",LANGUAGE="de",DEFAULT=YES,AUTOSELECT=YES,FORCED=YES');
    expect(master.match(/,SUBTITLES="subs"/g)).toHaveLength(2);
    expect(master.indexOf('#EXT-X-MEDIA')).toBeLessThan(master.indexOf('#EXT-X-STREAM-INF'));
  });

  it('leaves out the frame rate when it is unknown', () => {
    expect(buildMasterPlaylist([{ ...variant('720p', 720, 1), frameRate: null }])).not.toContain(
      'FRAME-RATE',
    );
  });
});
