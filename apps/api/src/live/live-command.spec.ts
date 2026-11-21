// SPDX-License-Identifier: AGPL-3.0-only
import type { MediaInfo } from '../processing/media/media-info.js';
import {
  buildLiveArgs,
  buildProbeArgs,
  planOutput,
  UnsupportedSourceError,
} from './live-command.js';
import { parseSource } from './live-source.js';

function info(video: string | null, audio: { codec: string; channels: number }[] = []): MediaInfo {
  return {
    container: 'mpegts',
    durationMs: null,
    sizeBytes: null,
    bitrate: null,
    video: video
      ? {
          index: 0,
          codec: video,
          width: 1920,
          height: 1080,
          frameRate: 25,
          pixelFormat: 'yuv420p',
          profile: 'High',
          level: 40,
          rotation: 0,
        }
      : null,
    audio: audio.map((stream, index) => ({
      index,
      codec: stream.codec,
      profile: null,
      channels: stream.channels,
      language: null,
      isDefault: false,
    })),
    subtitles: [],
  };
}

/** Plans a channel that is passed through. */
const passThrough = (source: MediaInfo) => planOutput(source, { mode: 'COPY', qualities: [] });
const transcode = (source: MediaInfo, qualities: number[] = [720, 360]) =>
  planOutput(source, { mode: 'TRANSCODE', qualities });

const settings = {
  directory: '/var/live/abc',
  segmentSeconds: 4,
  playlistSegments: 6,
  runId: 'run1',
  preset: 'veryfast',
};
const source = parseSource('udp://239.1.1.1:5000');

describe('planOutput', () => {
  it('passes H.264 with AAC on untouched', () => {
    expect(passThrough(info('h264', [{ codec: 'aac', channels: 2 }]))).toMatchObject({
      audio: 'copy',
      video: { kind: 'copy', tagHevc: false },
      streams: { videoCodec: 'h264', width: 1920, height: 1080, audioCodec: 'aac' },
    });
  });

  it('encodes audio browsers cannot play, down to stereo', () => {
    expect(passThrough(info('h264', [{ codec: 'ac3', channels: 6 }]))).toMatchObject({
      audio: 'aac',
      audioChannels: 2,
    });
    expect(passThrough(info('h264', [{ codec: 'mp2', channels: 1 }]))).toMatchObject({
      audio: 'aac',
      audioChannels: 1,
    });
  });

  it('tags HEVC for Apple players', () => {
    expect(passThrough(info('hevc')).video).toEqual({ kind: 'copy', tagHevc: true });
  });

  it('accepts a source without audio', () => {
    expect(passThrough(info('h264')).audio).toBe('none');
  });

  it('refuses video that would need re-encoding', () => {
    expect(() => passThrough(info('mpeg2video'))).toThrow(UnsupportedSourceError);
    expect(() => passThrough(info('mpeg2video'))).toThrow('MPEG2VIDEO');
    expect(() => passThrough(info(null, [{ codec: 'aac', channels: 2 }]))).toThrow('no video');
  });
});

describe('planOutput for a transcoded channel', () => {
  it('takes any video and encodes the audio with it', () => {
    const plan = transcode(info('mpeg2video', [{ codec: 'aac', channels: 2 }]));
    expect(plan.audio).toBe('aac');
    expect(plan.video).toMatchObject({
      kind: 'transcode',
      renditions: [{ name: '720p' }, { name: '360p' }],
    });
  });

  it('still needs a picture', () => {
    expect(() => transcode(info(null, [{ codec: 'aac', channels: 2 }]))).toThrow('no video');
  });

  it('tells a passed-through channel with other video to switch', () => {
    expect(() => passThrough(info('mpeg2video'))).toThrow('Switch the channel to transcoding');
  });
});

describe('buildLiveArgs', () => {
  const pair = (args: string[], flag: string): string | undefined => args[args.indexOf(flag) + 1];

  it('copies the video and writes fMP4 segments beside the playlist', () => {
    const args = buildLiveArgs(source, passThrough(info('h264')), settings);
    expect(pair(args, '-i')).toBe('udp://239.1.1.1:5000');
    expect(pair(args, '-c:v')).toBe('copy');
    expect(pair(args, '-hls_segment_type')).toBe('fmp4');
    expect(pair(args, '-hls_time')).toBe('4');
    expect(pair(args, '-hls_list_size')).toBe('6');
    expect(pair(args, '-hls_fmp4_init_filename')).toBe('init-run1.mp4');
    expect(pair(args, '-hls_segment_filename')).toBe('/var/live/abc/seg-%d.m4s');
    expect(args.at(-1)).toBe('/var/live/abc/index.m3u8');
    expect(args).not.toContain('-c:a');
  });

  it('puts the options of the source in front of it', () => {
    const args = buildLiveArgs(source, passThrough(info('h264')), settings);
    expect(args.indexOf('-protocol_whitelist')).toBeLessThan(args.indexOf('-i'));
  });

  it('numbers segments by the clock, deletes old ones and never ends the playlist', () => {
    const args = buildLiveArgs(source, passThrough(info('h264')), settings);
    expect(pair(args, '-hls_start_number_source')).toBe('epoch');
    expect(pair(args, '-hls_flags')?.split('+')).toEqual(
      expect.arrayContaining(['delete_segments', 'temp_file', 'omit_endlist']),
    );
  });

  it('handles the audio as planned', () => {
    const copy = buildLiveArgs(
      source,
      passThrough(info('h264', [{ codec: 'aac', channels: 2 }])),
      settings,
    );
    expect(pair(copy, '-c:a')).toBe('copy');

    const encode = buildLiveArgs(
      source,
      passThrough(info('hevc', [{ codec: 'eac3', channels: 6 }])),
      settings,
    );
    expect(pair(encode, '-c:a')).toBe('aac');
    expect(pair(encode, '-ac')).toBe('2');
    expect(pair(encode, '-tag:v')).toBe('hvc1');
  });
});

describe('buildLiveArgs for a transcoded channel', () => {
  const pair = (args: string[], flag: string): string | undefined => args[args.indexOf(flag) + 1];
  const args = buildLiveArgs(
    source,
    transcode(info('h264', [{ codec: 'ac3', channels: 6 }])),
    settings,
  );

  it('scales the picture once per quality, after making interlaced pictures whole', () => {
    const filter = pair(args, '-filter_complex') as string;
    expect(filter).toContain('[0:v:0]yadif=deint=interlaced,split=2[s0][s1]');
    expect(filter).toContain(':h=720,setsar=1[v0]');
    expect(filter).toContain(':h=360,setsar=1[v1]');
  });

  it('encodes H.264 with a bitrate and a ceiling per quality', () => {
    expect(pair(args, '-c:v')).toBe('libx264');
    expect(pair(args, '-preset')).toBe('veryfast');
    expect(pair(args, '-b:v:0')).toBe('2800k');
    expect(pair(args, '-maxrate:v:0')).toBe('3080k');
    expect(pair(args, '-profile:v:0')).toBe('high');
    expect(pair(args, '-b:v:1')).toBe('800k');
    expect(pair(args, '-profile:v:1')).toBe('main');
  });

  it('puts key frames at the same moments in every quality', () => {
    expect(pair(args, '-force_key_frames')).toBe('expr:gte(t,n_forced*2)');
    expect(pair(args, '-sc_threshold')).toBe('0');
    const odd = buildLiveArgs(source, transcode(info('h264')), { ...settings, segmentSeconds: 3 });
    expect(pair(odd, '-force_key_frames')).toBe('expr:gte(t,n_forced*1.5)');
  });

  it('writes a playlist per quality and one that lists them under the usual name', () => {
    expect(pair(args, '-var_stream_map')).toBe('v:0,a:0,name:720p v:1,a:1,name:360p');
    expect(pair(args, '-master_pl_name')).toBe('index.m3u8');
    expect(pair(args, '-hls_fmp4_init_filename')).toBe('init-run1-%v.mp4');
    expect(pair(args, '-hls_segment_filename')).toBe('/var/live/abc/seg-%v-%d.m4s');
    expect(args.at(-1)).toBe('/var/live/abc/q-%v.m3u8');
    expect(args.filter((arg) => arg === '0:a:0')).toHaveLength(2);
    expect(pair(args, '-ac')).toBe('2');
  });

  it('leaves the audio out when the source has none', () => {
    const silent = buildLiveArgs(source, transcode(info('h264')), settings);
    expect(pair(silent, '-var_stream_map')).toBe('v:0,name:720p v:1,name:360p');
    expect(silent).not.toContain('-c:a');
    expect(silent).not.toContain('0:a:0');
  });
});

describe('buildProbeArgs', () => {
  it('asks for JSON and ends with the address', () => {
    const args = buildProbeArgs(source);
    expect(args).toEqual(expect.arrayContaining(['-print_format', 'json', '-show_streams']));
    expect(args.at(-1)).toBe(source.url);
  });
});
